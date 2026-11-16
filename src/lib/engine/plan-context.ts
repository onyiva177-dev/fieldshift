import { buildSeasons, type SeasonSlot } from "@/lib/engine/planner";
import type { EngineContext } from "@/lib/engine/load";
import type { EngineInput, PreviousCropIn, Weights } from "@/lib/engine/types";

export type PlanBase = Omit<EngineInput, "plantingMonth" | "weights">;

/** Everything the planner needs, built the same way for the page and for saving. `lastSlug` is an optional "what if my last crop was..." override. */
export function planInputFrom(ctx: EngineContext, lastSlug: string | null, today = new Date()): { base: PlanBase; weights: Weights; slots: SeasonSlot[] } {
  let previousCrops: PreviousCropIn[] = ctx.previousCrops;
  const forced = lastSlug ? ctx.crops.find((c) => c.slug === lastSlug) : undefined;
  if (forced) {
    const d = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    previousCrops = [{ name: forced.name, status: "previous", plantedOn: null, harvestedOn: d, createdAt: d }];
  }
  return {
    base: { farm: ctx.farm, soil: ctx.soil, previousCrops, crops: ctx.crops, rules: ctx.rules, climate: ctx.climate, today },
    weights: ctx.configWeights,
    slots: buildSeasons(ctx.climate.rainfall, today, 4),
  };
}
