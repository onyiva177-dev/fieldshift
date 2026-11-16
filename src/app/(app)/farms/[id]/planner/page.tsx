import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";
import { loadEngineContext } from "@/lib/engine/load";
import { planAll, type PlanResult } from "@/lib/engine/planner";
import { planInputFrom } from "@/lib/engine/plan-context";
import { deletePlan, savePlan } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const sequence = (p: PlanResult) => p.seasons.map((s) => s.crop.slug).join(">");

function Chips({ names }: { names: { label: string; crop: string }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {names.map((n, i) => (
        <li key={i} className="flex items-center gap-2">
          <span className="rounded border border-field-200 bg-field-50 px-2 py-1 text-sm"><span className="block text-xs">{n.label}</span><span className="font-bold">{n.crop}</span></span>
          {i < names.length - 1 && <span aria-hidden="true">then</span>}
        </li>
      ))}
    </ol>
  );
}

export default async function PlannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ last?: string; saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const ctx = await loadEngineContext(supabase, id);
  if (!ctx) notFound();

  const last = sp.last && ctx.crops.some((c) => c.slug === sp.last) ? sp.last : null;
  const { base, weights, slots } = planInputFrom(ctx, last);
  const plans = planAll(base, weights, slots);
  const canSave = user.id === ctx.farm.ownerId || user.role === "admin";

  const best = plans.length ? Math.max(...plans.map((p) => p.metrics.avgScore)) : 0;
  const mostN = plans.length ? Math.max(...plans.map((p) => p.metrics.nFixingSeasons)) : 0;
  const firstBySeq = new Map<string, PlanResult>();
  plans.forEach((p) => { if (!firstBySeq.has(sequence(p))) firstBySeq.set(sequence(p), p); });

  const history = [...ctx.previousCrops].sort((a, b) => (b.harvestedOn ?? b.plantedOn ?? b.createdAt).localeCompare(a.harvestedOn ?? a.plantedOn ?? a.createdAt)).slice(0, 6);

  const { data: saved } = await supabase.from("rotation_plans")
    .select("id, name, strategy_key, status, created_at, metrics, rotation_plan_seasons(season_index, planting_month, planting_year, crop_name, score)")
    .eq("farm_id", id).order("created_at", { ascending: false }).limit(6);
  const savedPlans = (saved ?? []) as { id: string; name: string; created_at: string; metrics: { avgScore?: number }; rotation_plan_seasons: { season_index: number; planting_month: number; planting_year: number; crop_name: string; score: number }[] }[];

  return (
    <div className="space-y-6">
      <Link href={`/farms/${id}`} className="font-semibold text-field-800 underline">Back to farm</Link>
      <div>
        <h1 className="text-3xl font-bold">Rotation planner</h1>
        <p>{ctx.farm.name}. Compares strategies for the next {slots.length} planting seasons.</p>
      </div>

      {sp.error && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{sp.error}</p>}
      {sp.saved && <p role="status" className="card border-field-800 bg-field-100">Plan saved. It appears below and on your dashboard.</p>}

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">Where you are now</h2>
        <div>
          <h3 className="font-bold">Crop history (newest first)</h3>
          {history.length === 0 ? (
            <p className="text-sm">No crops recorded. Add them on the <Link href={`/farms/${id}#crops`} className="font-semibold underline">farm profile</Link> for better rotation advice.</p>
          ) : (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {history.map((h, i) => <li key={i}>{h.name}{h.status === "current" ? " (growing now)" : ""}{h.harvestedOn ? `, harvested ${new Date(h.harvestedOn).toLocaleDateString("en-GB")}` : ""}</li>)}
            </ul>
          )}
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="last" className="label">What if my last crop was...</label>
            <select id="last" name="last" defaultValue={last ?? ""} className="input">
              <option value="">Use my recorded crops</option>
              {ctx.crops.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn-secondary">Update plans</button>
        </form>
        <p className="text-sm">
          Planting seasons are placed at the start of your farm's two rainy windows, using NASA long-term rainfall averages (not a forecast):{" "}
          {slots.map((s) => s.label).join(", ")}.
        </p>
      </section>

      {plans.length === 0 ? (
        <p className="card">No strategy found suitable crops for these seasons. Check the crop recommendations page for the reasons.</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-bold">Compare strategies</h2>
            <p className="text-sm">Each plan is built season by season: the crops chosen earlier count as the previous crops, so rotation rules apply across the whole plan. The planner looks ahead across several options rather than picking the best crop one season at a time.</p>
            <div className="grid gap-3 lg:grid-cols-2">
              {plans.map((p) => {
                const twin = firstBySeq.get(sequence(p));
                return (
                  <article key={p.strategy.key} className="card space-y-3">
                    <header>
                      <h3 className="text-lg font-bold">{p.strategy.name}</h3>
                      <p className="text-sm">{p.strategy.description}</p>
                      <p className="mt-1 flex flex-wrap gap-2 text-xs font-semibold">
                        {p.metrics.avgScore === best && <span className="rounded bg-green-100 px-2 py-0.5 text-green-900">Highest average score</span>}
                        {p.metrics.nFixingSeasons === mostN && mostN > 0 && <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-900">Most nitrogen-fixing seasons</span>}
                        {twin && twin !== p && <span className="rounded bg-stone-200 px-2 py-0.5">Same crops as "{twin.strategy.name}"</span>}
                      </p>
                    </header>
                    <Chips names={p.seasons.map((s) => ({ label: s.slot.label, crop: s.crop.name }))} />
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div><dt className="font-semibold">Average score</dt><dd>{p.metrics.avgScore} of 100</dd></div>
                      <div><dt className="font-semibold">Nitrogen-fixing seasons</dt><dd>{p.metrics.nFixingSeasons} of {p.metrics.seasons}</dd></div>
                      <div><dt className="font-semibold">Plant families used</dt><dd>{p.metrics.distinctFamilies}</dd></div>
                      <div><dt className="font-semibold">Rotation warnings</dt><dd>{p.metrics.weakRotationSeasons === 0 ? "None" : `${p.metrics.weakRotationSeasons} season(s)`}</dd></div>
                      <div className="col-span-2"><dt className="font-semibold">Average rainfall gap vs crop need</dt><dd>{p.metrics.avgWaterGapMm === null ? "No rainfall data" : p.metrics.avgWaterGapMm <= 0 ? "None: expected rainfall meets the need" : `About ${p.metrics.avgWaterGapMm} mm short per season`}</dd></div>
                    </dl>

                    <details>
                      <summary className="cursor-pointer font-semibold">Why this plan</summary>
                      <ol className="mt-2 space-y-3">
                        {p.seasons.map((s) => (
                          <li key={s.slot.index} className="text-sm">
                            <p className="font-bold">{s.slot.label}: {s.crop.name} (score {s.crop.total})</p>
                            <ul className="list-disc pl-5">
                              {s.crop.components.find((c) => c.key === "rotation")?.notes.slice(0, 1).map((n, i) => <li key={`r${i}`}>{n.text}</li>)}
                              {s.crop.why.slice(0, 2).map((w, i) => <li key={`w${i}`}>{w}</li>)}
                              {s.crop.limitations.slice(0, 2).map((w, i) => <li key={`l${i}`} className="text-orange-950">Limit: {w}</li>)}
                            </ul>
                          </li>
                        ))}
                      </ol>
                    </details>

                    {canSave && (
                      <form action={savePlan}>
                        <input type="hidden" name="farmId" value={id} />
                        <input type="hidden" name="strategy" value={p.strategy.key} />
                        <input type="hidden" name="last" value={last ?? ""} />
                        <SubmitButton pendingText="Saving...">Save this plan</SubmitButton>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
            {plans[0].skippedLong.length > 0 && <p className="text-sm">Left out of multi-season plans because they occupy the land for more than one season: {plans[0].skippedLong.join(", ")}.</p>}
            <p className="card border-amber-600 bg-amber-50 text-sm">Plans are decision support, not a guarantee. Crop values are drafts until an agronomist reviews them, and markets, prices and seed availability are not considered. Check the plan with an agricultural officer.</p>
          </section>
        </>
      )}

      <section id="saved" className="space-y-3">
        <h2 className="text-xl font-bold">Saved plans</h2>
        {savedPlans.length === 0 ? (
          <p className="card">No plans saved yet.</p>
        ) : (
          <ul className="space-y-3">
            {savedPlans.map((p) => (
              <li key={p.id} className="card space-y-2">
                <p className="font-bold">{p.name}</p>
                <p className="text-sm">Saved {new Date(p.created_at).toLocaleDateString("en-GB")}. Average score {p.metrics.avgScore ?? "n/a"}.</p>
                <Chips names={[...p.rotation_plan_seasons].sort((a, b) => a.season_index - b.season_index).map((s) => ({ label: `${MONTHS[s.planting_month - 1]} ${s.planting_year}`, crop: s.crop_name }))} />
                {canSave && (
                  <form action={deletePlan}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="farmId" value={id} />
                    <SubmitButton className="btn-secondary min-h-10 px-3 py-1 text-sm" pendingText="Deleting...">Delete plan</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
