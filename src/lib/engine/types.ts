export const ENGINE_VERSION = "1.0.0";

export type Level = "low" | "medium" | "high";
export type Drought = "low" | "moderate" | "high";
export type Group = "cereal" | "legume" | "root_tuber" | "vegetable";
export type ComponentKey = "soil" | "climate" | "water" | "nutrients" | "rotation" | "priorities";

export const COMPONENTS: { key: ComponentKey; label: string; help: string }[] = [
  { key: "soil", label: "Soil suitability", help: "pH, texture, drainage, depth and salinity from verified soil tests" },
  { key: "climate", label: "Climate suitability", help: "Temperature and rainfall over the crop's growing cycle (NASA 2001 to 2020 averages)" },
  { key: "water", label: "Water availability", help: "Whether expected rainfall plus irrigation meets the crop's water need" },
  { key: "nutrients", label: "Nutrient considerations", help: "Soil nitrogen, phosphorus and potassium against the crop's demand and your inputs" },
  { key: "rotation", label: "Rotation compatibility", help: "How well the crop follows what was grown before" },
  { key: "priorities", label: "Farmer priorities", help: "How well the crop fits the priorities you chose" },
];

export type Weights = Record<ComponentKey, number>;
export const DEFAULT_WEIGHTS: Weights = { soil: 20, climate: 20, water: 15, nutrients: 15, rotation: 15, priorities: 15 };

export interface Requirement {
  tempAbsMin: number; tempOptMin: number; tempOptMax: number; tempAbsMax: number;
  rainAbsMin: number; rainOptMin: number; rainOptMax: number; rainAbsMax: number;
  phAbsMin: number; phOptMin: number; phOptMax: number; phAbsMax: number;
  texturesSuitable: string[]; texturesMarginal: string[]; drainageSuitable: string[];
  depthMinCm: number | null; ecMaxDsm: number | null;
  regionNote: string | null;
}

export interface Crop {
  id: string; slug: string; name: string; aliases: string[]; scientificName: string; family: string; group: Group;
  cycleDaysMin: number; cycleDaysMax: number; droughtTolerance: Drought;
  nDemand: Level; pDemand: Level; kDemand: Level;
  nFixMin: number | null; nFixMax: number | null;
  rootType: string; rootDepthCm: number | null; sharedRisks: string[];
  references: { title: string; url?: string }[];
  reviewStatus: "draft" | "reviewed"; notes: string | null;
  requirement: Requirement; requirementRegion: string;
}

export interface RotationRule {
  fromKind: "crop" | "family" | "group"; fromValue: string;
  toKind: "crop" | "family" | "group"; toValue: string;
  effect: "beneficial" | "neutral" | "caution" | "avoid"; score: number; reason: string;
}

export interface SoilMeasurementIn {
  sampleId: string; pointId: string; pointLabel: string; sampledOn: string;
  parameter: string; valueNum: number | null; valueText: string | null; unit: string | null; method: string | null;
}

export interface PreviousCropIn { name: string; status: "current" | "previous"; plantedOn: string | null; harvestedOn: string | null; createdAt: string }

export interface FarmIn {
  county: string; irrigationAvailable: boolean; irrigationType: string | null;
  waterSources: string[]; fertilizerPractices: string[]; priorities: string[];
}

export interface ClimateIn {
  rainfall: Record<number, number> | null; rainfallSource: string | null;   // mm per month, calendar month 1 to 12
  temperature: Record<number, number> | null; temperatureSource: string | null; // mean C per month
}

export interface EngineInput {
  farm: FarmIn; soil: SoilMeasurementIn[]; previousCrops: PreviousCropIn[];
  crops: Crop[]; rules: RotationRule[]; climate: ClimateIn;
  weights: Weights; plantingMonth: number; today: Date;
}

export interface Note { tone: "good" | "warn" | "info"; text: string }

export interface ComponentResult {
  key: ComponentKey; label: string; score: number | null; weightConfigured: number; weightUsed: number; notes: Note[];
}

export interface CropResult {
  cropId: string; slug: string; name: string; scientificName: string; group: Group; family: string;
  reviewStatus: "draft" | "reviewed";
  total: number; status: "recommended" | "not_suitable";
  limiting: string[];
  components: ComponentResult[];
  why: string[]; benefits: string[]; limitations: string[]; risks: string[];
  water: { needMm: [number, number]; expectedMm: number | null; irrigationCover: number };
  sources: string[];
}

export interface Confidence {
  score: number; level: Level; reasons: string[]; improve: string[];
}

export interface SoilSummary {
  sampleCount: number; pointCount: number; latestSampledOn: string | null;
  ph?: number; nitrogenPct?: number; pMgKg?: number; kCmol?: number; ocPct?: number; ocEstimated?: boolean;
  ecDsm?: number; depthCm?: number; texture?: string; drainage?: string;
  pMethod: string; present: string[]; missing: string[]; ratings: Record<string, string>;
}

export interface RunResult {
  engineVersion: string; plantingMonth: number; weights: Weights;
  confidence: Confidence; soil: SoilSummary;
  climate: { rainfallSource: string | null; temperatureSource: string | null; baseline: string };
  previousCrops: { name: string; matched: string | null }[];
  ranked: CropResult[]; notSuitable: CropResult[];
  dataSources: string[]; caveats: string[];
}
