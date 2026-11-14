import { SOIL_PARAMS, SOURCES } from "@/lib/soil-parameters";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_VALUES: string[] = SOURCES.map((s) => s.value);
export const CUSTOM_ROWS = 3;

function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return raw !== "" && Number.isFinite(n) ? n : null;
}

/** Turns the soil sample form into the JSON the database function expects. Blank values are recorded as "not available". */
export function parseSoilForm(fd: FormData): { payload?: Record<string, unknown>; error?: string } {
  const get = (k: string) => String(fd.get(k) ?? "").trim();

  const farmId = get("farmId");
  const pointId = get("samplingPointId");
  const sampledOn = get("sampledOn");
  const testedOn = get("testedOn");
  const responsible = get("responsibleParty");
  const supersedes = get("supersedesId");

  if (!UUID.test(farmId)) return { error: "Farm not found." };
  if (!UUID.test(pointId)) return { error: "Choose the sampling point." };
  if (!DATE.test(sampledOn)) return { error: "Enter the sampling date." };
  if (testedOn && !DATE.test(testedOn)) return { error: "Enter a valid test date." };
  if (testedOn && testedOn < sampledOn) return { error: "The test date cannot be before the sampling date." };
  if (responsible.length < 2 || responsible.length > 120) {
    return { error: "Enter who is responsible for these results (the officer or the laboratory)." };
  }
  if (supersedes && !UUID.test(supersedes)) return { error: "Invalid sample to replace." };

  const depthRaw = get("sampleDepthCm");
  let depth: number | null = null;
  if (depthRaw) {
    depth = parseNumber(depthRaw);
    if (depth === null || !Number.isInteger(depth) || depth < 1 || depth > 300) {
      return { error: "Sampling depth must be a whole number of centimetres between 1 and 300." };
    }
  }
  const labName = get("labName");
  const labRef = get("labReference");
  const notes = get("notes");
  if (labName.length > 120 || labRef.length > 80 || notes.length > 500) return { error: "One of the text fields is too long." };

  const measuredOn = testedOn || sampledOn;
  const measurements: Record<string, unknown>[] = [];
  let withValue = 0;

  for (const p of SOIL_PARAMS) {
    const raw = get(`val_${p.key}`);
    const method = get(`method_${p.key}`);
    const srcRaw = get(`src_${p.key}`);
    const source = SOURCE_VALUES.includes(srcRaw) ? srcRaw : p.defaultSource;
    if (method.length > 120) return { error: `${p.label}: the method name is too long.` };

    const row: Record<string, unknown> = {
      parameter: p.key, source, responsible_party: responsible, method: method || null, measured_on: measuredOn,
      value_num: null, value_text: null, unit: null,
    };

    if (raw) {
      if (p.kind === "number") {
        const unit = get(`unit_${p.key}`);
        if (!p.units.includes(unit)) return { error: `${p.label}: choose a unit.` };
        const n = parseNumber(raw);
        if (n === null) return { error: `${p.label}: enter a number.` };
        const [lo, hi] = p.ranges[unit];
        if (n < lo || n > hi) {
          return { error: `${p.label} should be between ${lo} and ${hi} ${unit}. Check for a typing error.` };
        }
        row.value_num = n;
        row.unit = unit;
      } else {
        if (!p.options.some((o) => o.value === raw)) return { error: `${p.label}: choose one of the listed options.` };
        row.value_text = raw;
      }
      withValue++;
    } else {
      row.method = null; // nothing was measured, so no method either
    }
    measurements.push(row);
  }

  const seen = new Set<string>();
  for (let i = 1; i <= CUSTOM_ROWS; i++) {
    const name = get(`cname_${i}`).replace(/\s+/g, " ");
    const raw = get(`cval_${i}`);
    const unit = get(`cunit_${i}`);
    const method = get(`cmethod_${i}`);
    if (!name && !raw && !unit && !method) continue;
    if (name.length < 2 || name.length > 60) return { error: `Additional measurement ${i}: enter a name (2 to 60 characters).` };
    const n = parseNumber(raw);
    if (n === null || n < 0 || n > 1e9) return { error: `${name}: enter a number of zero or more.` };
    if (!unit || unit.length > 20) return { error: `${name}: enter the unit.` };
    if (method.length > 120) return { error: `${name}: the method name is too long.` };
    const key = `custom:${name}`;
    if (seen.has(key.toLowerCase())) return { error: `${name} is listed twice.` };
    seen.add(key.toLowerCase());
    measurements.push({
      parameter: key, value_num: n, unit, method: method || null, measured_on: measuredOn,
      source: "laboratory", responsible_party: responsible, value_text: null,
    });
    withValue++;
  }

  if (withValue === 0) return { error: "Enter at least one measurement. Leave a field empty if it was not measured." };

  return {
    payload: {
      farm_id: farmId, sampling_point_id: pointId, sampled_on: sampledOn, sample_depth_cm: depth,
      lab_name: labName, lab_reference: labRef, notes, supersedes_sample_id: supersedes || null, measurements,
    },
  };
}
