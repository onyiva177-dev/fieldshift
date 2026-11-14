export const SOURCES = [
  { value: "laboratory", label: "Laboratory test" },
  { value: "field_kit", label: "Field test kit" },
  { value: "field_test", label: "Field instrument (meter or probe)" },
  { value: "visual_assessment", label: "Field observation" },
] as const;
export type SourceValue = (typeof SOURCES)[number]["value"];

interface Base {
  key: string;
  label: string;
  methods: readonly string[];
  defaultSource: SourceValue;
  help?: string;
}
export interface NumericParam extends Base {
  kind: "number";
  units: readonly string[];
  ranges: Record<string, [number, number]>; // plausible range per unit; guards against typing errors
}
export interface CategoryParam extends Base {
  kind: "category";
  options: readonly { value: string; label: string }[];
}
export type SoilParam = NumericParam | CategoryParam;

export const TEXTURE_OPTIONS = [
  { value: "sand", label: "Sand" },
  { value: "loamy_sand", label: "Loamy sand" },
  { value: "sandy_loam", label: "Sandy loam" },
  { value: "loam", label: "Loam" },
  { value: "silt_loam", label: "Silt loam" },
  { value: "silt", label: "Silt" },
  { value: "sandy_clay_loam", label: "Sandy clay loam" },
  { value: "clay_loam", label: "Clay loam" },
  { value: "silty_clay_loam", label: "Silty clay loam" },
  { value: "sandy_clay", label: "Sandy clay" },
  { value: "silty_clay", label: "Silty clay" },
  { value: "clay", label: "Clay" },
] as const;

export const DRAINAGE_OPTIONS = [
  { value: "very_poor", label: "Very poor (waterlogged most of the year)" },
  { value: "poor", label: "Poor" },
  { value: "imperfect", label: "Imperfect" },
  { value: "moderate", label: "Moderately well drained" },
  { value: "well", label: "Well drained" },
  { value: "excessive", label: "Excessively drained" },
] as const;

export const SOIL_PARAMS: readonly SoilParam[] = [
  { key: "ph", label: "Soil pH", kind: "number", units: ["pH"], ranges: { pH: [2, 11] },
    methods: ["Water 1:2.5", "CaCl2 1:2.5", "Field pH meter", "Field test kit"], defaultSource: "laboratory" },
  { key: "nitrogen_total", label: "Nitrogen (total)", kind: "number", units: ["%", "mg/kg"],
    ranges: { "%": [0, 2], "mg/kg": [0, 20000] }, methods: ["Kjeldahl", "Dumas combustion", "Field test kit"], defaultSource: "laboratory" },
  { key: "phosphorus_available", label: "Phosphorus (available)", kind: "number", units: ["mg/kg", "ppm"],
    ranges: { "mg/kg": [0, 1000], ppm: [0, 1000] }, methods: ["Olsen", "Mehlich-3", "Bray-1", "Field test kit"], defaultSource: "laboratory" },
  { key: "potassium_exchangeable", label: "Potassium (exchangeable)", kind: "number", units: ["cmol(+)/kg", "mg/kg", "ppm"],
    ranges: { "cmol(+)/kg": [0, 10], "mg/kg": [0, 3000], ppm: [0, 3000] }, methods: ["Ammonium acetate", "Mehlich-3", "Field test kit"], defaultSource: "laboratory" },
  { key: "organic_carbon", label: "Organic carbon", kind: "number", units: ["%"], ranges: { "%": [0, 60] },
    methods: ["Walkley-Black", "Dry combustion"], defaultSource: "laboratory", help: "Enter organic carbon or organic matter, whichever you have." },
  { key: "organic_matter", label: "Organic matter", kind: "number", units: ["%"], ranges: { "%": [0, 100] },
    methods: ["Loss on ignition", "Calculated from organic carbon"], defaultSource: "laboratory" },
  { key: "soil_moisture", label: "Soil moisture at sampling", kind: "number", units: ["% volumetric", "% gravimetric"],
    ranges: { "% volumetric": [0, 100], "% gravimetric": [0, 100] }, methods: ["Gravimetric (oven-dry)", "Probe (TDR or capacitance)"], defaultSource: "field_test" },
  { key: "electrical_conductivity", label: "Electrical conductivity", kind: "number", units: ["dS/m", "mS/cm", "uS/cm"],
    ranges: { "dS/m": [0, 50], "mS/cm": [0, 50], "uS/cm": [0, 50000] }, methods: ["1:5 water extract", "Saturated paste", "Field meter"], defaultSource: "laboratory" },
  { key: "soil_depth", label: "Soil depth (to rock or hardpan)", kind: "number", units: ["cm"], ranges: { cm: [1, 500] },
    methods: ["Auger", "Soil pit"], defaultSource: "field_test" },
  { key: "soil_texture", label: "Soil texture", kind: "category", options: TEXTURE_OPTIONS,
    methods: ["Hydrometer", "Pipette", "Field feel method"], defaultSource: "laboratory" },
  { key: "drainage", label: "Drainage", kind: "category", options: DRAINAGE_OPTIONS,
    methods: ["Field observation"], defaultSource: "visual_assessment" },
];

export const paramByKey = (key: string) => SOIL_PARAMS.find((p) => p.key === key);

export function parameterLabel(key: string): string {
  if (key.startsWith("custom:")) return key.slice(7);
  return paramByKey(key)?.label ?? key;
}

export function categoryLabel(key: string, value: string): string {
  const p = paramByKey(key);
  if (p?.kind === "category") return p.options.find((o) => o.value === value)?.label ?? value;
  return value;
}

export const sourceLabel = (v: string) => SOURCES.find((s) => s.value === v)?.label ?? v;
