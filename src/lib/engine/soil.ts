import type { SoilMeasurementIn, SoilSummary } from "@/lib/engine/types";

export type Rating = "low" | "medium" | "high";

// Generic interpretation guides. Real thresholds depend on the laboratory method and local guidance (for example KALRO),
// so ratings are shown with their assumptions and should be replaced by local values when an agronomist reviews the engine.
export const THRESHOLDS = {
  nitrogenPct: { low: 0.1, high: 0.2 },
  pMgKg: { olsen: { low: 10, high: 20 }, bray1: { low: 15, high: 30 }, mehlich3: { low: 20, high: 40 } },
  kCmol: { low: 0.2, high: 0.5 },
  ocPct: { low: 1.0, high: 2.0 },
} as const;

export const rate = (v: number, low: number, high: number): Rating => (v < low ? "low" : v >= high ? "high" : "medium");

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function pMethodFamily(m: string | null | undefined): "olsen" | "bray1" | "mehlich3" | "unknown" {
  const t = (m ?? "").toLowerCase();
  if (t.includes("olsen")) return "olsen";
  if (t.includes("bray")) return "bray1";
  if (t.includes("mehlich")) return "mehlich3";
  return "unknown";
}

/** Latest verified value per sampling point for each parameter, then the median across points. Units are converted. */
export function buildSoilProfile(rows: SoilMeasurementIn[]) {
  const latest = new Map<string, SoilMeasurementIn>();
  for (const r of rows) {
    if (r.valueNum === null && !r.valueText) continue;
    const k = `${r.parameter}|${r.pointId}`;
    const cur = latest.get(k);
    if (!cur || r.sampledOn > cur.sampledOn) latest.set(k, r);
  }
  const by = (p: string) => Array.from(latest.values()).filter((r) => r.parameter === p);
  const nums = (p: string, conv: (v: number, unit: string | null) => number | null) =>
    by(p).map((r) => (r.valueNum === null ? null : conv(r.valueNum, r.unit))).filter((v): v is number => v !== null);
  const cats = (p: string) => {
    const vals = by(p).map((r) => r.valueText).filter((v): v is string => !!v);
    if (!vals.length) return undefined;
    const count = new Map<string, number>();
    vals.forEach((v) => count.set(v, (count.get(v) ?? 0) + 1));
    return Array.from(count.entries()).sort((a, b) => b[1] - a[1])[0][0];
  };

  const ph = nums("ph", (v) => v);
  const n = nums("nitrogen_total", (v, u) => (u === "mg/kg" ? v / 10000 : v));
  const p = nums("phosphorus_available", (v) => v);
  const k = nums("potassium_exchangeable", (v, u) => (u === "cmol(+)/kg" ? v : v / 391));
  const oc = nums("organic_carbon", (v) => v);
  const om = nums("organic_matter", (v) => v / 1.724);
  const ec = nums("electrical_conductivity", (v, u) => (u === "uS/cm" ? v / 1000 : v));
  const depth = nums("soil_depth", (v) => v);

  const pRows = by("phosphorus_available").filter((r) => r.valueNum !== null);
  const pMethod = pMethodFamily(pRows[0]?.method);

  const ocValues = oc.length ? oc : om;
  const sampleIds = new Set(Array.from(latest.values()).map((r) => r.sampleId));
  const points = new Set(Array.from(latest.values()).map((r) => r.pointId));
  const dates = Array.from(latest.values()).map((r) => r.sampledOn).sort();

  const profile = {
    sampleCount: sampleIds.size, pointCount: points.size, latestSampledOn: dates.length ? dates[dates.length - 1] : null,
    ph: ph.length ? median(ph) : undefined,
    nitrogenPct: n.length ? median(n) : undefined,
    pMgKg: p.length ? median(p) : undefined,
    kCmol: k.length ? median(k) : undefined,
    ocPct: ocValues.length ? median(ocValues) : undefined,
    ocEstimated: !oc.length && om.length > 0,
    ecDsm: ec.length ? median(ec) : undefined,
    depthCm: depth.length ? median(depth) : undefined,
    texture: cats("soil_texture"), drainage: cats("drainage"),
    pMethod,
  };

  const present: string[] = [];
  const missing: string[] = [];
  const track = (ok: boolean, label: string) => (ok ? present : missing).push(label);
  track(profile.ph !== undefined, "pH");
  track(!!profile.texture, "texture");
  track(profile.nitrogenPct !== undefined, "nitrogen");
  track(profile.pMgKg !== undefined, "phosphorus");
  track(profile.kCmol !== undefined, "potassium");
  track(profile.ocPct !== undefined, "organic carbon");
  track(!!profile.drainage, "drainage");

  const ratings: Record<string, string> = {};
  if (profile.nitrogenPct !== undefined) ratings.nitrogen = rate(profile.nitrogenPct, THRESHOLDS.nitrogenPct.low, THRESHOLDS.nitrogenPct.high);
  if (profile.pMgKg !== undefined) {
    const t = THRESHOLDS.pMgKg[pMethod === "unknown" ? "olsen" : pMethod];
    ratings.phosphorus = rate(profile.pMgKg, t.low, t.high);
  }
  if (profile.kCmol !== undefined) ratings.potassium = rate(profile.kCmol, THRESHOLDS.kCmol.low, THRESHOLDS.kCmol.high);
  if (profile.ocPct !== undefined) ratings.organicCarbon = rate(profile.ocPct, THRESHOLDS.ocPct.low, THRESHOLDS.ocPct.high);

  const summary: SoilSummary = { ...profile, present, missing, ratings };
  return summary;
}
