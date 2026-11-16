import { recommend } from "@/lib/engine/engine";
import { COMPONENTS, DEFAULT_WEIGHTS, ENGINE_VERSION, type Crop, type CropResult, type EngineInput, type PreviousCropIn, type Weights } from "@/lib/engine/types";

// Multi-season planning on top of the same scoring engine. For each season the engine is run with the
// crops chosen in earlier seasons treated as "previous crops", so rotation rules apply across the whole plan.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface SeasonSlot { index: number; month: number; year: number; label: string }

export interface Strategy {
  key: string; name: string; description: string;
  priorities: string[] | null; // null = use the farm's own priorities
  weights?: Partial<Weights>;
  noRepeat?: boolean; // never use the same crop twice in one plan
}

export const STRATEGIES: Strategy[] = [
  { key: "balanced", name: "Best fit for your farm", description: "Uses your own priorities and the default weights.", priorities: null },
  { key: "soil", name: "Build the soil", description: "Favours crops that rebuild fertility and rotate well.", priorities: ["soil_fertility", "long_term_sustainability"], weights: { rotation: 25, nutrients: 20, priorities: 20 } },
  { key: "drought", name: "Safer in dry seasons", description: "Favours drought-tolerant crops that need little water.", priorities: ["drought_risk", "water_conservation"], weights: { water: 25, climate: 25, priorities: 20 } },
  { key: "cost", name: "Lower input costs", description: "Favours crops that need little fertilizer and irrigation.", priorities: ["lower_input_costs"], weights: { nutrients: 20, priorities: 20 } },
  { key: "variety", name: "Maximum variety", description: "Never repeats a crop, to spread risk and break pest cycles.", priorities: null, noRepeat: true },
];

/** The next planting seasons, placed at the start of the farm's own rainy windows (from its NASA rainfall averages). */
export function buildSeasons(rainfall: Record<number, number> | null, today: Date, count = 4): SeasonSlot[] {
  const startMonth = today.getUTCMonth() + 1;
  const startYear = today.getUTCFullYear();
  let windows: number[];
  if (rainfall && Object.keys(rainfall).length === 12) {
    const sum3 = (m: number) => [0, 1, 2].reduce((a, k) => a + rainfall[((m - 1 + k) % 12) + 1], 0);
    const ranked = Array.from({ length: 12 }, (_, i) => i + 1).sort((a, b) => sum3(b) - sum3(a));
    const w1 = ranked[0];
    const gap = (m: number) => Math.min((m - w1 + 12) % 12, (w1 - m + 12) % 12);
    const w2 = ranked.find((m) => gap(m) >= 4) ?? ((w1 + 5) % 12) + 1;
    windows = [w1, w2];
  } else {
    const first = (startMonth % 12) + 1;
    windows = [first, ((first + 5) % 12) + 1];
  }
  const slots: SeasonSlot[] = [];
  for (let i = 1; i <= 36 && slots.length < count; i++) {
    const m = ((startMonth - 1 + i) % 12) + 1;
    const y = startYear + Math.floor((startMonth - 1 + i) / 12);
    if (windows.includes(m)) slots.push({ index: slots.length + 1, month: m, year: y, label: `${MONTHS[m - 1]} ${y}` });
  }
  return slots;
}

export interface PlannedSeason {
  slot: SeasonSlot; crop: CropResult;
}

export interface PlanMetrics {
  avgScore: number; nFixingSeasons: number; distinctFamilies: number; seasons: number;
  avgWaterGapMm: number | null; weakRotationSeasons: number; sameCropRepeated: boolean;
}

export interface PlanResult {
  strategy: Strategy; seasons: PlannedSeason[]; metrics: PlanMetrics; engineVersion: string; skippedLong: string[];
}

const iso = (y: number, m: number, d = 1) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const addDays = (isoDate: string, n: number) => { const d = new Date(`${isoDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

interface Beam { seq: PlannedSeason[]; total: number; prev: PreviousCropIn[] }

export function planStrategy(
  base: Omit<EngineInput, "plantingMonth" | "weights">, baseWeights: Weights, strategy: Strategy, slots: SeasonSlot[], beamWidth = 3
): PlanResult | null {
  const weights: Weights = { ...baseWeights, ...(strategy.weights ?? {}) };
  const farm = { ...base.farm, priorities: strategy.priorities ?? base.farm.priorities };
  // very long crops (such as cassava) occupy several seasons, so they are left out of multi-season plans
  const skippedLong = base.crops.filter((c) => c.cycleDaysMin >= 240).map((c) => c.name);
  const crops = base.crops.filter((c) => c.cycleDaysMin < 240);
  const today = base.today.toISOString().slice(0, 10);

  // a crop still in the field counts as the most recent previous crop, dated today so later seasons sort after it
  const history: PreviousCropIn[] = base.previousCrops.map((p) =>
    p.status === "current" ? { ...p, status: "previous", harvestedOn: today } : p
  );

  let beams: Beam[] = [{ seq: [], total: 0, prev: history }];
  for (const slot of slots) {
    const next: Beam[] = [];
    for (const beam of beams) {
      const res = recommend({ ...base, crops, farm, weights, previousCrops: beam.prev, plantingMonth: slot.month });
      const options = res.ranked.filter((c) => !strategy.noRepeat || !beam.seq.some((s) => s.crop.cropId === c.cropId));
      // a plan never picks a crop the rotation rules mark as "avoid" when a better-fitting rotation is available
      const rot = (c: CropResult) => c.components.find((x) => x.key === "rotation")?.score ?? 100;
      const sound = options.filter((c) => rot(c) >= 50);
      for (const cand of (sound.length ? sound : options).slice(0, beamWidth)) {
        const crop = crops.find((c) => c.id === cand.cropId) as Crop;
        const start = iso(slot.year, slot.month);
        const synthetic: PreviousCropIn = {
          name: crop.name, status: "previous", plantedOn: start,
          harvestedOn: addDays(start, Math.round((crop.cycleDaysMin + crop.cycleDaysMax) / 2)), createdAt: start,
        };
        next.push({ seq: [...beam.seq, { slot, crop: cand }], total: beam.total + cand.total, prev: [...beam.prev, synthetic] });
      }
    }
    if (!next.length) return null;
    beams = next.sort((a, b) => b.total - a.total).slice(0, beamWidth);
  }

  const best = beams[0];
  const byId = new Map(crops.map((c) => [c.id, c]));
  const seasons = best.seq;
  const comp = (c: CropResult, k: string) => c.components.find((x) => x.key === k)?.score ?? null;
  const gaps = seasons.map((s) => (s.crop.water.expectedMm === null ? null : s.crop.water.needMm[0] - s.crop.water.expectedMm)).filter((v): v is number => v !== null);
  const metrics: PlanMetrics = {
    avgScore: Math.round((best.total / seasons.length) * 10) / 10,
    nFixingSeasons: seasons.filter((s) => (byId.get(s.crop.cropId)?.nFixMin ?? 0) >= 30).length,
    distinctFamilies: new Set(seasons.map((s) => s.crop.family)).size,
    seasons: seasons.length,
    avgWaterGapMm: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    weakRotationSeasons: seasons.filter((s) => (comp(s.crop, "rotation") ?? 100) < 50).length,
    sameCropRepeated: seasons.some((s, i) => i > 0 && s.crop.cropId === seasons[i - 1].crop.cropId),
  };
  return { strategy, seasons, metrics, engineVersion: ENGINE_VERSION, skippedLong };
}

export function planAll(
  base: Omit<EngineInput, "plantingMonth" | "weights">, baseWeights: Weights, slots: SeasonSlot[]
): PlanResult[] {
  return STRATEGIES.map((s) => planStrategy(base, baseWeights, s, slots)).filter((p): p is PlanResult => p !== null);
}

export { COMPONENTS, DEFAULT_WEIGHTS };
