// Pure calculations on stored monthly NASA values: normals, anomalies, windows.
export interface Row { period_start: string; value: number }

export const BASE_START = 2001;
export const BASE_END = 2020;
export const WELL_BELOW = 70; // percent of normal
export const WELL_ABOVE = 130;

export const monthKey = (iso: string) => iso.slice(0, 7);

export function toMap(rows: Row[]): Map<string, number> {
  return new Map(rows.map((r) => [monthKey(r.period_start), r.value]));
}

export function latestKey(...maps: Map<string, number>[]): string | null {
  let best: string | null = null;
  for (const m of maps) for (const k of m.keys()) if (!best || k > best) best = k;
  return best;
}

/** The n month keys ending at endKey, oldest first. */
export function lastNKeys(endKey: string, n: number): string[] {
  const [y, m] = endKey.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
export const monthLabelLong = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/** Average for each calendar month (1 to 12) over the baseline years. A month needs at least minYears of data. */
export function normals(map: Map<string, number>, minYears = 10): Map<number, number> {
  const acc = new Map<number, number[]>();
  for (const [k, v] of map) {
    const y = Number(k.slice(0, 4));
    if (y < BASE_START || y > BASE_END) continue;
    const m = Number(k.slice(5, 7));
    acc.set(m, [...(acc.get(m) ?? []), v]);
  }
  const out = new Map<number, number>();
  for (const [m, vals] of acc) if (vals.length >= minYears) out.set(m, vals.reduce((a, b) => a + b, 0) / vals.length);
  return out;
}

export const normalFor = (n: Map<number, number>, key: string) => n.get(Number(key.slice(5, 7)));

export function pctOfNormal(value: number | undefined, normal: number | undefined): number | null {
  if (value === undefined || normal === undefined || normal <= 0) return null;
  return (value / normal) * 100;
}

export function mean(vals: (number | undefined)[], minCount: number): number | null {
  const v = vals.filter((x): x is number => typeof x === "number");
  return v.length >= minCount ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function sum(vals: (number | undefined)[], minCount: number): number | null {
  const v = vals.filter((x): x is number => typeof x === "number");
  return v.length >= minCount ? v.reduce((a, b) => a + b, 0) : null;
}

export const round = (v: number | null | undefined, d = 1) =>
  typeof v === "number" ? Math.round(v * 10 ** d) / 10 ** d : null;
