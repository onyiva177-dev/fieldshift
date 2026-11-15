import { COMPONENTS, type Weights } from "@/lib/engine/types";

/** Reads w_<factor> values (from a form or the URL), keeping the stored value where none is given. Clamped to 0 to 100. */
export function weightsFrom(get: (k: string) => string | null, fallback: Weights): Weights {
  const w = { ...fallback };
  for (const c of COMPONENTS) {
    const raw = get(`w_${c.key}`);
    if (raw === null || raw.trim() === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) w[c.key] = Math.min(100, Math.max(0, n));
  }
  return w;
}
