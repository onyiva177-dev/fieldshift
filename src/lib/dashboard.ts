import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAlerts, type Alert } from "@/lib/alerts";
import { lastNKeys, latestKey, mean, normals, recentPct, sum } from "@/lib/climate";
import { buildSoilProfile } from "@/lib/engine/soil";
import { loadVerifiedSoil, series } from "@/lib/engine/load";
import type { SoilSummary } from "@/lib/engine/types";

export interface FarmRow { id: string; name: string; county: string; size_ha: number; lat: number; lng: number }

export interface FarmSnapshot {
  farm: FarmRow;
  soil: { counts: { verified: number; pending: number; needsCorrection: number; rejected: number }; summary: SoilSummary | null; latestVerifiedOn: string | null };
  crops: { current: string[]; last: string | null; recorded: number };
  climate: { rain12: number | null; rainPct3: number | null; temp12: number | null; source: string | null; endKey: string | null };
  rec: { id: string; createdAt: string; plantingMonth: number; top: { name: string; total: number }[]; level: string } | null;
  nextPlanned: { crop: string; label: string } | null;
  alerts: Alert[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function loadFarmSnapshot(supabase: SupabaseClient, farm: FarmRow, today = new Date()): Promise<FarmSnapshot> {
  const [samplesRes, soilRows, histRes, imerg, merra, t2m, recRes, planRes, runRes, obsCount] = await Promise.all([
    supabase.from("soil_samples").select("id, sampled_on, verification_status").eq("farm_id", farm.id).limit(200),
    loadVerifiedSoil(supabase, farm.id),
    supabase.from("crop_history").select("crop_name, status, planted_on, harvested_on, created_at").eq("farm_id", farm.id),
    series(supabase, farm.id, "IMERG_PRECTOT"), series(supabase, farm.id, "PRECTOTCORR"), series(supabase, farm.id, "T2M"),
    supabase.from("recommendations").select("id, created_at, planting_month, confidence, results").eq("farm_id", farm.id).order("created_at", { ascending: false }).limit(1),
    supabase.from("rotation_plans").select("id, rotation_plan_seasons(season_index, planting_month, planting_year, crop_name)").eq("farm_id", farm.id).eq("status", "active").order("created_at", { ascending: false }).limit(1),
    supabase.from("nasa_sync_runs").select("dataset, status, message").eq("farm_id", farm.id).order("started_at", { ascending: false }).limit(1),
    supabase.from("nasa_observations").select("id", { count: "exact", head: true }).eq("farm_id", farm.id),
  ]);

  const samples = (samplesRes.data ?? []) as { id: string; sampled_on: string; verification_status: string }[];
  const counts = {
    verified: samples.filter((s) => s.verification_status === "verified").length,
    pending: samples.filter((s) => s.verification_status === "pending").length,
    needsCorrection: samples.filter((s) => s.verification_status === "needs_correction").length,
    rejected: samples.filter((s) => s.verification_status === "rejected").length,
  };
  const latestVerifiedOn = samples.filter((s) => s.verification_status === "verified").map((s) => s.sampled_on).sort().pop() ?? null;
  const summary = soilRows.length ? buildSoilProfile(soilRows) : null;

  const hist = (histRes.data ?? []) as { crop_name: string; status: string; planted_on: string | null; harvested_on: string | null; created_at: string }[];
  const current = hist.filter((h) => h.status === "current").map((h) => h.crop_name);
  const prev = hist.filter((h) => h.status === "previous").sort((a, b) => (b.harvested_on ?? b.planted_on ?? b.created_at).localeCompare(a.harvested_on ?? a.planted_on ?? a.created_at));

  // climate: IMERG if its normals cover all 12 months, otherwise the MERRA-2 model
  const nI = normals(imerg);
  const useImerg = nI.size === 12;
  const rainMap = useImerg ? imerg : merra;
  const rainN = useImerg ? nI : normals(merra);
  const endKey = latestKey(rainMap);
  const rain12 = endKey ? sum(lastNKeys(endKey, 12).map((k) => rainMap.get(k)), 10) : null;
  const rainPct3 = rainN.size === 12 ? recentPct(rainMap, rainN, endKey, 3) : null;
  const tEnd = latestKey(t2m);
  const temp12 = tEnd ? mean(lastNKeys(tEnd, 12).map((k) => t2m.get(k)), 10) : null;

  const r = recRes.data?.[0] as { id: string; created_at: string; planting_month: number; confidence: { level: string }; results: { ranked: { name: string; total: number }[] } } | undefined;
  const plan = planRes.data?.[0] as { rotation_plan_seasons: { season_index: number; planting_month: number; planting_year: number; crop_name: string }[] } | undefined;
  const nowKey = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const next = plan?.rotation_plan_seasons
    ?.filter((s) => s.planting_year * 12 + (s.planting_month - 1) >= nowKey)
    .sort((a, b) => a.planting_year * 12 + a.planting_month - (b.planting_year * 12 + b.planting_month))[0];

  const run = runRes.data?.[0] as { dataset: string; status: string; message: string | null } | undefined;
  const alerts = computeAlerts({
    farmId: farm.id, farmName: farm.name, soil: { ...counts, latestVerifiedOn },
    rainRecentPct: rainPct3, rainMonths: 3,
    nasa: { hasData: (obsCount.count ?? 0) > 0, lastStatus: run?.status ?? null, lastDataset: run?.dataset ?? null, lastMessage: run?.message ?? null },
    crops: { current, recorded: hist.length }, today,
  });

  return {
    farm, soil: { counts, summary, latestVerifiedOn },
    crops: { current, last: prev[0]?.crop_name ?? null, recorded: hist.length },
    climate: { rain12, rainPct3, temp12, endKey, source: rain12 === null ? null : useImerg ? "GPM IMERG satellite estimate" : "MERRA-2 model" },
    rec: r ? { id: r.id, createdAt: r.created_at, plantingMonth: r.planting_month, top: r.results.ranked.slice(0, 3), level: r.confidence.level } : null,
    nextPlanned: next ? { crop: next.crop_name, label: `${MONTHS[next.planting_month - 1]} ${next.planting_year}` } : null,
    alerts,
  };
}

export interface AdminStats {
  users: number; roles: Record<string, number>; farms: number; officers: Record<string, number>;
  samples: Record<string, number>; observations: number; syncFailures7d: number; crops: number; draftCrops: number;
  recommendations: number; plans: number; unreadVisits: number;
}

const tally = (rows: Record<string, string>[] | null, key: string) => {
  const out: Record<string, number> = {};
  for (const r of rows ?? []) out[r[key]] = (out[r[key]] ?? 0) + 1;
  return out;
};

export async function loadAdminStats(supabase: SupabaseClient): Promise<AdminStats> {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const head = (table: string) => supabase.from(table).select("id", { count: "exact", head: true });
  const [users, roles, farms, officers, samples, obs, fails, crops, drafts, recs, plans, visits] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("user_roles").select("role").limit(5000),
    head("farms"),
    supabase.from("agricultural_officers").select("verification_status").limit(2000),
    supabase.from("soil_samples").select("verification_status").limit(5000),
    head("nasa_observations"),
    supabase.from("nasa_sync_runs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("started_at", weekAgo),
    head("crops"),
    supabase.from("crops").select("id", { count: "exact", head: true }).eq("review_status", "draft"),
    head("recommendations"), head("rotation_plans"),
    supabase.from("field_visits").select("id", { count: "exact", head: true }).eq("status", "planned"),
  ]);
  return {
    users: users.count ?? 0, roles: tally(roles.data as Record<string, string>[] | null, "role"), farms: farms.count ?? 0,
    officers: tally(officers.data as Record<string, string>[] | null, "verification_status"),
    samples: tally(samples.data as Record<string, string>[] | null, "verification_status"),
    observations: obs.count ?? 0, syncFailures7d: fails.count ?? 0, crops: crops.count ?? 0, draftCrops: drafts.count ?? 0,
    recommendations: recs.count ?? 0, plans: plans.count ?? 0, unreadVisits: visits.count ?? 0,
  };
}
