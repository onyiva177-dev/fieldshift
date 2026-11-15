"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRoleAction } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { recommend } from "@/lib/engine/engine";
import { loadEngineContext } from "@/lib/engine/load";
import { DEFAULT_WEIGHTS } from "@/lib/engine/types";
import { weightsFrom } from "@/lib/engine/weights";
import { aiComplete, aiConfigured } from "@/lib/ai/provider";
import { buildExplainPayload, cleanAiText, explainSystemPrompt, numbersAreGrounded, rulesSummary } from "@/lib/ai/explain";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Re-runs the engine on the server (never trusting numbers sent by the browser), saves a snapshot, then writes the explanation.
export async function saveRecommendation(fd: FormData): Promise<void> {
  const user = await requireRoleAction(["farmer", "admin"]);
  const farmId = String(fd.get("farmId") ?? "");
  const month = Number(fd.get("month"));
  if (!UUID.test(farmId)) return;
  const back = `/farms/${farmId}/recommendations`;
  if (!Number.isInteger(month) || month < 1 || month > 12) redirect(`${back}?error=${encodeURIComponent("Choose a planting month.")}`);

  const supabase = await createClient();
  const ctx = await loadEngineContext(supabase, farmId);
  if (!ctx) redirect(back);
  const weights = weightsFrom((k) => (fd.get(k) === null ? null : String(fd.get(k))), ctx.configWeights ?? DEFAULT_WEIGHTS);
  if (!Object.values(weights).some((v) => v > 0)) redirect(`${back}?error=${encodeURIComponent("At least one weight must be above zero.")}`);

  const result = recommend({ farm: ctx.farm, soil: ctx.soil, previousCrops: ctx.previousCrops, crops: ctx.crops, rules: ctx.rules, climate: ctx.climate, weights, plantingMonth: month, today: new Date() });

  const { data: row, error } = await supabase.from("recommendations").insert({
    farm_id: farmId, requested_by: user.id, planting_month: month, weights: result.weights,
    inputs: {
      farm: { county: ctx.farm.county, irrigationAvailable: ctx.farm.irrigationAvailable, irrigationType: ctx.farm.irrigationType, waterSources: ctx.farm.waterSources, fertilizerPractices: ctx.farm.fertilizerPractices, priorities: ctx.farm.priorities },
      soil: result.soil, previousCrops: result.previousCrops, climate: result.climate,
    },
    results: { ranked: result.ranked, notSuitable: result.notSuitable, caveats: result.caveats, dataSources: result.dataSources },
    confidence: result.confidence, engine_version: result.engineVersion,
  }).select("id").single();
  if (error || !row) redirect(`${back}?error=${encodeURIComponent("Only the farm owner can save a recommendation.")}`);

  let summary = "";
  let source: "ai" | "rules" = "rules";
  let model: string | null = null;
  let aiNote = "";
  if (aiConfigured()) {
    try {
      const payload = buildExplainPayload(result);
      const out = await aiComplete(explainSystemPrompt, JSON.stringify(payload));
      const text = cleanAiText(out.text);
      if (text && text.length < 2200 && numbersAreGrounded(text, payload)) { summary = text; source = "ai"; model = out.model; }
      else aiNote = "ai_rejected";
    } catch (err) {
      console.error("[ai] explanation failed", err instanceof Error ? err.message : err);
      aiNote = "ai_failed";
    }
  } else aiNote = "ai_off";
  if (!summary) summary = rulesSummary(result);

  await supabase.from("recommendations").update({ summary, summary_source: source, summary_model: model }).eq("id", row.id);
  await logAudit({ actorId: user.id, action: "recommendation.saved", entity: "recommendation", entityId: row.id });
  revalidatePath(back);
  redirect(`${back}?saved=${row.id}${aiNote ? `&note=${aiNote}` : ""}#saved`);
}
