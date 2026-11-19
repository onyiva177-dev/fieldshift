import test from "node:test";
import assert from "node:assert/strict";
// Hand-made test inputs only. Nothing here is real farm or NASA data.
import { parsePowerResponse, aggregateMonthly, buildPowerObservations } from "../src/lib/nasa/power";
import { parseCsv, parseModisCsv, parseSmapCsv } from "../src/lib/nasa/appeears";
const ok = (n: string, c: boolean, extra = "") => test(n, () => assert.ok(c, extra));

// --- POWER: January with every day valid, February missing 8 of 28 days (71% < 80%), March missing 3 days
const t2m: Record<string, number> = {}; const pr: Record<string, number> = {};
for (let d = 1; d <= 31; d++) { const k = `202601${String(d).padStart(2,"0")}`; t2m[k] = 20; pr[k] = 2; }
for (let d = 1; d <= 28; d++) { const k = `202602${String(d).padStart(2,"0")}`; t2m[k] = d <= 8 ? -999 : 22; pr[k] = d <= 8 ? -999 : 1; }
for (let d = 1; d <= 31; d++) { const k = `202603${String(d).padStart(2,"0")}`; t2m[k] = d <= 3 ? -999 : 24; pr[k] = d <= 3 ? -999 : 3; }
const json = { properties: { parameter: { T2M: t2m, PRECTOTCORR: pr } }, header: { fill_value: -999 }, parameters: { T2M: { units: "C" }, PRECTOTCORR: { units: "mm/day" } } };
const p = parsePowerResponse(json, "u");
ok("fill values become null", p.series.T2M["20260201"] === null);
ok("units come from NASA", p.units.T2M === "C" && p.units.PRECTOTCORR === "mm/day");
const mean = aggregateMonthly(p.series.T2M, "mean");
ok("Feb dropped (low coverage), Jan+Mar kept", mean.length === 2 && mean[0].periodStart === "2026-01-01" && mean[1].periodStart === "2026-03-01", JSON.stringify(mean.map(m => m.periodStart)));
ok("January mean = 20", mean[0].value === 20);
const sum = aggregateMonthly(p.series.PRECTOTCORR, "sum");
ok("January rainfall sum = 62 mm", sum[0].value === 62, String(sum[0].value));
ok("March sum scaled for 3 missing days = 93 mm", sum[1].value === 93, String(sum[1].value));
ok("period_end is last day", mean[0].periodEnd === "2026-01-31");
const obs = buildPowerObservations(p, ["T2M", "PRECTOTCORR", "NOPE"]);
ok("observations carry kind/resolution/unit", obs.length === 4 && obs.every(o => o.kind === "model_derived" && o.spatial_resolution.includes("0.5")) && obs.find(o => o.variable === "PRECTOTCORR")!.unit === "mm/month");
let threw = false; try { parsePowerResponse({ foo: 1 }, "u"); } catch { threw = true; }
ok("unexpected response rejected", threw);

// --- CSV
const q = parseCsv('ID,Note,Date\nfarm,"a, ""quoted"" note",2026-01-01\r\nfarm,plain,2026-01-17\n');
ok("CSV quotes and CRLF", q.length === 2 && q[0].Note === 'a, "quoted" note' && q[1].Date === "2026-01-17");

// --- MODIS: raw scaled ints, reliability filter, fill value
const modis = [
  "ID,Latitude,Longitude,Date,MOD13Q1_061__250m_16_days_NDVI,MOD13Q1_061__250m_16_days_EVI,MOD13Q1_061__250m_16_days_pixel_reliability",
  "farm,-0.09,34.76,2026-01-01,6500,3200,0",
  "farm,-0.09,34.76,2026-01-17,7000,3500,1",
  "farm,-0.09,34.76,2026-02-02,5000,2500,2",   // snow/ice -> dropped
  "farm,-0.09,34.76,2026-02-18,-3000,-3000,-1", // fill -> dropped
  "farm,-0.09,34.76,2026-03-06,0.55,0.31,0",   // already scaled
].join("\n");
const m = parseModisCsv(modis);
ok("MODIS: good rows kept, bad dropped", m.filter(x => x.variable === "NDVI").length === 3, JSON.stringify(m.filter(x=>x.variable==="NDVI").map(x => x.value)));
ok("MODIS: raw values scaled by 0.0001", m[0].value === 0.65);
ok("MODIS: composite end = start + 15 days", m[0].period_end === "2026-01-16");
ok("MODIS: labelled satellite_observed, 250 m", m[0].kind === "satellite_observed" && m[0].spatial_resolution.includes("250"));
let t2 = false; try { parseModisCsv("Date,Foo\n2026-01-01,1"); } catch { t2 = true; }
ok("MODIS: missing columns rejected", t2);

// --- SMAP
const rows = ["ID,Date,SPL3SMP_E_006_Soil_Moisture_Retrieval_Data_AM_soil_moisture,SPL3SMP_E_006_Soil_Moisture_Retrieval_Data_AM_retrieval_qual_flag"];
for (let d = 1; d <= 6; d++) rows.push(`farm,2026-01-0${d},0.${20 + d},0`);   // 6 good Jan values
rows.push("farm,2026-01-07,-9999,0", "farm,2026-01-08,0.30,1");              // fill and low-quality flag -> dropped
rows.push("farm,2026-02-01,0.25,0", "farm,2026-02-02,0.26,0");               // only 2 in Feb -> month dropped
const s = parseSmapCsv(rows.join("\n"), "Soil_Moisture_Retrieval_Data_AM_soil_moisture", "Soil_Moisture_Retrieval_Data_AM_retrieval_qual_flag");
ok("SMAP: one month kept (Jan), Feb dropped for too few days", s.length === 1 && s[0].periodStart === "2026-01-01");
ok("SMAP: mean of 6 good values = 0.235", s[0].value === 0.235, String(s[0].value));
