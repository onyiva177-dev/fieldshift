import { buildSoilProfile, THRESHOLDS } from "@/lib/engine/soil";
import {
  COMPONENTS, ENGINE_VERSION,
  type ComponentKey, type ComponentResult, type Confidence, type Crop, type CropResult, type EngineInput, type Level,
  type Note, type RotationRule, type RunResult, type SoilSummary, type Weights,
} from "@/lib/engine/types";

// ---------------------------------------------------------------------------------------------
// Transparent, rule-based scoring. No machine learning, no hidden inputs. Every score below is a
// plain function of the farm's data and the crop's stored requirements, and every step explains itself.
// ---------------------------------------------------------------------------------------------

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** 100 inside the optimal range, falling in a straight line to 0 at the absolute limits, 0 outside them. */
export function trapezoid(x: number, absMin: number, optMin: number, optMax: number, absMax: number): number {
  if (x < absMin || x > absMax) return 0;
  if (x >= optMin && x <= optMax) return 100;
  if (x < optMin) return optMin === absMin ? 100 : (100 * (x - absMin)) / (optMin - absMin);
  return optMax === absMax ? 100 : (100 * (absMax - x)) / (absMax - optMax);
}

const lvl = (l: Level) => ({ low: 0, medium: 1, high: 2 })[l];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (v: string[]) => v.join(", ");

// Climate over the crop's cycle ---------------------------------------------------------------

function cycleMonths(start: number, crop: Crop): number[] {
  const days = (crop.cycleDaysMin + crop.cycleDaysMax) / 2;
  const n = Math.min(12, Math.max(1, Math.ceil(days / 30)));
  return Array.from({ length: n }, (_, i) => ((start - 1 + i) % 12) + 1);
}

const IRR_BASE: Record<string, number> = { drip: 0.9, sprinkler: 0.8, furrow: 0.7, manual: 0.4, other: 0.5 };
const RELIABLE = ["borehole", "piped", "shallow_well"];
const SEASONAL = ["dam_pan", "river_stream", "roof_harvesting"];

/** Share of a rainfall shortfall that the farm's irrigation could cover, 0 to 0.9. */
export function irrigationCover(farm: EngineInput["farm"]): number {
  if (!farm.irrigationAvailable) return 0;
  const base = IRR_BASE[farm.irrigationType ?? ""] ?? 0.5;
  const reliability = farm.waterSources.some((s) => RELIABLE.includes(s)) ? 1 : farm.waterSources.some((s) => SEASONAL.includes(s)) ? 0.7 : 0.5;
  return round(base * reliability, 2);
}

interface CycleClimate { months: number[]; rain: number | null; temp: number | null; effRain: number | null }

function cycleClimate(crop: Crop, input: EngineInput, cover: number): CycleClimate {
  const months = cycleMonths(input.plantingMonth, crop);
  const r = input.climate.rainfall;
  const t = input.climate.temperature;
  const rain = r && months.every((m) => r[m] !== undefined) ? months.reduce((a, m) => a + r[m], 0) : null;
  const temp = t && months.every((m) => t[m] !== undefined) ? months.reduce((a, m) => a + t[m], 0) / months.length : null;
  const need = crop.requirement.rainOptMin;
  const effRain = rain === null ? null : rain < need ? rain + cover * (need - rain) : rain;
  return { months, rain, temp, effRain };
}

// Components ----------------------------------------------------------------------------------

type Scored = { score: number | null; notes: Note[]; limiting: string[] };
const none = (): Scored => ({ score: null, notes: [], limiting: [] });

function scoreSoil(crop: Crop, soil: SoilSummary): Scored {
  const req = crop.requirement;
  const subs: { score: number; weight: number }[] = [];
  const notes: Note[] = [];
  const limiting: string[] = [];

  if (soil.ph !== undefined) {
    const s = trapezoid(soil.ph, req.phAbsMin, req.phOptMin, req.phOptMax, req.phAbsMax);
    subs.push({ score: s, weight: 0.4 });
    if (s >= 100) notes.push({ tone: "good", text: `Soil pH ${round(soil.ph, 1)} is inside the preferred range (${req.phOptMin} to ${req.phOptMax}).` });
    else if (s === 0) {
      limiting.push(`Soil pH ${round(soil.ph, 1)} is outside the range ${crop.name.toLowerCase()} tolerates (${req.phAbsMin} to ${req.phAbsMax}).`);
      notes.push({ tone: "warn", text: `Soil pH ${round(soil.ph, 1)} is outside the tolerable range (${req.phAbsMin} to ${req.phAbsMax}).` });
    } else notes.push({ tone: "warn", text: `Soil pH ${round(soil.ph, 1)} is ${soil.ph < req.phOptMin ? "more acidic" : "more alkaline"} than preferred (${req.phOptMin} to ${req.phOptMax}).` });
  }
  if (soil.texture) {
    const label = soil.texture.replace(/_/g, " ");
    const s = req.texturesSuitable.includes(soil.texture) ? 100 : req.texturesMarginal.includes(soil.texture) ? 60 : 30;
    subs.push({ score: s, weight: 0.25 });
    notes.push(s === 100 ? { tone: "good", text: `${cap(label)} soil suits this crop.` }
      : { tone: "warn", text: `${cap(label)} soil is ${s === 60 ? "workable but not ideal" : "not well suited"} for this crop.` });
  }
  if (soil.drainage) {
    const ok = req.drainageSuitable.includes(soil.drainage);
    subs.push({ score: ok ? 100 : 40, weight: 0.2 });
    notes.push(ok ? { tone: "good", text: `Drainage (${soil.drainage.replace(/_/g, " ")}) suits this crop.` }
      : { tone: "warn", text: `Drainage (${soil.drainage.replace(/_/g, " ")}) is not what this crop prefers (${list(req.drainageSuitable.map((d) => d.replace(/_/g, " ")))}).` });
  }
  if (soil.depthCm !== undefined && req.depthMinCm) {
    const s = clamp((soil.depthCm / req.depthMinCm) * 100);
    subs.push({ score: s, weight: 0.1 });
    if (s < 100) notes.push({ tone: "warn", text: `Soil depth of ${round(soil.depthCm)} cm is shallower than the ${req.depthMinCm} cm this crop needs for rooting.` });
  }
  if (soil.ecDsm !== undefined && req.ecMaxDsm) {
    const s = soil.ecDsm <= req.ecMaxDsm ? 100 : clamp(100 * (1 - (soil.ecDsm - req.ecMaxDsm) / req.ecMaxDsm));
    subs.push({ score: s, weight: 0.05 });
    if (s < 100) notes.push({ tone: "warn", text: `Salinity (${round(soil.ecDsm, 2)} dS/m) is above what this crop tolerates (${req.ecMaxDsm} dS/m).` });
  }
  if (!subs.length) return none();
  const wsum = subs.reduce((a, s) => a + s.weight, 0);
  const avg = subs.reduce((a, s) => a + s.score * s.weight, 0) / wsum;
  const worst = Math.min(...subs.map((s) => s.score));
  // the weakest factor drags the result down: a crop is only as suited as its worst limiting condition
  return { score: round(0.6 * avg + 0.4 * worst, 1), notes, limiting };
}

function scoreClimate(crop: Crop, cc: CycleClimate): Scored {
  const req = crop.requirement;
  const parts: number[] = [];
  const notes: Note[] = [];
  const limiting: string[] = [];
  if (cc.temp !== null) {
    const s = trapezoid(cc.temp, req.tempAbsMin, req.tempOptMin, req.tempOptMax, req.tempAbsMax);
    parts.push(s);
    const t = round(cc.temp, 1);
    if (s >= 100) notes.push({ tone: "good", text: `Average temperature over the season (${t} C) is inside the preferred range (${req.tempOptMin} to ${req.tempOptMax} C).` });
    else if (s === 0) {
      limiting.push(`Season temperature (${t} C) is outside what ${crop.name.toLowerCase()} tolerates (${req.tempAbsMin} to ${req.tempAbsMax} C).`);
      notes.push({ tone: "warn", text: `Season temperature (${t} C) is outside the tolerable range (${req.tempAbsMin} to ${req.tempAbsMax} C).` });
    } else notes.push({ tone: "warn", text: `Season temperature (${t} C) is ${cc.temp < req.tempOptMin ? "cooler" : "warmer"} than preferred (${req.tempOptMin} to ${req.tempOptMax} C).` });
  }
  if (cc.effRain !== null && cc.rain !== null) {
    const s = trapezoid(cc.effRain, req.rainAbsMin, req.rainOptMin, req.rainOptMax, req.rainAbsMax);
    parts.push(s);
    if (cc.effRain > req.rainAbsMax) {
      limiting.push(`Expected rainfall (${round(cc.rain)} mm) is above the ${req.rainAbsMax} mm this crop tolerates.`);
      notes.push({ tone: "warn", text: `Expected rainfall (${round(cc.rain)} mm) is above what this crop tolerates (${req.rainAbsMax} mm). Waterlogging and disease risk is high.` });
    } else if (cc.effRain > req.rainOptMax) notes.push({ tone: "warn", text: `Expected rainfall (${round(cc.rain)} mm) is wetter than preferred (up to ${req.rainOptMax} mm).` });
    else if (s === 0) limiting.push(`Expected rainfall (${round(cc.rain)} mm) is below the ${req.rainAbsMin} mm minimum, even with your irrigation.`);
    else if (s >= 100) notes.push({ tone: "good", text: `Expected rainfall (${round(cc.rain)} mm over the season) falls in the preferred range (${req.rainOptMin} to ${req.rainOptMax} mm).` });
  }
  if (!parts.length) return none();
  return { score: round(parts.reduce((a, b) => a + b, 0) / parts.length, 1), notes, limiting };
}

function scoreWater(crop: Crop, cc: CycleClimate, cover: number): Scored {
  if (cc.rain === null || cc.effRain === null) return none();
  const need = crop.requirement.rainOptMin;
  const ratio = Math.min(1, cc.effRain / need);
  let score = 100 * ratio ** 1.5;
  const notes: Note[] = [];
  if (ratio < 1) {
    const bonus = crop.droughtTolerance === "high" ? 10 : crop.droughtTolerance === "moderate" ? 5 : 0;
    score = Math.min(100, score + bonus);
    notes.push({ tone: "warn", text: `Expected rainfall (${round(cc.rain)} mm) is below this crop's water need (about ${need} mm)${cover > 0 ? `; your irrigation could cover part of the gap` : "; there is no irrigation to cover the gap"}.` });
    if (bonus) notes.push({ tone: "good", text: `${cap(crop.droughtTolerance)} drought tolerance helps it cope with a shortfall.` });
  } else notes.push({ tone: "good", text: `Expected rainfall (${round(cc.rain)} mm) meets the crop's water need (about ${need} mm).` });
  return { score: round(score, 1), notes, limiting: [] };
}

const NUTRIENT_MATRIX: Record<string, Record<Level, number>> = {
  high: { low: 100, medium: 100, high: 100 },
  medium: { low: 100, medium: 85, high: 65 },
  low: { low: 70, medium: 45, high: 25 },
};

function scoreNutrients(crop: Crop, soil: SoilSummary, farm: EngineInput["farm"]): Scored {
  const items: { key: "nitrogen" | "phosphorus" | "potassium"; demand: Level; weight: number; label: string }[] = [
    { key: "nitrogen", demand: crop.nDemand, weight: 0.4, label: "Nitrogen" },
    { key: "phosphorus", demand: crop.pDemand, weight: 0.35, label: "Phosphorus" },
    { key: "potassium", demand: crop.kDemand, weight: 0.25, label: "Potassium" },
  ];
  let boost = 0;
  const practices = farm.fertilizerPractices;
  if (practices.includes("synthetic")) boost += 25;
  if (practices.includes("manure")) boost += 15;
  if (practices.includes("compost")) boost += 10;
  const fixer = (crop.nFixMin ?? 0) >= 30;

  const parts: { score: number; weight: number }[] = [];
  const notes: Note[] = [];
  for (const it of items) {
    const rating = soil.ratings[it.key];
    if (!rating) continue;
    let s = NUTRIENT_MATRIX[rating][it.demand];
    if (it.key === "nitrogen" && fixer) s = 100; // a strong fixer supplies its own nitrogen; phosphorus is scored separately
    if (s < 100 && boost > 0 && !(it.key === "nitrogen" && fixer)) s = Math.min(100, s + boost);
    parts.push({ score: s, weight: it.weight });

    const val = it.key === "nitrogen" ? `${round(soil.nitrogenPct ?? 0, 2)}%` : it.key === "phosphorus" ? `${round(soil.pMgKg ?? 0, 1)} mg/kg` : `${round(soil.kCmol ?? 0, 2)} cmol/kg`;
    if (it.key === "nitrogen" && fixer) notes.push({ tone: "good", text: `Nitrogen is rated ${rating} (${val}). As a legume it can supply much of its own nitrogen.` });
    else if (rating === "low" && it.demand !== "low") notes.push({ tone: "warn", text: `${it.label} is rated low (${val}) and this crop has a ${it.demand} demand${boost > 0 ? ", which your manure or fertilizer use should help with" : ". Plan manure, compost or fertilizer"}.` });
    else if (rating === "high") notes.push({ tone: "good", text: `${it.label} is rated high (${val}).` });
    else if (rating === "medium" && it.demand === "high") notes.push({ tone: "info", text: `${it.label} is rated medium (${val}) and this crop has a high demand. Top up if yields matter.` });
  }
  if (!parts.length) return none();
  const wsum = parts.reduce((a, p) => a + p.weight, 0);
  if (soil.pMgKg !== undefined && soil.pMethod === "unknown") notes.push({ tone: "info", text: "The phosphorus test method was not recorded, so Olsen thresholds were assumed." });
  return { score: round(parts.reduce((a, p) => a + p.score * p.weight, 0) / wsum, 1), notes, limiting: [] };
}

// Rotation ------------------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const singular = (s: string) => (s.endsWith("es") && s.length > 4 ? s.slice(0, -2) : s.endsWith("s") && s.length > 3 ? s.slice(0, -1) : s);

/** Finds the database crop a farmer's free-text crop name refers to. */
export function matchCrop(name: string, crops: Crop[]): Crop | null {
  const n = norm(name);
  const keys = (c: Crop) => [c.name, c.slug.replace(/_/g, " "), ...c.aliases].map(norm).flatMap((k) => [k, singular(k)]);
  return crops.find((c) => keys(c).includes(n) || keys(c).includes(singular(n))) ?? null;
}

function ruleFor(prev: Crop, next: Crop, rules: RotationRule[]): RotationRule | null {
  const matches = (kind: string, value: string, c: Crop) => (kind === "crop" ? c.slug === value : kind === "family" ? c.family === value : c.group === value);
  const spec = { crop: 3, family: 2, group: 1 } as const;
  let best: RotationRule | null = null;
  let bestSpec = -1;
  for (const r of rules) {
    if (!matches(r.fromKind, r.fromValue, prev) || !matches(r.toKind, r.toValue, next)) continue;
    const s = spec[r.fromKind] + spec[r.toKind];
    if (s > bestSpec) { best = r; bestSpec = s; }
  }
  return best;
}

function scoreRotation(crop: Crop, prev: (Crop | null)[], rules: RotationRule[]): Scored & { risks: string[] } {
  const p1 = prev[0];
  if (!p1) return { ...none(), risks: [] };
  const notes: Note[] = [];
  const risks: string[] = [];
  const rule = ruleFor(p1, crop, rules);
  let score = rule?.score ?? 60;
  notes.push({
    tone: !rule ? "info" : rule.effect === "beneficial" ? "good" : rule.effect === "neutral" ? "info" : "warn",
    text: `After ${p1.name.toLowerCase()} (${p1.family}): ${rule ? rule.reason : "no specific rotation rule applies, so it is treated as neutral."}`,
  });
  const p2 = prev[1];
  if (p2 && p2.family === crop.family && p1.family !== crop.family) {
    score = Math.max(0, score - 10);
    notes.push({ tone: "warn", text: `${cap(p2.name.toLowerCase())} (same family) was grown two seasons ago, so some shared pests and diseases may remain.` });
  }
  const shared = crop.sharedRisks.filter((r) => p1.sharedRisks.includes(r));
  if (shared.length) risks.push(`Shares ${list(shared)} with the previous crop (${p1.name.toLowerCase()}), so these may carry over.`);
  return { score: round(score, 1), notes, limiting: [], risks };
}

// Priorities ----------------------------------------------------------------------------------

function soilBuilding(crop: Crop): number {
  const mid = crop.nFixMin !== null || crop.nFixMax !== null ? ((crop.nFixMin ?? 0) + (crop.nFixMax ?? crop.nFixMin ?? 0)) / 2 : 0;
  if (mid >= 30) return Math.min(95, 55 + Math.min(35, mid / 4) + ((crop.rootDepthCm ?? 0) >= 100 ? 3 : 0));
  const worst = Math.max(lvl(crop.nDemand), lvl(crop.pDemand), lvl(crop.kDemand));
  return clamp(50 - (worst === 2 ? 15 : worst === 1 ? 5 : 0) + ((crop.rootDepthCm ?? 0) >= 120 ? 5 : 0));
}

const DEMAND_POINTS: Record<Level, number> = { low: 0, medium: 12, high: 25 };

function scorePriorities(crop: Crop, priorities: string[], sibling: { soil: number | null; climate: number | null; rotation: number | null }): Scored {
  if (!priorities.length) return none();
  const notes: Note[] = [];
  const scores: number[] = [];
  const fertility = soilBuilding(crop);
  for (const p of priorities) {
    let s: number | null = null;
    if (p === "soil_fertility") {
      s = fertility;
      if (s >= 70) notes.push({ tone: "good", text: "Supports your soil fertility priority: it can add nitrogen and improve the soil for the next crop." });
      else if (s <= 45) notes.push({ tone: "warn", text: "Works against your soil fertility priority: it draws heavily on soil nutrients." });
    } else if (p === "water_conservation") {
      s = clamp(100 - clamp((crop.requirement.rainOptMin - 300) / 6, 0, 60) + (crop.droughtTolerance === "high" ? 15 : crop.droughtTolerance === "moderate" ? 5 : 0));
      if (s >= 75) notes.push({ tone: "good", text: "Fits your water conservation priority: it needs relatively little water." });
      else if (s <= 50) notes.push({ tone: "warn", text: "Works against your water conservation priority: it needs a lot of water." });
    } else if (p === "productivity") {
      const vals = [sibling.soil, sibling.climate].filter((v): v is number => v !== null);
      s = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      if (s !== null) notes.push({ tone: "info", text: "Productivity is judged by how well the crop suits your soil and climate. This is not a yield or price forecast." });
    } else if (p === "lower_input_costs") {
      s = clamp(100 - DEMAND_POINTS[crop.nDemand] - DEMAND_POINTS[crop.pDemand] - DEMAND_POINTS[crop.kDemand] + ((crop.nFixMin ?? 0) >= 30 ? 10 : 0));
      if (s >= 75) notes.push({ tone: "good", text: "Fits your goal of lower input costs: it needs little fertilizer." });
      else if (s <= 45) notes.push({ tone: "warn", text: "Works against your goal of lower input costs: it needs a lot of fertilizer." });
    } else if (p === "drought_risk") {
      s = clamp({ high: 90, moderate: 65, low: 35 }[crop.droughtTolerance] + (crop.cycleDaysMax <= 100 ? 10 : crop.cycleDaysMin >= 180 ? -10 : 0));
      if (s >= 80) notes.push({ tone: "good", text: "Fits your drought risk priority: it copes well with dry spells." });
      else if (s <= 40) notes.push({ tone: "warn", text: "Works against your drought risk priority: it is easily hurt by dry spells." });
    } else if (p === "long_term_sustainability") {
      s = 0.6 * fertility + 0.4 * (sibling.rotation ?? 50);
      if (s >= 70) notes.push({ tone: "good", text: "Supports long-term sustainability: it helps the soil and fits a healthy rotation." });
    }
    if (s !== null) scores.push(s);
  }
  if (!scores.length) return none();
  return { score: round(scores.reduce((a, b) => a + b, 0) / scores.length, 1), notes, limiting: [] };
}

// Confidence ----------------------------------------------------------------------------------

function ageYears(iso: string | null, today: Date): number | null {
  return iso ? (today.getTime() - new Date(iso).getTime()) / (365.25 * 86400000) : null;
}

function computeConfidence(input: EngineInput, soil: SoilSummary, prevResolved: { name: string; crop: Crop | null }[]): Confidence {
  const reasons: string[] = [];
  const improve: string[] = [];
  let score = 0;

  // soil: 45 points (coverage x recency) + 10 for more than one sampling point
  const coverage = soil.present.length / 7;
  const age = ageYears(soil.latestSampledOn, input.today);
  const recency = age === null ? 0 : age < 2 ? 1 : age < 5 ? 0.7 : 0.4;
  score += 45 * coverage * recency;
  if (soil.sampleCount === 0) {
    reasons.push("No verified soil test is on record for this farm.");
    improve.push("Ask an agricultural officer to take and submit soil samples, and have an administrator verify them.");
  } else {
    reasons.push(`${soil.sampleCount} verified soil sample(s) cover ${soil.present.length} of 7 key measurements (${soil.present.join(", ") || "none"}).`);
    if (soil.missing.length) improve.push(`Add verified soil results for: ${soil.missing.join(", ")}.`);
    if (age !== null && age >= 2) { reasons.push(`The latest soil test is ${round(age, 1)} years old.`); improve.push("Re-test the soil: results older than about 2 years may no longer reflect the field."); }
    if (soil.pointCount < 2) { improve.push("Sample at least two points in the field, because soil can differ across a farm."); } else score += 10;
  }

  // climate: 25 points
  const rainOk = !!input.climate.rainfall && Object.keys(input.climate.rainfall).length === 12;
  const tempOk = !!input.climate.temperature && Object.keys(input.climate.temperature).length === 12;
  score += (rainOk ? 15 : 0) + (tempOk ? 10 : 0);
  if (!rainOk) { reasons.push("NASA rainfall averages are not available for this farm yet."); improve.push("Run the NASA data refresh for this farm and wait for it to finish."); }
  else reasons.push(`Rainfall averages come from ${input.climate.rainfallSource}. They are long-term averages, not a forecast.`);
  if (!tempOk) { reasons.push("NASA temperature averages are not available for this farm yet."); }
  else reasons.push("Temperature comes from a model on a grid about 55 km wide, so altitude differences inside that area are not captured.");

  // crop history: 15 points
  const known = prevResolved.filter((p) => p.crop);
  if (prevResolved.length === 0) { reasons.push("No previous crop is recorded."); improve.push("Record the current and previous crops on the farm profile."); }
  else if (known.length === 0) { score += 4; reasons.push("Previous crops are recorded but none match the crop database."); improve.push("Use crop names from the suggestion list, or ask an administrator to add the crop."); }
  else { score += 15; reasons.push(`Previous crop: ${known[0].name}.`); }

  // crop knowledge: 5 points when reviewed
  const drafts = input.crops.filter((c) => c.reviewStatus === "draft").length;
  if (drafts) { reasons.push("Crop requirement values are drafts awaiting expert review."); improve.push("Have an agronomist review the crop database (Administration, Crops)."); }
  else score += 5;

  score = round(clamp(score));
  return { score, level: score >= 75 ? "high" : score >= 50 ? "medium" : "low", reasons, improve };
}

// Planting month ------------------------------------------------------------------------------

/** The month, among the next six, that begins the wettest three-month stretch of the farm's own rainfall averages. */
export function suggestPlantingMonth(rainfall: Record<number, number> | null, today = new Date()): number {
  const current = today.getUTCMonth() + 1;
  if (!rainfall || Object.keys(rainfall).length < 12) return (current % 12) + 1;
  let best = (current % 12) + 1;
  let bestSum = -1;
  for (let i = 1; i <= 6; i++) {
    const m = ((current - 1 + i) % 12) + 1;
    const sum = [0, 1, 2].reduce((a, k) => a + rainfall[((m - 1 + k) % 12) + 1], 0);
    if (sum > bestSum) { best = m; bestSum = sum; }
  }
  return best;
}

// Orchestrator --------------------------------------------------------------------------------

export function normaliseWeights(w: Weights): Weights {
  const out = { ...w };
  for (const c of COMPONENTS) out[c.key] = Number.isFinite(out[c.key]) ? clamp(out[c.key], 0, 100) : 0;
  return out;
}

export function recommend(input: EngineInput): RunResult {
  const weights = normaliseWeights(input.weights);
  const soil = buildSoilProfile(input.soil);

  const prevSorted = [...input.previousCrops].sort((a, b) => {
    const key = (p: typeof a) => (p.status === "current" ? "9999-12-31" : p.harvestedOn ?? p.plantedOn ?? p.createdAt.slice(0, 10));
    return key(b).localeCompare(key(a));
  });
  const prevResolved = prevSorted.map((p) => ({ name: p.name, crop: matchCrop(p.name, input.crops) }));
  const prevCrops = prevResolved.map((p) => p.crop);
  const cover = irrigationCover(input.farm);
  const confidence = computeConfidence(input, soil, prevResolved);

  const results: CropResult[] = input.crops.map((crop) => {
    const cc = cycleClimate(crop, input, cover);
    const soilR = scoreSoil(crop, soil);
    const climR = scoreClimate(crop, cc);
    const waterR = scoreWater(crop, cc, cover);
    const nutR = scoreNutrients(crop, soil, input.farm);
    const rotR = scoreRotation(crop, prevCrops, input.rules);
    const prioR = scorePriorities(crop, input.farm.priorities, { soil: soilR.score, climate: climR.score, rotation: rotR.score });

    const byKey: Record<ComponentKey, Scored> = { soil: soilR, climate: climR, water: waterR, nutrients: nutR, rotation: rotR, priorities: prioR };
    const available = COMPONENTS.filter((c) => byKey[c.key].score !== null && weights[c.key] > 0);
    const wsum = available.reduce((a, c) => a + weights[c.key], 0);
    const components: ComponentResult[] = COMPONENTS.map((c) => ({
      key: c.key, label: c.label, score: byKey[c.key].score, weightConfigured: weights[c.key],
      weightUsed: byKey[c.key].score !== null && wsum > 0 && weights[c.key] > 0 ? round((weights[c.key] / wsum) * 100, 1) : 0,
      notes: byKey[c.key].notes,
    }));
    let total = wsum > 0 ? available.reduce((a, c) => a + (byKey[c.key].score as number) * (weights[c.key] / wsum), 0) : 0;

    const limiting = [...soilR.limiting, ...climR.limiting];
    const status: CropResult["status"] = limiting.length ? "not_suitable" : "recommended";
    if (limiting.length) total = Math.min(total, 40);

    const all = components.flatMap((c) => c.notes.map((n) => ({ ...n, comp: c.key })));
    const why = all.filter((n) => n.tone === "good" && n.comp !== "priorities").slice(0, 4).map((n) => n.text);
    const priorityGood = all.filter((n) => n.tone === "good" && n.comp === "priorities").map((n) => n.text);

    const benefits: string[] = [];
    const mid = ((crop.nFixMin ?? 0) + (crop.nFixMax ?? crop.nFixMin ?? 0)) / 2;
    if ((crop.nFixMin ?? 0) >= 30 || (crop.nFixMax ?? 0) >= 60) {
      benefits.push(`Fixes nitrogen from the air, typically ${crop.nFixMin ?? 0} to ${crop.nFixMax ?? crop.nFixMin} kg N per hectare. This varies widely, and the net gain for the next crop depends on how much is removed in the grain and how much residue is left.`);
    } else if (mid === 0 && crop.group === "legume") {
      benefits.push("A legume, but with weak nitrogen fixation.");
    }
    if ((crop.rootDepthCm ?? 0) >= 100) benefits.push(`Deep roots (about ${crop.rootDepthCm} cm) draw water and nutrients from deeper layers and open the soil.`);
    if (crop.group === "cereal") benefits.push("Leaves residues that add organic matter if kept in the field, though cereals draw heavily on nitrogen.");
    if (crop.notes) benefits.push(crop.notes);

    const limitations = all.filter((n) => n.tone === "warn").map((n) => n.text);
    const risks = [...rotR.risks];
    if (crop.droughtTolerance === "low") risks.push("Low drought tolerance: a dry spell or late rains can cut yields sharply.");
    if (cc.rain !== null && cc.rain < crop.requirement.rainOptMin && cover === 0) risks.push("Rainfall is expected to fall short and there is no irrigation to make up the difference.");
    if (crop.cycleDaysMin >= 240) risks.push(`A long crop (${Math.round(crop.cycleDaysMin / 30)} to ${Math.round(crop.cycleDaysMax / 30)} months): it occupies the land for more than one season, which limits rotation.`);
    if (crop.requirement.regionNote) risks.push(crop.requirement.regionNote);
    if (crop.reviewStatus === "draft") risks.push("Crop requirement values are drafts awaiting expert review.");

    const sources: string[] = [];
    if (soil.sampleCount) sources.push(`Verified soil results (${soil.sampleCount} sample${soil.sampleCount > 1 ? "s" : ""}, latest ${soil.latestSampledOn})`);
    if (input.climate.rainfallSource) sources.push(`${input.climate.rainfallSource}: rainfall averages 2001 to 2020`);
    if (input.climate.temperatureSource) sources.push(`${input.climate.temperatureSource}: temperature averages 2001 to 2020`);
    if (prevResolved.length) sources.push(`Crop history: ${prevResolved.slice(0, 2).map((p) => p.name).join(", ")}`);
    sources.push(`Crop requirements (${crop.requirementRegion}): ${crop.references.map((r) => r.title).join("; ") || "no reference listed"}, status ${crop.reviewStatus}`);

    return {
      cropId: crop.id, slug: crop.slug, name: crop.name, scientificName: crop.scientificName, group: crop.group, family: crop.family,
      reviewStatus: crop.reviewStatus, total: round(total, 1), status, limiting, components,
      why: [...why, ...priorityGood.slice(0, 1)], benefits, limitations, risks,
      water: { needMm: [crop.requirement.rainOptMin, crop.requirement.rainOptMax], expectedMm: cc.rain === null ? null : round(cc.rain), irrigationCover: cover },
      sources,
    };
  });

  const ranked = results.filter((r) => r.status === "recommended").sort((a, b) => b.total - a.total);
  const notSuitable = results.filter((r) => r.status === "not_suitable").sort((a, b) => b.total - a.total);

  const caveats = [
    "Rankings are decision support, not a guarantee of yield. Local knowledge and an agronomist's advice should be applied.",
    `Expected rainfall and temperature are 2001 to 2020 averages for the farm's NASA grid cell starting in ${MONTHS[input.plantingMonth - 1]}, not a forecast.`,
    "Markets, prices, seed availability and labour are not considered.",
  ];
  if (soil.pMgKg !== undefined || soil.kCmol !== undefined || soil.nitrogenPct !== undefined) {
    caveats.push("Nutrient ratings use generic thresholds (nitrogen 0.1 to 0.2 percent, potassium 0.2 to 0.5 cmol per kg, phosphorus by test method). Local laboratory thresholds may differ.");
  }

  const dataSources: string[] = [];
  if (soil.sampleCount) dataSources.push(`Officer-collected, administrator-verified soil tests (${soil.sampleCount})`);
  if (input.climate.rainfallSource) dataSources.push(input.climate.rainfallSource);
  if (input.climate.temperatureSource) dataSources.push(input.climate.temperatureSource);
  dataSources.push("Farm profile: irrigation, water sources, inputs, priorities");
  if (prevResolved.length) dataSources.push("Farm crop history");
  dataSources.push("Crop requirement and rotation rules database");

  return {
    engineVersion: ENGINE_VERSION, plantingMonth: input.plantingMonth, weights, confidence, soil,
    climate: { rainfallSource: input.climate.rainfallSource, temperatureSource: input.climate.temperatureSource, baseline: "2001 to 2020" },
    previousCrops: prevResolved.map((p) => ({ name: p.name, matched: p.crop?.name ?? null })),
    ranked, notSuitable, dataSources, caveats,
  };
}

export { THRESHOLDS };
