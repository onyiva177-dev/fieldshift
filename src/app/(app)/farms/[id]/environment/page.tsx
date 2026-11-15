import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import EnvChart from "@/components/EnvChart";
import SubmitButton from "@/components/SubmitButton";
import { DISPLAY_UNIT, KIND_EXPLAIN, KIND_LABEL, VARIABLES, type ObsKind } from "@/lib/nasa/catalog";
import {
  WELL_ABOVE, WELL_BELOW, BASE_END, BASE_START, latestKey, lastNKeys, mean, monthLabel, monthLabelLong, normalFor,
  normals, pctOfNormal, round, sum, toMap,
} from "@/lib/climate";
import { refreshFarmData } from "./actions";

export const maxDuration = 60; // lets a background refresh started from this page finish

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Obs = { period_start: string; period_end: string; value: number; unit: string; product: string; kind: ObsKind; spatial_resolution: string; retrieved_at: string };
const KEYS = ["T2M", "T2M_MAX", "T2M_MIN", "RH2M", "PRECTOTCORR", "IMERG_PRECTOT", "GWETTOP", "GWETROOT", "SMAP_SM", "NDVI", "EVI", "ALLSKY_SFC_SW_DWN"];

const MESSAGES: Record<string, string> = {
  started: "Refresh started. Weather and rainfall usually update within a minute. Satellite requests (SMAP, MODIS) can take hours and are collected on later syncs. Reload this page to see progress.",
  too_soon: "Data was refreshed less than 10 minutes ago. Try again a little later.",
  not_configured: "The server is not set up for NASA sync yet (missing SUPABASE_SERVICE_ROLE_KEY). Ask the administrator.",
};

const kindStyle: Record<ObsKind, string> = {
  satellite_observed: "bg-green-100 text-green-900",
  satellite_estimate: "bg-blue-100 text-blue-900",
  model_derived: "bg-stone-200 text-stone-900",
};
const statusStyle: Record<string, string> = {
  succeeded: "bg-green-100 text-green-900", failed: "bg-red-100 text-red-900", skipped: "bg-amber-100 text-amber-900", running: "bg-blue-100 text-blue-900",
};

export default async function EnvironmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { id } = await params;
  const { msg } = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();

  const [farmRes, runsRes, ...seriesRes] = await Promise.all([
    supabase.from("farms").select("id, name, lat, lng, owner_id").eq("id", id).maybeSingle(),
    supabase.from("nasa_sync_runs").select("dataset, status, message, started_at, finished_at, rows_written").eq("farm_id", id).order("started_at", { ascending: false }).limit(30),
    ...KEYS.map((v) =>
      supabase.from("nasa_observations")
        .select("period_start, period_end, value, unit, product, kind, spatial_resolution, retrieved_at")
        .eq("farm_id", id).eq("variable", v).order("period_start", { ascending: true }).limit(1000)
    ),
  ]);
  const farm = farmRes.data;
  if (!farm) notFound();

  const rows: Record<string, Obs[]> = {};
  KEYS.forEach((k, i) => { rows[k] = (seriesRes[i].data ?? []) as Obs[]; });
  const M = Object.fromEntries(KEYS.map((k) => [k, toMap(rows[k])])) as Record<string, Map<string, number>>;

  const endKey = latestKey(M.T2M, M.PRECTOTCORR, M.IMERG_PRECTOT);
  const canRefresh = user.role === "farmer" || user.role === "admin";
  const hasAny = KEYS.some((k) => rows[k].length > 0);

  // latest run per dataset
  const latestRun = new Map<string, NonNullable<typeof runsRes.data>[number]>();
  for (const r of runsRes.data ?? []) if (!latestRun.has(r.dataset)) latestRun.set(r.dataset, r);

  let content: React.ReactNode = null;
  if (endKey) {
    const keys24 = lastNKeys(endKey, 24);
    const keys12 = lastNKeys(endKey, 12);
    const nImerg = normals(M.IMERG_PRECTOT);
    const nMerra = normals(M.PRECTOTCORR);
    const useImerg = nImerg.size === 12;
    const prefMap = useImerg ? M.IMERG_PRECTOT : M.PRECTOTCORR;
    const prefNormals = useImerg ? nImerg : nMerra;
    const prefName = useImerg ? "GPM IMERG satellite rainfall" : "MERRA-2 modelled rainfall";

    const rainData = keys24.map((k) => ({
      label: monthLabel(k), imerg: round(M.IMERG_PRECTOT.get(k) ?? null, 0), merra: round(M.PRECTOTCORR.get(k) ?? null, 0), normal: round(normalFor(prefNormals, k) ?? null, 0),
    }));
    const anomalies = keys12.map((k) => {
      const p = pctOfNormal(prefMap.get(k), normalFor(prefNormals, k));
      return { key: k, pct: p, label: monthLabel(k), value: p === null ? null : Math.round(p), fill: p === null ? "#a8a29e" : p < WELL_BELOW ? "#9a3412" : p > WELL_ABOVE ? "#1d4ed8" : "#1f4d3a" };
    });
    const dry = anomalies.filter((a) => a.pct !== null && a.pct < WELL_BELOW).map((a) => monthLabelLong(a.key));
    const wet = anomalies.filter((a) => a.pct !== null && a.pct > WELL_ABOVE).map((a) => monthLabelLong(a.key));

    const tempData = keys24.map((k) => ({ label: monthLabel(k), mean: round(M.T2M.get(k) ?? null), max: round(M.T2M_MAX.get(k) ?? null), min: round(M.T2M_MIN.get(k) ?? null) }));
    const wetData = keys24.map((k) => ({ label: monthLabel(k), surface: round(M.GWETTOP.get(k) ?? null, 2), root: round(M.GWETROOT.get(k) ?? null, 2) }));
    const smapKeys = lastNKeys(endKey, 36);
    const smapData = smapKeys.map((k) => ({ label: monthLabel(k), smap: round(M.SMAP_SM.get(k) ?? null, 3) }));
    const veg = [...rows.NDVI.slice(-46)].map((r) => ({ label: r.period_start, ndvi: round(r.value, 3), evi: round(rows.EVI.find((e) => e.period_start === r.period_start)?.value ?? null, 3) }));

    const avgTemp = mean(keys12.map((k) => M.T2M.get(k)), 10);
    const totalRain = sum(keys12.map((k) => prefMap.get(k)), 10);
    const avgRh = mean(keys12.map((k) => M.RH2M.get(k)), 10);
    const avgSun = mean(keys12.map((k) => M.ALLSKY_SFC_SW_DWN.get(k)), 10);
    const stat = (label: string, v: number | null, unit: string, d = 0) => (
      <div className="card">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-2xl font-bold">{v === null ? "n/a" : `${round(v, d)} ${unit}`}</p>
      </div>
    );

    content = (
      <>
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Last 12 months at a glance</h2>
          <p className="text-sm">Through {monthLabelLong(endKey)}. Averages over the farm's NASA grid cell.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stat("Average temperature", avgTemp, "°C", 1)}
            {stat(`Total rainfall (${useImerg ? "IMERG" : "MERRA-2"})`, totalRain, "mm")}
            {stat("Average humidity", avgRh, "%")}
            {stat("Sunlight", avgSun, "MJ/m²/day", 1)}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Rainfall</h2>
          <EnvChart title="Monthly rainfall, last 24 months" type="line" unit="mm per month" data={rainData}
            description={`Dotted line: average for that month over ${BASE_START} to ${BASE_END} (${prefName}).`}
            series={[
              { key: "imerg", label: "GPM IMERG (satellite estimate)", color: "#1d4ed8" },
              { key: "merra", label: "MERRA-2 (model-derived)", color: "#1f4d3a", dashed: true },
              { key: "normal", label: "Average", color: "#57534e", dashed: true },
            ]}
            summary={`Monthly rainfall for the last 24 months. Source: ${prefName}.`} />
          <EnvChart title="Rainfall compared with normal, last 12 months" type="bar" unit="% of average" data={anomalies} refLine={100}
            description={`Based on ${prefName}. Under ${WELL_BELOW}% counts as well below average, over ${WELL_ABOVE}% as well above.`}
            series={[{ key: "value", label: "% of average", color: "#1f4d3a" }]}
            summary={`Rainfall as a percentage of the ${BASE_START} to ${BASE_END} average for each of the last 12 months.`} />
          <div className="card text-sm">
            <p><span className="font-semibold">Unusually dry months:</span> {dry.length ? dry.join(", ") : "none in the last 12 months"}.</p>
            <p><span className="font-semibold">Unusually wet months:</span> {wet.length ? wet.join(", ") : "none in the last 12 months"}.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Temperature</h2>
          <EnvChart title="Monthly temperature, last 24 months" type="line" unit="°C" data={tempData}
            series={[
              { key: "max", label: "Daily maximum (mean)", color: "#9a3412" },
              { key: "mean", label: "Mean", color: "#1f4d3a" },
              { key: "min", label: "Daily minimum (mean)", color: "#1d4ed8" },
            ]}
            summary="Monthly mean, maximum and minimum air temperature for the last 24 months." />
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Soil moisture</h2>
          <p className="text-sm">Both charts come from NASA, not from a soil probe or a soil test. Treat them as regional signals.</p>
          {rows.SMAP_SM.length > 0 ? (
            <EnvChart title="SMAP surface soil moisture, last 36 months" type="line" unit="m³/m³" data={smapData}
              description="Satellite estimate for a 9 km area, top 5 cm of soil. Months with fewer than 3 good readings are left blank."
              series={[{ key: "smap", label: "SMAP (satellite estimate)", color: "#1d4ed8" }]}
              summary="Monthly mean SMAP surface soil moisture for the last 36 months." />
          ) : (
            <p className="card">No SMAP soil moisture yet. It needs a NASA Earthdata request, which can take hours. See the sync status below.</p>
          )}
          <EnvChart title="Soil wetness index (MERRA-2 model), last 24 months" type="line" unit="index, 0 dry to 1 saturated" data={wetData}
            description="Model-derived. Root zone is roughly the top 1 m."
            series={[
              { key: "surface", label: "Surface (model)", color: "#9a3412" },
              { key: "root", label: "Root zone (model)", color: "#1f4d3a" },
            ]}
            summary="Monthly modelled surface and root-zone soil wetness for the last 24 months." />
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Vegetation</h2>
          {veg.length > 0 ? (
            <EnvChart title="Vegetation greenness (MODIS), recent composites" type="line" unit="index" data={veg}
              description="One point per 16-day composite at the 250 m pixel containing the farm pin. Clouded observations are removed."
              series={[
                { key: "ndvi", label: "NDVI", color: "#1f4d3a" },
                { key: "evi", label: "EVI", color: "#c98f0f" },
              ]}
              summary="NDVI and EVI vegetation indices from MODIS 16-day composites." />
          ) : (
            <p className="card">No MODIS vegetation data yet. It needs a NASA Earthdata request, which can take hours. See the sync status below.</p>
          )}
        </section>
      </>
    );
  }

  const present = KEYS.filter((k) => rows[k].length > 0);

  return (
    <div className="space-y-6">
      <Link href={`/farms/${id}`} className="font-semibold text-field-800 underline">Back to farm</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">NASA climate data</h1>
          <p>{farm.name} at {farm.lat.toFixed(3)}, {farm.lng.toFixed(3)}</p>
        </div>
        {canRefresh && (
          <form action={refreshFarmData}>
            <input type="hidden" name="farmId" value={id} />
            <SubmitButton className="btn-secondary" pendingText="Starting...">Refresh NASA data</SubmitButton>
          </form>
        )}
      </div>

      {msg && MESSAGES[msg] && <p role="status" className="card border-field-800 bg-field-100">{MESSAGES[msg]}</p>}

      <p className="card border-amber-600 bg-amber-50 text-sm">
        These values describe a wider area than your farm, from satellites and models. They are not soil tests and never replace
        verified measurements from an agricultural officer.
      </p>

      {!hasAny && (
        <section className="card space-y-2">
          <h2 className="text-xl font-bold">No NASA data stored yet</h2>
          <p>Data is fetched in the background after a farm is registered and then refreshed daily. If this stays empty, check the sync status below.</p>
        </section>
      )}

      {content}

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Sync status</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {["POWER", "IMERG", "SMAP", "MODIS"].map((d) => {
            const r = latestRun.get(d);
            return (
              <li key={d} className="card">
                <p className="font-bold">{d === "POWER" ? "NASA POWER (weather)" : d === "IMERG" ? "GPM IMERG (rainfall)" : d === "SMAP" ? "SMAP (soil moisture)" : "MODIS (vegetation)"}</p>
                {r ? (
                  <>
                    <p><span className={`inline-block rounded px-2 py-0.5 text-sm font-semibold ${statusStyle[r.status] ?? ""}`}>{r.status}</span>{" "}
                      <span className="text-sm">{new Date(r.started_at).toLocaleString("en-GB")}</span></p>
                    {r.message && <p className="text-sm">{r.message}</p>}
                  </>
                ) : (
                  <p className="text-sm">Not synced yet.</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {present.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Where this data comes from</h2>
          <p className="text-sm">Every value is stored with its source, resolution and retrieval date. The labels mean:</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            {(Object.keys(KIND_LABEL) as ObsKind[]).map((k) => (
              <li key={k} className="card"><span className={`inline-block rounded px-2 py-0.5 font-semibold ${kindStyle[k]}`}>{KIND_LABEL[k]}</span><p className="mt-1">{KIND_EXPLAIN[k]}</p></li>
            ))}
          </ul>
          <div className="space-y-2">
            {present.map((k) => {
              const info = VARIABLES[k];
              const r = rows[k];
              const first = r[0];
              const retrieved = r.reduce((a, b) => (b.retrieved_at > a ? b.retrieved_at : a), r[0].retrieved_at);
              return (
                <details key={k} className="card">
                  <summary className="cursor-pointer font-semibold">
                    {info.label} <span className={`ml-2 inline-block rounded px-2 py-0.5 text-sm ${kindStyle[first.kind]}`}>{KIND_LABEL[first.kind]}</span>
                  </summary>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div><dt className="inline font-semibold">Product: </dt><dd className="inline">{first.product}</dd></div>
                    <div><dt className="inline font-semibold">Spatial resolution: </dt><dd className="inline">{first.spatial_resolution}</dd></div>
                    <div><dt className="inline font-semibold">Unit: </dt><dd className="inline">{DISPLAY_UNIT[first.unit] ?? first.unit}</dd></div>
                    <div><dt className="inline font-semibold">Period covered: </dt><dd className="inline">{monthLabelLong(first.period_start.slice(0, 7))} to {monthLabelLong(r[r.length - 1].period_end.slice(0, 7))} ({r.length} values)</dd></div>
                    <div><dt className="inline font-semibold">Last retrieved: </dt><dd className="inline">{new Date(retrieved).toLocaleDateString("en-GB")}</dd></div>
                    <div><dt className="inline font-semibold">Limitation: </dt><dd className="inline">{info.limitation}</dd></div>
                  </dl>
                </details>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
