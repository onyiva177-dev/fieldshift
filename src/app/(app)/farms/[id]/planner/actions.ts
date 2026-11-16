"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRoleAction } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { loadEngineContext } from "@/lib/engine/load";
import { planStrategy, STRATEGIES } from "@/lib/engine/planner";
import { planInputFrom } from "@/lib/engine/plan-context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The plan is recalculated on the server from the farm's data. Nothing computed in the browser is trusted or stored.
export async function savePlan(fd: FormData): Promise<void> {
  const user = await requireRoleAction(["farmer", "admin"]);
  const farmId = String(fd.get("farmId") ?? "");
  const key = String(fd.get("strategy") ?? "");
  const last = String(fd.get("last") ?? "") || null;
  if (!UUID.test(farmId)) return;
  const back = `/farms/${farmId}/planner`;
  const strategy = STRATEGIES.find((s) => s.key === key);
  if (!strategy) redirect(`${back}?error=${encodeURIComponent("Unknown strategy.")}`);

  const supabase = await createClient();
  const ctx = await loadEngineContext(supabase, farmId);
  if (!ctx) redirect(back);
  const { base, weights, slots } = planInputFrom(ctx, last);
  const plan = planStrategy(base, weights, strategy, slots);
  if (!plan) redirect(`${back}?error=${encodeURIComponent("No suitable crops were found for this strategy.")}`);

  const payload = {
    farm_id: farmId, strategy_key: strategy.key, engine_version: plan.engineVersion,
    name: `${strategy.name}, ${slots[0].label} to ${slots[slots.length - 1].label}`,
    inputs: { priorities: strategy.priorities ?? ctx.farm.priorities, weights: { ...weights, ...(strategy.weights ?? {}) }, lastCropOverride: last, seasons: slots.map((s) => s.label), skippedLongCrops: plan.skippedLong },
    metrics: plan.metrics,
    seasons: plan.seasons.map((s) => ({
      season_index: s.slot.index, planting_month: s.slot.month, planting_year: s.slot.year, crop_id: s.crop.cropId, crop_name: s.crop.name, score: s.crop.total,
      details: {
        why: s.crop.why.slice(0, 3), limitations: s.crop.limitations.slice(0, 3), risks: s.crop.risks.filter((r) => !r.includes("drafts")).slice(0, 3),
        rotation: s.crop.components.find((c) => c.key === "rotation")?.notes.map((n) => n.text).slice(0, 2) ?? [],
      },
    })),
  };
  const { data, error } = await supabase.rpc("save_rotation_plan", { p: payload });
  if (error) redirect(`${back}?error=${encodeURIComponent("Only the farm owner can save a plan.")}`);

  await logAudit({ actorId: user.id, action: "rotation_plan.saved", entity: "rotation_plan", entityId: String(data) });
  revalidatePath(back);
  revalidatePath("/dashboard");
  redirect(`${back}?saved=1#saved`);
}

export async function deletePlan(fd: FormData): Promise<void> {
  const user = await requireRoleAction(["farmer", "admin"]);
  const id = String(fd.get("id") ?? "");
  const farmId = String(fd.get("farmId") ?? "");
  if (!UUID.test(id) || !UUID.test(farmId)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("rotation_plans").delete().eq("id", id).select("id");
  if (data?.length) await logAudit({ actorId: user.id, action: "rotation_plan.deleted", entity: "rotation_plan", entityId: id });
  revalidatePath(`/farms/${farmId}/planner`);
  revalidatePath("/dashboard");
}
