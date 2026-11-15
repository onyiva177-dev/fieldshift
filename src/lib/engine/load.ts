import type { SupabaseClient } from "@supabase/supabase-js";
import { monthKey, normals, toMap } from "@/lib/climate";
import { suggestPlantingMonth } from "@/lib/engine/engine";
import {
  DEFAULT_WEIGHTS, type ClimateIn, type Crop, type EngineInput, type PreviousCropIn, type RotationRule, type SoilMeasurementIn, type Weights,
} from "@/lib/engine/types";

export interface EngineContext {
  farm: { id: string; name: string; ownerId: string } & EngineInput["farm"];
  crops: Crop[]; rules: RotationRule[]; configWeights: Weights;
  soil: SoilMeasurementIn[]; previousCrops: PreviousCropIn[]; climate: ClimateIn; suggestedMonth: number;
}

async function series(supabase: SupabaseClient, farmId: string, variable: string) {
  const { data } = await supabase.from("nasa_observations").select("period_start, value").eq("farm_id", farmId).eq("variable", variable).order("period_start").limit(1000);
  return toMap((data ?? []) as { period_start: string; value: number }[]);
}

const toRecord = (m: Map<number, number>): Record<number, number> => Object.fromEntries(m.entries());

export async function loadEngineContext(supabase: SupabaseClient, farmId: string): Promise<EngineContext | null> {
  const { data: farm } = await supabase.from("farms")
    .select("id, name, owner_id, county, irrigation_available, irrigation_type, water_sources, fertilizer_practices").eq("id", farmId).maybeSingle();
  if (!farm) return null;

  const [prio, hist, cropsRes, reqRes, rulesRes, cfgRes, samplesRes, pointsRes, imerg, merra, t2m] = await Promise.all([
    supabase.from("farmer_priorities").select("priority").eq("farm_id", farmId),
    supabase.from("crop_history").select("crop_name, status, planted_on, harvested_on, created_at").eq("farm_id", farmId),
    supabase.from("crops").select("*").eq("is_active", true),
    supabase.from("crop_requirements").select("*"),
    supabase.from("crop_rotation_rules").select("*"),
    supabase.from("scoring_config").select("weights").eq("id", "default").maybeSingle(),
    supabase.from("soil_samples").select("id, sampling_point_id, sampled_on").eq("farm_id", farmId).eq("verification_status", "verified").order("sampled_on", { ascending: false }).limit(60),
    supabase.from("farm_sampling_points").select("id, label").eq("farm_id", farmId),
    series(supabase, farmId, "IMERG_PRECTOT"), series(supabase, farmId, "PRECTOTCORR"), series(supabase, farmId, "T2M"),
  ]);

  // crops with the requirement set for this farm's county, else the default
  const reqs = (reqRes.data ?? []) as any[];
  const crops: Crop[] = ((cropsRes.data ?? []) as any[]).flatMap((c) => {
    const mine = reqs.filter((r) => r.crop_id === c.id);
    const r = mine.find((x) => (x.regions as string[]).some((g) => g.toLowerCase() === String(farm.county).toLowerCase())) ?? mine.find((x) => (x.regions as string[]).includes("default"));
    if (!r) return [];
    return [{
      id: c.id, slug: c.slug, name: c.name, aliases: c.aliases ?? [], scientificName: c.scientific_name, family: c.family, group: c.crop_group,
      cycleDaysMin: c.cycle_days_min, cycleDaysMax: c.cycle_days_max, droughtTolerance: c.drought_tolerance,
      nDemand: c.n_demand, pDemand: c.p_demand, kDemand: c.k_demand,
      nFixMin: c.n_fixation_min === null ? null : Number(c.n_fixation_min), nFixMax: c.n_fixation_max === null ? null : Number(c.n_fixation_max),
      rootType: c.root_type, rootDepthCm: c.root_depth_cm, sharedRisks: c.shared_risks ?? [], references: c.reference_list ?? [],
      reviewStatus: c.review_status, notes: c.notes, requirementRegion: (r.regions as string[]).join(", "),
      requirement: {
        tempAbsMin: Number(r.temp_abs_min), tempOptMin: Number(r.temp_opt_min), tempOptMax: Number(r.temp_opt_max), tempAbsMax: Number(r.temp_abs_max),
        rainAbsMin: Number(r.rain_abs_min), rainOptMin: Number(r.rain_opt_min), rainOptMax: Number(r.rain_opt_max), rainAbsMax: Number(r.rain_abs_max),
        phAbsMin: Number(r.ph_abs_min), phOptMin: Number(r.ph_opt_min), phOptMax: Number(r.ph_opt_max), phAbsMax: Number(r.ph_abs_max),
        texturesSuitable: r.textures_suitable ?? [], texturesMarginal: r.textures_marginal ?? [], drainageSuitable: r.drainage_suitable ?? [],
        depthMinCm: r.depth_min_cm, ecMaxDsm: r.ec_max_dsm === null ? null : Number(r.ec_max_dsm), regionNote: r.region_note,
      },
    } as Crop];
  });

  const rules: RotationRule[] = ((rulesRes.data ?? []) as any[]).map((r) => ({
    fromKind: r.from_kind, fromValue: r.from_value, toKind: r.to_kind, toValue: r.to_value, effect: r.effect, score: r.score, reason: r.reason,
  }));

  const w = (cfgRes.data?.weights ?? {}) as Partial<Weights>;
  const configWeights: Weights = { ...DEFAULT_WEIGHTS, ...Object.fromEntries(Object.entries(w).filter(([, v]) => typeof v === "number")) };

  // verified soil measurements only
  const samples = (samplesRes.data ?? []) as { id: string; sampling_point_id: string; sampled_on: string }[];
  let soil: SoilMeasurementIn[] = [];
  if (samples.length) {
    const { data: ms } = await supabase.from("soil_measurements").select("sample_id, parameter, value_num, value_text, unit, method").in("sample_id", samples.map((s) => s.id));
    const sMap = new Map(samples.map((s) => [s.id, s]));
    const labels = new Map(((pointsRes.data ?? []) as { id: string; label: string }[]).map((p) => [p.id, p.label]));
    soil = ((ms ?? []) as any[]).map((m) => {
      const s = sMap.get(m.sample_id)!;
      return { sampleId: m.sample_id, pointId: s.sampling_point_id, pointLabel: labels.get(s.sampling_point_id) ?? "", sampledOn: s.sampled_on,
        parameter: m.parameter, valueNum: m.value_num === null ? null : Number(m.value_num), valueText: m.value_text, unit: m.unit, method: m.method };
    });
  }

  // climate normals: prefer IMERG satellite rainfall when it covers all 12 months, else the MERRA-2 model
  const nI = normals(imerg), nM = normals(merra), nT = normals(t2m);
  const useImerg = nI.size === 12;
  const rainN = useImerg ? nI : nM;
  const climate: ClimateIn = {
    rainfall: rainN.size === 12 ? toRecord(rainN) : null,
    rainfallSource: rainN.size === 12 ? (useImerg ? "NASA GPM IMERG satellite rainfall (about 10 km)" : "NASA POWER MERRA-2 modelled rainfall (about 55 km)") : null,
    temperature: nT.size === 12 ? toRecord(nT) : null,
    temperatureSource: nT.size === 12 ? "NASA POWER MERRA-2 modelled temperature (about 55 km)" : null,
  };

  return {
    farm: {
      id: farm.id, name: farm.name, ownerId: farm.owner_id, county: farm.county, irrigationAvailable: farm.irrigation_available,
      irrigationType: farm.irrigation_type, waterSources: farm.water_sources ?? [], fertilizerPractices: farm.fertilizer_practices ?? [],
      priorities: ((prio.data ?? []) as { priority: string }[]).map((p) => p.priority),
    },
    crops, rules, configWeights, soil,
    previousCrops: ((hist.data ?? []) as any[]).map((h) => ({ name: h.crop_name, status: h.status, plantedOn: h.planted_on, harvestedOn: h.harvested_on, createdAt: h.created_at })),
    climate, suggestedMonth: suggestPlantingMonth(climate.rainfall),
  };
}

export { monthKey };
