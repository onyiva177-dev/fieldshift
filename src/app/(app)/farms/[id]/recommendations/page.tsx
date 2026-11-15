import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import RecommendationView from "@/components/RecommendationView";
import SubmitButton from "@/components/SubmitButton";
import { recommend } from "@/lib/engine/engine";
import { loadEngineContext } from "@/lib/engine/load";
import { COMPONENTS } from "@/lib/engine/types";
import { weightsFrom } from "@/lib/engine/weights";
import { saveRecommendation } from "./actions";

export const maxDuration = 60; // saving can wait for the AI explanation

const UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NOTES: Record<string, string> = {
  ai_off: "Saved. The AI explanation is not configured on the server, so a rule-based summary was written instead.",
  ai_failed: "Saved. The AI service did not answer, so a rule-based summary was written instead.",
  ai_rejected: "Saved. The AI wording used a number the engine did not produce, so it was discarded and a rule-based summary was written instead.",
};

export default async function RecommendationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_OK.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const ctx = await loadEngineContext(supabase, id);
  if (!ctx) notFound();

  const month = Number.isInteger(Number(sp.month)) && Number(sp.month) >= 1 && Number(sp.month) <= 12 ? Number(sp.month) : ctx.suggestedMonth;
  const weights = weightsFrom((k) => sp[k] ?? null, ctx.configWeights);
  const result = recommend({ farm: ctx.farm, soil: ctx.soil, previousCrops: ctx.previousCrops, crops: ctx.crops, rules: ctx.rules, climate: ctx.climate, weights, plantingMonth: month, today: new Date() });
  const canSave = user.id === ctx.farm.ownerId || user.role === "admin";

  const { data: saved } = await supabase.from("recommendations")
    .select("id, planting_month, created_at, confidence, results, summary, summary_source, summary_model")
    .eq("farm_id", id).order("created_at", { ascending: false }).limit(6);
  const savedList = (saved ?? []) as { id: string; planting_month: number; created_at: string; confidence: { level: string; score: number }; results: { ranked: { name: string; total: number }[] }; summary: string | null; summary_source: string | null; summary_model: string | null }[];

  return (
    <div className="space-y-6">
      <Link href={`/farms/${id}`} className="font-semibold text-field-800 underline">Back to farm</Link>
      <div>
        <h1 className="text-3xl font-bold">Crop recommendations</h1>
        <p>{ctx.farm.name}. Calculated live from your farm's data. The rules are explained under each crop.</p>
      </div>

      {sp.error && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{sp.error}</p>}
      {sp.saved && <p role="status" className="card border-field-800 bg-field-100">{NOTES[sp.note ?? ""] ?? "Saved with an AI-written explanation."} See it under Saved recommendations below.</p>}

      <form method="get" className="card space-y-3">
        <div>
          <label htmlFor="month" className="label">Planting month</label>
          <select id="month" name="month" defaultValue={String(month)} className="input max-w-xs">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}{i + 1 === ctx.suggestedMonth ? " (suggested from your rainfall)" : ""}</option>)}
          </select>
          <p className="mt-1 text-sm">The suggestion is the start of the wettest three months coming up in your farm's NASA rainfall average.</p>
        </div>
        <details>
          <summary className="cursor-pointer font-semibold">Adjust how much each factor counts</summary>
          <p className="mt-2 text-sm">Numbers are relative. Doubling one makes it count twice as much. Leave as they are if unsure.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {COMPONENTS.map((c) => (
              <div key={c.key}>
                <label htmlFor={`w_${c.key}`} className="label">{c.label}</label>
                <input id={`w_${c.key}`} name={`w_${c.key}`} type="number" min={0} max={100} defaultValue={weights[c.key]} className="input" />
                <p className="text-xs">{c.help}</p>
              </div>
            ))}
          </div>
        </details>
        <button type="submit" className="btn-secondary">Update ranking</button>
      </form>

      <RecommendationView result={result} />

      {canSave && (
        <form action={saveRecommendation} className="card space-y-2">
          <h2 className="text-xl font-bold">Save this recommendation</h2>
          <p className="text-sm">Keeps a snapshot of today's data and results, and writes a plain-language explanation of it.</p>
          <input type="hidden" name="farmId" value={id} />
          <input type="hidden" name="month" value={month} />
          {COMPONENTS.map((c) => <input key={c.key} type="hidden" name={`w_${c.key}`} value={weights[c.key]} />)}
          <SubmitButton pendingText="Saving and explaining...">Save and explain</SubmitButton>
        </form>
      )}

      <section id="saved" className="space-y-3">
        <h2 className="text-xl font-bold">Saved recommendations</h2>
        {savedList.length === 0 ? (
          <p className="card">None saved yet.</p>
        ) : (
          <ul className="space-y-3">
            {savedList.map((s) => (
              <li key={s.id} className={`card ${sp.saved === s.id ? "border-field-800" : ""}`}>
                <p className="font-bold">{new Date(s.created_at).toLocaleDateString("en-GB")}, planting in {MONTHS[s.planting_month - 1]}</p>
                <p className="text-sm">Top: {s.results.ranked.slice(0, 3).map((r) => `${r.name} (${r.total})`).join(", ") || "none suitable"}. Confidence {s.confidence.level} ({s.confidence.score}).</p>
                {s.summary && (
                  <details className="mt-2" open={sp.saved === s.id}>
                    <summary className="cursor-pointer font-semibold">Explanation ({s.summary_source === "ai" ? `AI-written from the engine's results, ${s.summary_model}` : "rule-based summary"})</summary>
                    <p className="mt-2 whitespace-pre-line text-sm">{s.summary}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
