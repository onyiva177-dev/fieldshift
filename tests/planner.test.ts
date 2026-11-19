import test from "node:test";
import assert from "node:assert/strict";
// Hand-made test inputs only. Nothing here is real farm or NASA data.
import { readFileSync } from "fs";
import { buildSeasons, planAll, planStrategy, STRATEGIES } from "../src/lib/engine/planner";
import { DEFAULT_WEIGHTS, type SoilMeasurementIn } from "../src/lib/engine/types";
const crops = JSON.parse(readFileSync("tests/fixtures/crops.json", "utf8")); const rules = JSON.parse(readFileSync("tests/fixtures/rules.json", "utf8"));
const ok = (n: string, c: boolean, e = "") => test(n, () => assert.ok(c, e));
const rain: Record<number, number> = { 1: 50, 2: 60, 3: 150, 4: 200, 5: 180, 6: 80, 7: 60, 8: 70, 9: 90, 10: 120, 11: 130, 12: 80 };
const temp: Record<number, number> = {}; for (let m = 1; m <= 12; m++) temp[m] = 22;
const m = (parameter: string, valueNum: number | null, unit: string | null, method: string | null, valueText: string | null = null): SoilMeasurementIn =>
  ({ sampleId: "s1", pointId: "p1", pointLabel: "p1", sampledOn: "2026-09-01", parameter, valueNum, valueText, unit, method });
const soil = [m("ph", 6.2, "pH", null), m("nitrogen_total", 0.12, "%", null), m("phosphorus_available", 12, "mg/kg", "Olsen"), m("potassium_exchangeable", 0.3, "cmol(+)/kg", null), m("organic_carbon", 1.6, "%", null), m("soil_texture", null, null, null, "clay_loam"), m("drainage", null, null, null, "well")];
const base = { farm: { county: "Kisumu", irrigationAvailable: false, irrigationType: null, waterSources: ["rainfall"], fertilizerPractices: [], priorities: ["soil_fertility"] }, soil,
  previousCrops: [{ name: "Maize", status: "current" as const, plantedOn: "2026-10-01", harvestedOn: null, createdAt: "2026-10-01" }], crops, rules,
  climate: { rainfall: rain, rainfallSource: "test", temperature: temp, temperatureSource: "test" }, today: new Date("2026-11-15") };

const slots = buildSeasons(rain, base.today, 4);
ok("seasons follow the farm's two rainy windows in order", slots.map((s) => s.label).join() === "March 2027,September 2027,March 2028,September 2028", slots.map((s) => s.label).join());
const noData = buildSeasons(null, base.today, 4);
ok("without rainfall data, seasons are still produced (6 months apart)", noData.length === 4 && noData[1].month === ((noData[0].month + 5) % 12) + 1, noData.map((s) => s.label).join());

const plans = planAll(base, DEFAULT_WEIGHTS, slots);
ok("all five strategies produce a plan", plans.length === 5);
const variety = plans.find((p) => p.strategy.key === "variety")!;
console.log("variety:", variety.seasons.map((s) => s.crop.name).join(" -> "));
ok("variety strategy never repeats a crop", new Set(variety.seasons.map((s) => s.crop.cropId)).size === 4);
ok("variety strategy still avoids back-to-back same family where possible", variety.metrics.weakRotationSeasons === 0, String(variety.metrics.weakRotationSeasons));
const bal = plans[0];
console.log("balanced:", bal.seasons.map((s) => `${s.slot.label}: ${s.crop.name} (${s.crop.total})`).join(" -> "));
ok("current maize counts as the previous crop: season 1 is not a cereal", bal.seasons[0].crop.group !== "cereal", bal.seasons[0].crop.name);
ok("no crop is repeated in consecutive seasons", !bal.metrics.sameCropRepeated);
ok("plan alternates families (at least 2 distinct)", bal.metrics.distinctFamilies >= 2);
ok("cassava (long crop) is left out and reported", bal.skippedLong.includes("Cassava") && !bal.seasons.some((s) => s.crop.slug === "cassava"));
ok("rice (not suitable) never appears", plans.every((p) => !p.seasons.some((s) => s.crop.slug === "rice")));
const soilPlan = plans.find((p) => p.strategy.key === "soil")!; const dry = plans.find((p) => p.strategy.key === "drought")!; const cost = plans.find((p) => p.strategy.key === "cost")!;
console.log("soil:", soilPlan.seasons.map((s) => s.crop.name).join(" -> "), "| drought:", dry.seasons.map((s) => s.crop.name).join(" -> "), "| cost:", cost.seasons.map((s) => s.crop.name).join(" -> "));
ok("soil strategy has at least as many nitrogen-fixing seasons as the drought strategy", soilPlan.metrics.nFixingSeasons >= dry.metrics.nFixingSeasons, `${soilPlan.metrics.nFixingSeasons} vs ${dry.metrics.nFixingSeasons}`);
const droughtMean = (p: typeof dry) => p.seasons.reduce((a, s) => a + (s.crop.components.find((c) => c.key === "water")?.score ?? 0), 0) / p.seasons.length;
ok("drought strategy has a water score no lower than the soil strategy", droughtMean(dry) >= droughtMean(soilPlan) - 0.01, `${droughtMean(dry).toFixed(1)} vs ${droughtMean(soilPlan).toFixed(1)}`);
// lookahead should never do worse than width-1 (greedy)
const greedy = planStrategy(base, DEFAULT_WEIGHTS, STRATEGIES[0], slots, 1)!;
ok("beam search total is at least the greedy total", bal.metrics.avgScore >= greedy.metrics.avgScore - 0.001, `${bal.metrics.avgScore} vs greedy ${greedy.metrics.avgScore}`);
// previous crop = beans => season 1 should not be another legume
const afterBeans = planStrategy({ ...base, previousCrops: [{ name: "Common beans", status: "previous", plantedOn: "2026-03-01", harvestedOn: "2026-07-01", createdAt: "2026-03-01" }] }, DEFAULT_WEIGHTS, STRATEGIES[0], slots)!;
ok("after beans, season 1 is not a legume", afterBeans.seasons[0].crop.group !== "legume", afterBeans.seasons[0].crop.name);
// no suitable crops at all => null, not a crash
const hostile = planStrategy({ ...base, climate: { ...base.climate, temperature: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, -5])) } }, DEFAULT_WEIGHTS, STRATEGIES[0], slots);
ok("when nothing is suitable the planner returns nothing instead of inventing a plan", hostile === null);
ok("metrics are filled in", typeof bal.metrics.avgScore === "number" && bal.metrics.seasons === 4);
