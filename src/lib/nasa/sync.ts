import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { VARIABLES } from "@/lib/nasa/catalog";
import { NasaError } from "@/lib/nasa/http";
import {
  POWER_MAIN_PARAMS, buildPowerObservations, fetchPowerDaily, type ObservationInput,
} from "@/lib/nasa/power";
import {
  MODIS_LAYERS, downloadResultsCsv, getTaskState, hasEarthdataCreds, login, parseModisCsv, parseSmapCsv,
  resolveSmap, submitPointTask,
} from "@/lib/nasa/appeears";

export type Trigger = "cron" | "manual" | "farm_created";
type Admin = ReturnType<typeof createAdminClient>;
const DAY = 24 * 3600 * 1000;

async function writeObservations(admin: Admin, farmId: string, rows: ObservationInput[]): Promise<number> {
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({ ...r, farm_id: farmId, retrieved_at: now }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await admin
      .from("nasa_observations")
      .upsert(payload.slice(i, i + 500), { onConflict: "farm_id,dataset,variable,period_start,period_end" });
    if (error) throw new Error(`Could not save observations: ${error.message}`);
  }
  return payload.length;
}

/** Wraps one dataset's work in a recorded sync run. A failure is recorded, never thrown. */
async function recorded(
  admin: Admin, farmId: string, dataset: string, trigger: Trigger,
  work: () => Promise<{ rows: number; message: string; status?: "succeeded" | "skipped" }>
) {
  const { data: run } = await admin
    .from("nasa_sync_runs").insert({ farm_id: farmId, dataset, trigger, status: "running" }).select("id").single();
  try {
    const res = await work();
    await admin.from("nasa_sync_runs").update({
      status: res.status ?? "succeeded", rows_written: res.rows, message: res.message.slice(0, 500), finished_at: new Date().toISOString(),
    }).eq("id", run?.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[nasa-sync] ${dataset} failed for farm ${farmId}:`, message);
    await admin.from("nasa_sync_runs").update({
      status: "failed", message: message.slice(0, 500), finished_at: new Date().toISOString(),
    }).eq("id", run?.id);
  }
}

async function lastSuccess(admin: Admin, farmId: string, dataset: string): Promise<number | null> {
  const { data } = await admin.from("nasa_sync_runs").select("finished_at")
    .eq("farm_id", farmId).eq("dataset", dataset).eq("status", "succeeded").gt("rows_written", 0)
    .order("finished_at", { ascending: false }).limit(1);
  return data?.[0]?.finished_at ? new Date(data[0].finished_at).getTime() : null;
}

export async function syncFarm(farmId: string, trigger: Trigger, opts: { force?: boolean } = {}) {
  const admin = createAdminClient();
  const { data: farm } = await admin.from("farms").select("id, lat, lng").eq("id", farmId).maybeSingle();
  if (!farm) return;
  const force = !!opts.force;

  // POWER meteorology and IMERG rainfall: monthly data, so a weekly refresh is plenty
  const fresh = async (dataset: string) => {
    const t = await lastSuccess(admin, farmId, dataset);
    return !force && t !== null && Date.now() - t < 7 * DAY;
  };

  const jobs: Promise<void>[] = [];
  if (!(await fresh("POWER"))) {
    jobs.push(recorded(admin, farmId, "POWER", trigger, async () => {
      const data = await fetchPowerDaily(farm.lat, farm.lng, POWER_MAIN_PARAMS, ["ag"]);
      const rows = buildPowerObservations(data, POWER_MAIN_PARAMS);
      if (!rows.length) throw new NasaError("NASA POWER returned no usable months for this location.");
      return { rows: await writeObservations(admin, farmId, rows), message: "Monthly values updated from NASA POWER." };
    }));
  }
  if (!(await fresh("IMERG"))) {
    jobs.push(recorded(admin, farmId, "IMERG", trigger, async () => {
      const data = await fetchPowerDaily(farm.lat, farm.lng, ["IMERG_PRECTOT"], ["ag", "sb"]);
      const rows = buildPowerObservations(data, ["IMERG_PRECTOT"]);
      if (!rows.length) throw new NasaError("GPM IMERG rainfall returned no usable months for this location.");
      return { rows: await writeObservations(admin, farmId, rows), message: "Monthly IMERG rainfall updated." };
    }));
  }
  await Promise.all(jobs);

  // MODIS and SMAP: asynchronous requests through AppEEARS
  if (!hasEarthdataCreds()) {
    for (const dataset of ["MODIS", "SMAP"] as const) {
      const { data: recent } = await admin.from("nasa_sync_runs").select("id").eq("farm_id", farmId).eq("dataset", dataset)
        .gt("started_at", new Date(Date.now() - DAY).toISOString()).limit(1);
      if (!recent?.length) {
        await recorded(admin, farmId, dataset, trigger, async () => ({
          rows: 0, status: "skipped", message: "NASA Earthdata credentials are not configured on the server.",
        }));
      }
    }
    return;
  }

  let token: string | null = null;
  const getToken = async () => (token ??= await login());

  for (const dataset of ["MODIS", "SMAP"] as const) {
    await recorded(admin, farmId, dataset, trigger, async () => {
      const { data: tasks } = await admin.from("nasa_tasks").select("*")
        .eq("farm_id", farmId).eq("dataset", dataset).order("submitted_at", { ascending: false }).limit(1);
      const pending = tasks?.[0]?.status === "submitted" ? tasks[0] : null;

      if (pending) {
        const state = await getTaskState(await getToken(), pending.external_id);
        if (state.state === "pending") {
          if (Date.now() - new Date(pending.submitted_at).getTime() > 7 * DAY) {
            await admin.from("nasa_tasks").update({ status: "failed", message: "Timed out after 7 days", completed_at: new Date().toISOString() }).eq("id", pending.id);
            throw new NasaError("The NASA extraction request timed out. A new one will be submitted on the next sync.");
          }
          return { rows: 0, status: "skipped", message: `Still processing at NASA (${state.detail}). Results are collected on a later sync.` };
        }
        if (state.state === "failed") {
          await admin.from("nasa_tasks").update({ status: "failed", message: state.detail, completed_at: new Date().toISOString() }).eq("id", pending.id);
          throw new NasaError(state.detail);
        }
        const csv = await downloadResultsCsv(await getToken(), pending.external_id);
        let rows: ObservationInput[];
        if (dataset === "MODIS") {
          rows = parseModisCsv(csv);
        } else {
          const meta = pending.detail as { valueLayer: string; flagLayer: string | null };
          const months = parseSmapCsv(csv, meta.valueLayer, meta.flagLayer);
          const info = VARIABLES.SMAP_SM;
          rows = months.map((m) => ({
            dataset: info.dataset, product: `${info.product} (${(pending.detail as { product?: string })?.product ?? ""})`.replace(" ()", ""),
            variable: info.key, period_start: m.periodStart, period_end: m.periodEnd, value: m.value, unit: info.unit,
            aggregation: info.aggregation, kind: info.kind, spatial_resolution: info.spatialResolution, source_url: info.sourceUrl,
            note: "Monthly mean of good-quality morning retrievals",
          }));
        }
        await admin.from("nasa_tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", pending.id);
        if (!rows.length) throw new NasaError("NASA returned the request but it held no usable observations (clouds, snow or quality filters).");
        return { rows: await writeObservations(admin, farmId, rows), message: "Satellite observations collected from NASA AppEEARS." };
      }

      // nothing pending: submit a new request only if the stored data is getting old
      const { data: latest } = await admin.from("nasa_observations").select("retrieved_at")
        .eq("farm_id", farmId).eq("dataset", dataset).order("retrieved_at", { ascending: false }).limit(1);
      const age = latest?.[0] ? Date.now() - new Date(latest[0].retrieved_at).getTime() : Infinity;
      const maxAge = (force ? 1 : dataset === "MODIS" ? 14 : 7) * DAY;
      if (age < maxAge) return { rows: 0, status: "skipped", message: "Stored data is recent. No new request needed." };

      const end = new Date();
      if (dataset === "MODIS") {
        const id = await submitPointTask(await getToken(), {
          name: `fieldshift-modis-${farmId.slice(0, 8)}`, lat: farm.lat, lng: farm.lng,
          start: new Date(Date.UTC(2001, 0, 1)), end, layers: MODIS_LAYERS,
        });
        await admin.from("nasa_tasks").insert({ farm_id: farmId, dataset, external_id: id, status: "submitted", detail: {} });
      } else {
        const smap = await resolveSmap();
        const id = await submitPointTask(await getToken(), {
          name: `fieldshift-smap-${farmId.slice(0, 8)}`, lat: farm.lat, lng: farm.lng,
          start: new Date(Date.UTC(2015, 3, 1)), end, layers: smap.layers,
        });
        await admin.from("nasa_tasks").insert({
          farm_id: farmId, dataset, external_id: id, status: "submitted",
          detail: { valueLayer: smap.valueLayer, flagLayer: smap.flagLayer, product: smap.layers[0].product },
        });
      }
      return { rows: 0, message: "Satellite extraction requested from NASA. Results are collected on a later sync, usually within a day." };
    });
  }
}
