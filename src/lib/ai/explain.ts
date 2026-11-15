import type { RunResult } from "@/lib/engine/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const SYSTEM = `You explain crop rotation results to a smallholder farmer in Kenya, in simple plain English with short sentences.
You are given the output of a rule-based scoring engine as JSON.
Rules you must follow:
- Use ONLY facts and numbers that appear in the JSON. Never invent or estimate soil measurements, rainfall, temperatures, yields, prices or dates.
- Do not add agronomic claims that are not in the JSON.
- Do not do arithmetic. Quote numbers exactly as given.
- If data is missing, say what is missing and which test or record would help (use the "improve" list).
- State the confidence level and the main reason for it.
- Say that NASA values are long-term averages and not a forecast, and that the farmer should check the advice with an agricultural officer.
- Describe the top three crops: why each ranks well and its main limitation. Then mention crops that are not suitable and why.
- At most 220 words. Plain text only: no markdown, no bullet symbols, no headings.`;

export const explainSystemPrompt = SYSTEM;

const r1 = (v: number | null | undefined) => (typeof v === "number" ? Math.round(v * 10) / 10 : null);

/** The only data the AI ever sees: engine results, already rounded. */
export function buildExplainPayload(res: RunResult) {
  return {
    plantingMonth: MONTHS[res.plantingMonth - 1],
    scoreScale: "Scores and confidence are out of 100.",
    climateBaseline: "Rainfall and temperature are NASA long-term averages for 2001 to 2020, not a forecast.",
    confidence: { level: res.confidence.level, score: res.confidence.score, reasons: res.confidence.reasons.slice(0, 5), improve: res.confidence.improve.slice(0, 5) },
    previousCrops: res.previousCrops.map((p) => p.name).slice(0, 3),
    soilTestsAvailable: { count: res.soil.sampleCount, measured: res.soil.present, missing: res.soil.missing },
    topCrops: res.ranked.slice(0, 5).map((c, i) => ({
      rank: i + 1, name: c.name, score: r1(c.total),
      mainReasons: c.why.slice(0, 3), limitations: c.limitations.slice(0, 3), risks: c.risks.filter((x) => !x.includes("drafts")).slice(0, 2),
    })),
    notSuitable: res.notSuitable.slice(0, 4).map((c) => ({ name: c.name, reasons: c.limiting.slice(0, 2) })),
    note: "Crop requirement values are drafts awaiting expert review.",
  };
}

/** Plain deterministic summary, used when no AI is configured or the AI answer fails the checks. */
export function rulesSummary(res: RunResult): string {
  const m = MONTHS[res.plantingMonth - 1];
  const top = res.ranked.slice(0, 3);
  const prev = res.previousCrops[0]?.name;
  const lines: string[] = [];
  if (!top.length) {
    lines.push(`For planting in ${m}, no crop in the database fits this farm's conditions well. See the reasons under each crop.`);
  } else {
    lines.push(`For planting in ${m}${prev ? `, after ${prev.toLowerCase()}` : ""}, the best-fitting crops are ${top.map((c) => `${c.name} (score ${r1(c.total)})`).join(", ")}.`);
    for (const c of top) {
      const why = c.why[0] ?? "it scores reasonably across the factors checked";
      const limit = c.limitations[0];
      lines.push(`${c.name}: ${why.replace(/\.$/, "")}.${limit ? ` Main limit: ${limit.replace(/\.$/, "")}.` : ""}`);
    }
  }
  if (res.notSuitable.length) lines.push(`Not suitable now: ${res.notSuitable.slice(0, 3).map((c) => `${c.name} (${(c.limiting[0] ?? "").replace(/\.$/, "")})`).join("; ")}.`);
  lines.push(`Confidence is ${res.confidence.level} (${res.confidence.score} out of 100). ${res.confidence.improve[0] ?? ""}`.trim());
  lines.push("Rainfall and temperature are NASA long-term averages, not a forecast. Check this advice with an agricultural officer.");
  return lines.join("\n");
}

/** True when every number in the text also appears in the data the AI was given. */
export function numbersAreGrounded(text: string, payload: unknown): boolean {
  const source = JSON.stringify(payload);
  const allowed = new Set((source.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  const used = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  return used.every((n) => Array.from(allowed).some((a) => Math.abs(a - n) < 0.051));
}

export function cleanAiText(text: string): string {
  return text.replace(/[*_#`>]/g, "").replace(/^\s*[-•]\s+/gm, "").trim();
}
