import test from "node:test";
import assert from "node:assert/strict";
// Hand-made test inputs only. Nothing here is real farm or NASA data.
import { computeAlerts } from "../src/lib/alerts";
import { recentPct, toMap, normals, latestKey } from "../src/lib/climate";
const ok = (n: string, c: boolean, e = "") => test(n, () => assert.ok(c, e));
const calm = { farmId: "f1", farmName: "Shamba", soil: { verified: 2, pending: 0, needsCorrection: 0, rejected: 0, latestVerifiedOn: "2026-06-01" }, rainRecentPct: 95, rainMonths: 3,
  nasa: { hasData: true, lastStatus: "succeeded", lastDataset: "POWER", lastMessage: null }, crops: { current: ["Maize"], recorded: 2 }, today: new Date("2026-11-15") };
ok("a healthy farm raises no alerts", computeAlerts(calm).length === 0);
const a1 = computeAlerts({ ...calm, soil: { ...calm.soil, verified: 0, latestVerifiedOn: null } });
ok("no verified soil -> warning that links to recommendations", a1.length === 1 && a1[0].level === "warning" && a1[0].href!.endsWith("/recommendations"));
ok("old soil test (3 years) -> warning", computeAlerts({ ...calm, soil: { ...calm.soil, latestVerifiedOn: "2023-10-01" } }).some((a) => a.text.includes("3 years old")));
const d = computeAlerts({ ...calm, rainRecentPct: 55 });
ok("dry spell -> warning that says satellite estimate and gives the percentage", d[0].level === "warning" && d[0].text.includes("55%") && d[0].text.includes("satellite estimate"));
ok("wet spell -> info", computeAlerts({ ...calm, rainRecentPct: 160 })[0].level === "info");
ok("exactly at the threshold (70%) is not an alert", computeAlerts({ ...calm, rainRecentPct: 70 }).length === 0);
ok("unknown rainfall (null) raises no rainfall alert", computeAlerts({ ...calm, rainRecentPct: null }).length === 0);
const mix = computeAlerts({ ...calm, soil: { ...calm.soil, pending: 2, needsCorrection: 1 }, nasa: { hasData: false, lastStatus: "failed", lastDataset: "SMAP", lastMessage: "Credentials missing" }, crops: { current: [], recorded: 0 } });
ok("warnings sort before info", mix[0].level === "warning" && mix[mix.length - 1].level === "info", mix.map((a) => a.level[0]).join(""));
ok("failed NASA update names the dataset and reason", mix.some((a) => a.text.includes("SMAP") && a.text.includes("Credentials missing")));
ok("plural wording", mix.some((a) => a.text.includes("2 soil tests are waiting")));
// recentPct against real normals
const rows: { period_start: string; value: number }[] = [];
for (let y = 2001; y <= 2020; y++) for (let m = 1; m <= 12; m++) rows.push({ period_start: `${y}-${String(m).padStart(2, "0")}-01`, value: 100 });
rows.push({ period_start: "2026-08-01", value: 50 }, { period_start: "2026-09-01", value: 50 }, { period_start: "2026-10-01", value: 50 });
const map = toMap(rows); const n = normals(map);
ok("recentPct: 3 months at half of normal = 50%", recentPct(map, n, "2026-10", 3) === 50);
ok("recentPct: missing month -> null, not guessed", recentPct(map, n, "2026-11", 3) === null);
ok("latestKey", latestKey(map) === "2026-10");
