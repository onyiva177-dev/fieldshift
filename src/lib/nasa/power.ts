import { VARIABLES, type VariableInfo } from "@/lib/nasa/catalog";
import { NasaError, fetchWithRetry } from "@/lib/nasa/http";

const BASE = "https://power.larc.nasa.gov/api/temporal/daily/point";
export const POWER_START = "20010101"; // 2001 onward: gives a 20-year baseline (2001-2020) plus recent years

export interface PowerDaily {
  /** variable -> YYYYMMDD -> value (null where NASA reports a fill value) */
  series: Record<string, Record<string, number | null>>;
  /** units as reported by NASA for each variable */
  units: Record<string, string>;
  url: string;
}

export interface MonthlyValue {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  value: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

/** Last day of the previous month (UTC): only complete months are stored. */
export function lastCompleteMonthEnd(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
}

export async function fetchPowerDaily(
  lat: number,
  lng: number,
  parameters: string[],
  communities: string[],
  start = POWER_START,
  end = ymd(lastCompleteMonthEnd())
): Promise<PowerDaily> {
  let lastErr: NasaError | null = null;
  for (const community of communities) {
    const url =
      `${BASE}?parameters=${parameters.join(",")}&community=${community}` +
      `&longitude=${lng.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${start}&end=${end}&format=json`;
    const res = await fetchWithRetry(url, { timeoutMs: 50000 });
    if (res.ok) return parsePowerResponse(await res.json(), url);
    // 4xx usually means a parameter is not offered in this community: try the next one
    let detail = "";
    try {
      const body = await res.json();
      detail = Array.isArray(body?.messages) ? body.messages.join("; ") : JSON.stringify(body).slice(0, 200);
    } catch {
      /* ignore */
    }
    lastErr = new NasaError(`NASA POWER rejected the request (${res.status}) for community ${community}. ${detail}`.trim(), res.status);
  }
  throw lastErr ?? new NasaError("NASA POWER request failed");
}

/** Reads a POWER JSON point response. Exported separately so it can be tested without the network. */
export function parsePowerResponse(json: any, url: string): PowerDaily {
  const params = json?.properties?.parameter;
  if (!params || typeof params !== "object") throw new NasaError("NASA POWER returned an unexpected response");
  const fill = typeof json?.header?.fill_value === "number" ? json.header.fill_value : -999;
  const series: PowerDaily["series"] = {};
  for (const [name, days] of Object.entries<Record<string, number>>(params)) {
    const clean: Record<string, number | null> = {};
    for (const [day, v] of Object.entries(days)) clean[day] = typeof v === "number" && v !== fill && Number.isFinite(v) ? v : null;
    series[name] = clean;
  }
  const units: Record<string, string> = {};
  for (const [name, meta] of Object.entries<{ units?: string }>(json?.parameters ?? {})) {
    if (meta?.units) units[name] = meta.units;
  }
  return { series, units, url };
}

/** Daily values to monthly mean or sum. A month needs at least 80% valid days, otherwise it is left out. */
export function aggregateMonthly(
  daily: Record<string, number | null>,
  mode: "mean" | "sum",
  minCoverage = 0.8
): MonthlyValue[] {
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const [day, v] of Object.entries(daily)) {
    if (v === null || day.length !== 8) continue;
    const key = day.slice(0, 6);
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += v;
    b.n += 1;
    buckets.set(key, b);
  }
  const out: MonthlyValue[] = [];
  for (const [key, b] of Array.from(buckets.entries()).sort()) {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(4, 6));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (b.n / daysInMonth < minCoverage) continue;
    // for sums, scale up if a few days are missing so months stay comparable
    const value = mode === "mean" ? b.sum / b.n : (b.sum / b.n) * daysInMonth;
    out.push({
      periodStart: `${key.slice(0, 4)}-${key.slice(4, 6)}-01`,
      periodEnd: `${key.slice(0, 4)}-${key.slice(4, 6)}-${pad(daysInMonth)}`,
      value: Math.round(value * 1000) / 1000,
    });
  }
  return out;
}

export interface ObservationInput {
  dataset: string; product: string; variable: string; period_start: string; period_end: string;
  value: number; unit: string; aggregation: string; kind: string; spatial_resolution: string;
  source_url: string; note: string | null;
}

export function toObservations(info: VariableInfo, months: MonthlyValue[], note: string | null = null): ObservationInput[] {
  return months.map((m) => ({
    dataset: info.dataset, product: info.product, variable: info.key,
    period_start: m.periodStart, period_end: m.periodEnd, value: m.value, unit: info.unit,
    aggregation: info.aggregation, kind: info.kind, spatial_resolution: info.spatialResolution,
    source_url: info.sourceUrl, note,
  }));
}

export const POWER_MAIN_PARAMS = ["T2M", "T2M_MAX", "T2M_MIN", "RH2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "GWETTOP", "GWETROOT"];

export function buildPowerObservations(data: PowerDaily, variables: string[]): ObservationInput[] {
  const rows: ObservationInput[] = [];
  for (const v of variables) {
    const info = VARIABLES[v];
    const daily = data.series[v];
    if (!info || !daily) continue;
    const months = aggregateMonthly(daily, info.aggregation === "monthly_sum" ? "sum" : "mean");
    rows.push(...toObservations(info, months, data.units[v] ? `Source unit: ${data.units[v]}` : null));
  }
  return rows;
}
