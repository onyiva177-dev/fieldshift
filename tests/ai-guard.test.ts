import test from "node:test";
import assert from "node:assert/strict";
// Hand-made test inputs only. Nothing here is real farm or NASA data.
import { readFileSync } from "fs";
import { recommend } from "../src/lib/engine/engine";
import { buildExplainPayload, numbersAreGrounded, rulesSummary, cleanAiText } from "../src/lib/ai/explain";
import { DEFAULT_WEIGHTS } from "../src/lib/engine/types";
const crops = JSON.parse(readFileSync("tests/fixtures/crops.json", "utf8")); const rules = JSON.parse(readFileSync("tests/fixtures/rules.json", "utf8"));
const rain: Record<number, number> = { 1: 50, 2: 60, 3: 150, 4: 200, 5: 180, 6: 80, 7: 60, 8: 70, 9: 90, 10: 120, 11: 130, 12: 80 };
const temp: Record<number, number> = {}; for (let m = 1; m <= 12; m++) temp[m] = 22;
const res = recommend({ farm: { county: "Kisumu", irrigationAvailable: false, irrigationType: null, waterSources: [], fertilizerPractices: [], priorities: ["soil_fertility"] },
  soil: [{ sampleId: "s", pointId: "p", pointLabel: "P1", sampledOn: "2026-09-01", parameter: "ph", valueNum: 6.2, valueText: null, unit: "pH", method: null }],
  previousCrops: [{ name: "Maize", status: "previous", plantedOn: null, harvestedOn: "2026-08-01", createdAt: "2026-03-01" }], crops, rules,
  climate: { rainfall: rain, rainfallSource: "test", temperature: temp, temperatureSource: "test" }, weights: DEFAULT_WEIGHTS, plantingMonth: 3, today: new Date("2026-11-15") });
const payload = buildExplainPayload(res);
const ok = (n: string, c: boolean) => test(n, () => assert.ok(c));
const top = payload.topCrops[0];
ok("honest text quoting engine numbers passes", numbersAreGrounded(`${top.name} ranks first with a score of ${top.score}. Confidence is ${payload.confidence.score}.`, payload));
ok("invented yield number is rejected", !numbersAreGrounded(`${top.name} should give 3.5 tonnes per hectare.`, payload));
ok("invented rainfall number is rejected", !numbersAreGrounded("Expect 842 mm of rain.", payload));
ok("text with no numbers passes", numbersAreGrounded("Plant beans after maize.", payload));
ok("markdown is stripped", cleanAiText("**Soybeans** are best\n- because") === "Soybeans are best\nbecause");
const summary = rulesSummary(res);
ok("rules summary mentions confidence, NASA averages and an officer", /Confidence is/.test(summary) && /not a forecast/.test(summary) && /agricultural officer/.test(summary));
ok("rules summary only uses numbers from the engine (guard accepts it)", numbersAreGrounded(summary, { ...payload, extra: res.ranked.slice(0, 3).map((c) => c.total) }));
console.log("\n" + summary);
