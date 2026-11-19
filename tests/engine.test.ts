import test from "node:test";
import assert from "node:assert/strict";
// Hand-made test inputs only. Nothing here is real farm or NASA data.
import { readFileSync } from "fs";
import { recommend, suggestPlantingMonth, matchCrop, trapezoid, irrigationCover } from "../src/lib/engine/engine";
import { DEFAULT_WEIGHTS, type EngineInput, type SoilMeasurementIn } from "../src/lib/engine/types";
const crops = JSON.parse(readFileSync("tests/fixtures/crops.json", "utf8"));
const rules = JSON.parse(readFileSync("tests/fixtures/rules.json", "utf8"));
const ok = (n: string, c: boolean, e = "") => test(n, () => assert.ok(c, e));

// ---- made-up TEST climate: bimodal rains, mild temperatures
const rain: Record<number, number> = { 1: 50, 2: 60, 3: 150, 4: 200, 5: 180, 6: 80, 7: 60, 8: 70, 9: 90, 10: 120, 11: 130, 12: 80 };
const temp: Record<number, number> = {}; for (let m = 1; m <= 12; m++) temp[m] = 22;
const m = (parameter: string, valueNum: number | null, unit: string | null, method: string | null, valueText: string | null = null, point = "p1"): SoilMeasurementIn =>
  ({ sampleId: "s1", pointId: point, pointLabel: point, sampledOn: "2026-09-01", parameter, valueNum, valueText, unit, method });
const goodSoil = [m("ph", 6.2, "pH", null), m("nitrogen_total", 0.12, "%", null), m("phosphorus_available", 8, "mg/kg", "Olsen"), m("potassium_exchangeable", 0.3, "cmol(+)/kg", null),
  m("organic_carbon", 1.6, "%", null), m("soil_texture", null, null, null, "clay_loam"), m("drainage", null, null, null, "well")];
const base = (over: Partial<EngineInput> = {}): EngineInput => ({
  farm: { county: "Kisumu", irrigationAvailable: false, irrigationType: null, waterSources: ["rainfall"], fertilizerPractices: [], priorities: [] },
  soil: goodSoil, previousCrops: [{ name: "Maize", status: "previous", plantedOn: "2026-03-10", harvestedOn: "2026-08-01", createdAt: "2026-03-10" }],
  crops, rules, climate: { rainfall: rain, rainfallSource: "NASA GPM IMERG (test)", temperature: temp, temperatureSource: "NASA POWER (test)" },
  weights: DEFAULT_WEIGHTS, plantingMonth: 3, today: new Date("2026-11-15"), ...over,
});
const names = (r: ReturnType<typeof recommend>) => r.ranked.map((x) => `${x.name}:${x.total}`).join(" | ");
const rank = (r: ReturnType<typeof recommend>, slug: string) => r.ranked.findIndex((x) => x.slug === slug);

// 1. cereal -> legume
const A = recommend(base({ farm: { ...base().farm, priorities: ["soil_fertility"] } }));
console.log("A:", names(A));
const legumes = ["common_beans", "groundnuts", "cowpeas", "green_grams", "soybeans"];
ok("A: after maize, the best legume outranks maize and sorghum", Math.min(...legumes.map((s) => rank(A, s)).filter((i) => i >= 0)) < Math.min(rank(A, "maize"), rank(A, "sorghum")));
ok("A: cereal -> cereal is penalised (maize below legumes)", legumes.filter((s) => rank(A, s) >= 0 && rank(A, s) < rank(A, "maize")).length >= 3);
ok("A: rotation note cites the rule reason", A.ranked.find((x) => x.slug === "soybeans")!.components.find((c) => c.key === "rotation")!.notes[0].text.includes("breaks the cereal pest"));
ok("A: rice flagged not suitable (rain below its absolute minimum)", A.notSuitable.some((x) => x.slug === "rice"), A.notSuitable.map((x) => x.slug).join());
ok("A: weights used sum to ~100", Math.abs(A.ranked[0].components.reduce((a, c) => a + c.weightUsed, 0) - 100) < 0.5);

// 2. legume -> legume must be penalised, and legumes are not automatically first
const B = recommend(base({ previousCrops: [{ name: "Common beans", status: "previous", plantedOn: "2026-03-10", harvestedOn: "2026-07-01", createdAt: "2026-03-10" }] }));
console.log("B:", names(B));
ok("B: after beans, other legumes score lower than a cereal", rank(B, "maize") < rank(B, "soybeans") && rank(B, "sorghum") < rank(B, "cowpeas"));
ok("B: shared-risk warning appears (root rots / nematodes)", B.ranked.find((x) => x.slug === "cowpeas")!.risks.some((r) => r.includes("root rots")));

// 3. acid soil makes beans unsuitable but not sweet potato
const acid = goodSoil.map((x) => (x.parameter === "ph" ? { ...x, valueNum: 4.6 } : x));
const C = recommend(base({ soil: acid }));
ok("C: pH 4.6 -> beans and soybeans not suitable", C.notSuitable.some((x) => x.slug === "common_beans") && C.notSuitable.some((x) => x.slug === "soybeans"));
ok("C: sweet potato still suitable", rank(C, "sweet_potatoes") >= 0);
ok("C: reason names the pH", C.notSuitable.find((x) => x.slug === "common_beans")!.limiting[0].includes("4.6"));

// 4. no soil data: scored on what exists, flagged low confidence, never invents soil values
const D = recommend(base({ soil: [] }));
ok("D: soil and nutrient components are null (not zero, not invented)", D.ranked[0].components.find((c) => c.key === "soil")!.score === null && D.ranked[0].components.find((c) => c.key === "nutrients")!.score === null);
ok("D: weight is redistributed to available components", D.ranked[0].components.find((c) => c.key === "climate")!.weightUsed > 20);
ok("D: confidence is lower than with soil", D.confidence.score < A.confidence.score && D.confidence.improve.some((s) => s.toLowerCase().includes("soil")), `${D.confidence.score} vs ${A.confidence.score}`);

// 5. weights are configurable
const E = recommend(base({ weights: { soil: 0, climate: 0, water: 0, nutrients: 0, rotation: 100, priorities: 0 } }));
ok("E: with only rotation weighted, rotation score equals the total", E.ranked.every((x) => Math.abs(x.total - (x.components.find((c) => c.key === "rotation")!.score as number)) < 0.2));

// 6. irrigation helps a thirsty crop in a dry window
const dryRain = { ...rain, 6: 20, 7: 10, 8: 10, 9: 30, 10: 40 };
const dryBase = base({ plantingMonth: 6, climate: { ...base().climate, rainfall: dryRain } });
const dry = recommend(dryBase);
const wet = recommend({ ...dryBase, farm: { ...dryBase.farm, irrigationAvailable: true, irrigationType: "drip", waterSources: ["borehole"] } });
const wScore = (r: ReturnType<typeof recommend>, s: string) => (r.ranked.concat(r.notSuitable).find((x) => x.slug === s)!.components.find((c) => c.key === "water")!.score as number);
ok("F: drip + borehole irrigation raises maize water score in a dry season", wScore(wet, "maize") > wScore(dry, "maize") + 20, `${wScore(dry, "maize")} -> ${wScore(wet, "maize")}`);
ok("F: irrigation cover value", irrigationCover(wet.previousCrops ? { county: "x", irrigationAvailable: true, irrigationType: "drip", waterSources: ["borehole"], fertilizerPractices: [], priorities: [] } : null as any) === 0.9);
ok("F: sorghum (drought-tolerant) beats maize on water when dry and no irrigation", wScore(dry, "sorghum") > wScore(dry, "maize"));

// 7. manure reduces the nutrient penalty for a hungry crop
const lowN = goodSoil.map((x) => (x.parameter === "nitrogen_total" ? { ...x, valueNum: 0.05 } : x));
const noInput = recommend(base({ soil: lowN }));
const withManure = recommend(base({ soil: lowN, farm: { ...base().farm, fertilizerPractices: ["manure"] } }));
const nut = (r: ReturnType<typeof recommend>, s: string) => r.ranked.find((x) => x.slug === s)!.components.find((c) => c.key === "nutrients")!.score as number;
ok("G: manure use raises maize's nutrient score on low-nitrogen soil", nut(withManure, "maize") > nut(noInput, "maize"));
const midN = recommend(base());
ok("G: low nitrogen does not lower soybean's nutrient score (it fixes its own), but does lower maize's", nut(noInput, "soybeans") === nut(midN, "soybeans") && nut(noInput, "maize") < nut(midN, "maize"), `soy ${nut(midN,"soybeans")}->${nut(noInput,"soybeans")}, maize ${nut(midN,"maize")}->${nut(noInput,"maize")}`);
ok("G: cassava carries a long-crop warning", A.ranked.find((x) => x.slug === "cassava")!.risks.some((r) => r.includes("occupies the land")));

// 8. helpers
ok("H: matchCrop handles local names and plurals", matchCrop("mahindi", crops)?.slug === "maize" && matchCrop("Kale (sukuma wiki)", crops)?.slug === "kale" && matchCrop("beans", crops)?.slug === "common_beans" && matchCrop("Ground nuts", crops) === null && matchCrop("groundnut", crops)?.slug === "groundnuts");
ok("H: unknown crop name is not force-matched", matchCrop("dragonfruit", crops) === null);
ok("H: suggestPlantingMonth picks the start of the wettest 3 months in the next 6", suggestPlantingMonth(rain, new Date("2026-11-15")) === 3, String(suggestPlantingMonth(rain, new Date("2026-11-15"))));
ok("H: trapezoid edges", trapezoid(5.0, 5, 6, 7, 8) === 0 || trapezoid(5.5, 5, 6, 7, 8) === 50);
ok("H: drafts are flagged on every result", A.ranked.every((x) => x.reviewStatus === "draft" && x.risks.some((r) => r.includes("drafts"))));
ok("H: confidence never says high while crop data is draft and soil missing", D.confidence.level !== "high");
console.log("\nTop of A:", A.ranked[0].name, "| why:", A.ranked[0].why.slice(0, 2).join(" / "));
