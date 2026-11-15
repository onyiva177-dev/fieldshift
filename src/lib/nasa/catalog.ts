// One place that says what each NASA variable is, where it comes from, and how far to trust it.
// Used when writing observations and when showing them, so labels can never drift apart.

export type ObsKind = "satellite_observed" | "satellite_estimate" | "model_derived";
export type Dataset = "POWER" | "IMERG" | "SMAP" | "MODIS";

export interface VariableInfo {
  key: string;
  dataset: Dataset;
  label: string;
  product: string;
  kind: ObsKind;
  spatialResolution: string;
  aggregation: "monthly_mean" | "monthly_sum" | "composite_16day";
  unit: string; // unit as stored (after aggregation)
  sourceUrl: string;
  limitation: string;
}

const POWER_URL = "https://power.larc.nasa.gov/docs/services/api/temporal/daily/";
const MERRA = "NASA POWER daily point API, meteorology from MERRA-2 reanalysis";

export const VARIABLES: Record<string, VariableInfo> = {
  T2M: { key: "T2M", dataset: "POWER", label: "Air temperature (mean)", product: MERRA, kind: "model_derived",
    spatialResolution: "0.5 x 0.625 degrees (about 55 x 70 km)", aggregation: "monthly_mean", unit: "C", sourceUrl: POWER_URL,
    limitation: "A grid-cell average from a model, not a thermometer on your farm. Hills and valleys inside the cell are smoothed out." },
  T2M_MAX: { key: "T2M_MAX", dataset: "POWER", label: "Daily maximum temperature (mean)", product: MERRA, kind: "model_derived",
    spatialResolution: "0.5 x 0.625 degrees (about 55 x 70 km)", aggregation: "monthly_mean", unit: "C", sourceUrl: POWER_URL,
    limitation: "Model grid-cell value. Local extremes can differ." },
  T2M_MIN: { key: "T2M_MIN", dataset: "POWER", label: "Daily minimum temperature (mean)", product: MERRA, kind: "model_derived",
    spatialResolution: "0.5 x 0.625 degrees (about 55 x 70 km)", aggregation: "monthly_mean", unit: "C", sourceUrl: POWER_URL,
    limitation: "Model grid-cell value. Cold air pockets and frost hollows are not captured." },
  RH2M: { key: "RH2M", dataset: "POWER", label: "Relative humidity (mean)", product: MERRA, kind: "model_derived",
    spatialResolution: "0.5 x 0.625 degrees (about 55 x 70 km)", aggregation: "monthly_mean", unit: "%", sourceUrl: POWER_URL,
    limitation: "Model grid-cell value." },
  PRECTOTCORR: { key: "PRECTOTCORR", dataset: "POWER", label: "Rainfall (MERRA-2, bias-corrected)", product: MERRA, kind: "model_derived",
    spatialResolution: "0.5 x 0.625 degrees (about 55 x 70 km)", aggregation: "monthly_sum", unit: "mm/month", sourceUrl: POWER_URL,
    limitation: "Model rainfall adjusted with gauge and satellite data. Local storms can be missed or smoothed." },
  ALLSKY_SFC_SW_DWN: { key: "ALLSKY_SFC_SW_DWN", dataset: "POWER", label: "Sunlight reaching the ground (mean)", product: "NASA POWER daily point API, solar from CERES SYN1deg and FLASHFlux",
    kind: "satellite_estimate", spatialResolution: "1 x 1 degree (about 110 km)", aggregation: "monthly_mean", unit: "MJ/m2/day", sourceUrl: POWER_URL,
    limitation: "Satellite-derived estimate on a coarse grid." },
  GWETTOP: { key: "GWETTOP", dataset: "POWER", label: "Surface soil wetness (model)", product: MERRA, kind: "model_derived",
    spatialResolution: "0.5 x 0.625 degrees (about 55 x 70 km)", aggregation: "monthly_mean", unit: "0-1 index", sourceUrl: POWER_URL,
    limitation: "A model index from 0 (dry) to 1 (saturated) for the surface layer. Not a measurement of your soil." },
  GWETROOT: { key: "GWETROOT", dataset: "POWER", label: "Root-zone soil wetness (model)", product: MERRA, kind: "model_derived",
    spatialResolution: "0.5 x 0.625 degrees (about 55 x 70 km)", aggregation: "monthly_mean", unit: "0-1 index", sourceUrl: POWER_URL,
    limitation: "A model index from 0 (dry) to 1 (saturated) for roughly the top 1 m. Not a measurement of your soil." },
  IMERG_PRECTOT: { key: "IMERG_PRECTOT", dataset: "IMERG", label: "Rainfall (GPM IMERG satellite)", product: "GPM IMERG (Final Run) served through the NASA POWER API",
    kind: "satellite_estimate", spatialResolution: "0.1 x 0.1 degrees (about 10 km)", aggregation: "monthly_sum", unit: "mm/month", sourceUrl: POWER_URL,
    limitation: "Satellite rainfall estimate. Final-run data arrives about 4 months after the month ends. Not a rain gauge." },
  SMAP_SM: { key: "SMAP_SM", dataset: "SMAP", label: "Surface soil moisture (SMAP)", product: "SMAP Enhanced L3 Radiometer Global Daily 9 km (SPL3SMP_E) via AppEEARS",
    kind: "satellite_estimate", spatialResolution: "9 km grid, top 5 cm of soil", aggregation: "monthly_mean", unit: "m3/m3",
    sourceUrl: "https://appeears.earthdatacloud.nasa.gov/",
    limitation: "Describes roughly a 9 km area and only the top 5 cm. A regional signal, not your field. Dense crops and rough terrain reduce accuracy." },
  NDVI: { key: "NDVI", dataset: "MODIS", label: "Vegetation greenness (NDVI)", product: "MODIS Terra Vegetation Indices 16-day (MOD13Q1 v061) via AppEEARS",
    kind: "satellite_observed", spatialResolution: "250 m, 16-day composites", aggregation: "composite_16day", unit: "index", sourceUrl: "https://appeears.earthdatacloud.nasa.gov/",
    limitation: "Greenness of the 250 m pixel that contains the farm pin, which may include neighbouring land. Clouds can reduce usable observations." },
  EVI: { key: "EVI", dataset: "MODIS", label: "Vegetation greenness (EVI)", product: "MODIS Terra Vegetation Indices 16-day (MOD13Q1 v061) via AppEEARS",
    kind: "satellite_observed", spatialResolution: "250 m, 16-day composites", aggregation: "composite_16day", unit: "index", sourceUrl: "https://appeears.earthdatacloud.nasa.gov/",
    limitation: "Same pixel and cloud caveats as NDVI. Less saturated than NDVI over dense vegetation." },
};

export const KIND_LABEL: Record<ObsKind, string> = {
  satellite_observed: "Satellite-observed",
  satellite_estimate: "Satellite estimate",
  model_derived: "Model-derived",
};

export const KIND_EXPLAIN: Record<ObsKind, string> = {
  satellite_observed: "Computed directly from what a satellite sensor measured.",
  satellite_estimate: "Estimated from satellite signals with an algorithm.",
  model_derived: "Produced by a weather and land model that blends many observations.",
};

export const DISPLAY_UNIT: Record<string, string> = {
  C: "°C", "%": "%", "mm/day": "mm/day", "mm/month": "mm/month", "MJ/m2/day": "MJ/m²/day", "m3/m3": "m³/m³",
  "0-1 index": "index (0 to 1)", index: "index",
};
