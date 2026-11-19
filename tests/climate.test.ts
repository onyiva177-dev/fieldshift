import test from "node:test";
import assert from "node:assert/strict";
// Hand-made test inputs only. Nothing here is real farm or NASA data.
import { toMap, latestKey, lastNKeys, normals, normalFor, pctOfNormal, mean, sum, monthLabel } from "../src/lib/climate";
const ok = (n: string, c: boolean, e = "") => test(n, () => assert.ok(c, e));
// 20 baseline years: every January = 100 mm, every July = 20 mm; then 2026-01 = 40 mm (dry), 2026-07 = 30 (wet)
const rows: { period_start: string; value: number }[] = [];
for (let y = 2001; y <= 2020; y++) { rows.push({ period_start: `${y}-01-01`, value: 100 }, { period_start: `${y}-07-01`, value: 20 }); }
rows.push({ period_start: "2026-01-01", value: 40 }, { period_start: "2026-07-01", value: 30 });
const m = toMap(rows); const n = normals(m);
ok("normals for Jan and Jul", n.get(1) === 100 && n.get(7) === 20 && n.size === 2);
ok("Jan 2026 = 40% of normal (well below 70)", pctOfNormal(m.get("2026-01"), normalFor(n, "2026-01")) === 40);
ok("Jul 2026 = 150% of normal (well above 130)", pctOfNormal(m.get("2026-07"), normalFor(n, "2026-07")) === 150);
ok("no normal -> null (not invented)", pctOfNormal(5, normalFor(n, "2026-03")) === null);
ok("latest key", latestKey(m) === "2026-07");
const k = lastNKeys("2026-02", 4);
ok("lastNKeys crosses year boundary", k.join() === "2025-11,2025-12,2026-01,2026-02", k.join());
ok("monthLabel", monthLabel("2026-01") === "Jan 26");
ok("mean needs enough months", mean([1, 2, undefined], 3) === null && mean([1, 2, 3], 3) === 2);
ok("sum needs enough months", sum([1, undefined], 2) === null && sum([1, 2], 2) === 3);
const few = new Map<string, number>(); for (let y = 2001; y <= 2005; y++) few.set(`${y}-01`, 10);
ok("fewer than 10 baseline years gives no normal", normals(few).size === 0);
