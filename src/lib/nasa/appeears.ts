import { VARIABLES } from "@/lib/nasa/catalog";
import { NasaError, fetchWithRetry } from "@/lib/nasa/http";
import type { MonthlyValue, ObservationInput } from "@/lib/nasa/power";

// NASA AppEEARS (LP DAAC) point-sample API. Requires a free NASA Earthdata account.
// Requests are asynchronous: we submit a task, then collect the results on a later sync.
const API = "https://appeears.earthdatacloud.nasa.gov/api";

export const hasEarthdataCreds = () => !!(process.env.EARTHDATA_USERNAME && process.env.EARTHDATA_PASSWORD);

export async function login(): Promise<string> {
  const user = process.env.EARTHDATA_USERNAME;
  const pass = process.env.EARTHDATA_PASSWORD;
  if (!user || !pass) throw new NasaError("NASA Earthdata credentials are not configured.");
  const res = await fetchWithRetry(`${API}/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    timeoutMs: 20000,
  });
  if (res.status === 401 || res.status === 403) {
    throw new NasaError("NASA Earthdata login was refused. Check EARTHDATA_USERNAME and EARTHDATA_PASSWORD, and that you have an AppEEARS-enabled Earthdata account.", res.status);
  }
  if (!res.ok) throw new NasaError(`AppEEARS login failed (${res.status}).`, res.status);
  const json = await res.json();
  if (!json?.token) throw new NasaError("AppEEARS login returned no token.");
  return String(json.token);
}

async function call(token: string | null, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetchWithRetry(`${API}${path}`, { ...init, headers, timeoutMs: 30000 });
}

// Product and layer discovery: never assume a layer name that NASA may have changed.
export interface Layer { product: string; layer: string }

export async function resolveSmap(): Promise<{ layers: Layer[]; valueLayer: string; flagLayer: string | null }> {
  const res = await call(null, "/product");
  if (!res.ok) throw new NasaError(`Could not list AppEEARS products (${res.status}).`, res.status);
  const products: { ProductAndVersion?: string }[] = await res.json();
  const candidates = products
    .map((p) => p.ProductAndVersion ?? "")
    .filter((id) => id.startsWith("SPL3SMP_E."))
    .sort()
    .reverse();
  if (!candidates.length) {
    throw new NasaError("The SMAP Enhanced L3 product (SPL3SMP_E) is not offered by AppEEARS right now.");
  }
  const product = candidates[0];
  const lres = await call(null, `/product/${product}`);
  if (!lres.ok) throw new NasaError(`Could not read the layers of ${product} (${lres.status}).`, lres.status);
  const names = Object.keys(await lres.json());
  const valueLayer =
    names.find((n) => /^Soil_Moisture_Retrieval_Data_AM_soil_moisture$/i.test(n)) ??
    names.find((n) => /_AM_.*soil_moisture$/i.test(n) && !/error|dielectric|scan/i.test(n)) ??
    names.find((n) => /AM.*soil_moisture$/i.test(n) && !/error|dielectric|scan/i.test(n));
  if (!valueLayer) throw new NasaError(`No morning soil moisture layer was found in ${product}.`);
  const flagLayer = names.find((n) => /AM.*retrieval_qual_flag$/i.test(n)) ?? null;
  const layers: Layer[] = [{ product, layer: valueLayer }];
  if (flagLayer) layers.push({ product, layer: flagLayer });
  return { layers, valueLayer, flagLayer };
}

export const MODIS_LAYERS: Layer[] = [
  { product: "MOD13Q1.061", layer: "_250m_16_days_NDVI" },
  { product: "MOD13Q1.061", layer: "_250m_16_days_EVI" },
  { product: "MOD13Q1.061", layer: "_250m_16_days_pixel_reliability" },
];

const mdy = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`;

export async function submitPointTask(
  token: string,
  opts: { name: string; lat: number; lng: number; start: Date; end: Date; layers: Layer[] }
): Promise<string> {
  const body = {
    task_type: "point",
    task_name: opts.name.slice(0, 60),
    params: {
      dates: [{ startDate: mdy(opts.start), endDate: mdy(opts.end) }],
      layers: opts.layers,
      coordinates: [{ id: "farm", category: "farm", latitude: Number(opts.lat.toFixed(5)), longitude: Number(opts.lng.toFixed(5)) }],
    },
  };
  const res = await call(token, "/task", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.task_id) {
    throw new NasaError(`AppEEARS rejected the request (${res.status}). ${json?.message ?? ""}`.trim(), res.status);
  }
  return String(json.task_id);
}

export type TaskState = "done" | "pending" | "failed";

export async function getTaskState(token: string, taskId: string): Promise<{ state: TaskState; detail: string }> {
  const res = await call(token, `/task/${taskId}`);
  if (res.status === 404) return { state: "failed", detail: "The request no longer exists at NASA." };
  if (!res.ok) throw new NasaError(`Could not check the AppEEARS request (${res.status}).`, res.status);
  const json = await res.json();
  const status = String(json?.status ?? "").toLowerCase();
  if (status === "done") return { state: "done", detail: "done" };
  if (["error", "failed", "deleted", "expired"].includes(status)) return { state: "failed", detail: `NASA reported status "${status}".` };
  return { state: "pending", detail: status || "pending" };
}

export async function downloadResultsCsv(token: string, taskId: string): Promise<string> {
  const bres = await call(token, `/bundle/${taskId}`);
  if (!bres.ok) throw new NasaError(`Could not list the AppEEARS results (${bres.status}).`, bres.status);
  const files: { file_id: string; file_name: string }[] = (await bres.json())?.files ?? [];
  const csv = files.find((f) => /results.*\.csv$/i.test(f.file_name)) ?? files.find((f) => /\.csv$/i.test(f.file_name) && !/granule|request|lookup/i.test(f.file_name));
  if (!csv) throw new NasaError("The AppEEARS results contained no data file.");
  const res = await call(token, `/bundle/${taskId}/${csv.file_id}`);
  if (!res.ok) throw new NasaError(`Could not download the AppEEARS results (${res.status}).`, res.status);
  return res.text();
}

// CSV parsing -----------------------------------------------------------

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  const header = rows.shift() ?? [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const findCol = (cols: string[], re: RegExp) => cols.find((c) => re.test(c.toLowerCase()));
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** MOD13Q1 point results to NDVI and EVI observations. Poor-quality pixels (cloud, snow) are dropped. */
export function parseModisCsv(text: string): ObservationInput[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const ndviCol = findCol(cols, /250m_16_days_ndvi$/);
  const eviCol = findCol(cols, /250m_16_days_evi$/);
  const relCol = findCol(cols, /pixel_reliability$/);
  if (!ndviCol && !eviCol) throw new NasaError("The MODIS results had no NDVI or EVI column.");

  const out: ObservationInput[] = [];
  for (const r of rows) {
    const date = (r["Date"] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (relCol) {
      const rel = Number(r[relCol]);
      if (!(rel === 0 || rel === 1)) continue; // 0 good, 1 marginal; anything else is fill, snow or cloud
    }
    for (const [col, key] of [[ndviCol, "NDVI"], [eviCol, "EVI"]] as const) {
      if (!col) continue;
      let v = Number(r[col]);
      if (!Number.isFinite(v) || r[col] === "") continue;
      if (Math.abs(v) > 1.5) {
        if (v < -2000 || v > 10000) continue; // outside the valid raw range (includes the -3000 fill value)
        v = v * 0.0001; // raw MOD13 values carry a 0.0001 scale factor
      }
      if (v < -1 || v > 1) continue;
      const info = VARIABLES[key];
      out.push({
        dataset: info.dataset, product: info.product, variable: key, period_start: date, period_end: addDays(date, 15),
        value: Math.round(v * 10000) / 10000, unit: info.unit, aggregation: info.aggregation, kind: info.kind,
        spatial_resolution: info.spatialResolution, source_url: info.sourceUrl, note: "Composite period starts on the date shown",
      });
    }
  }
  return out;
}

/** SMAP point results to monthly mean surface soil moisture. Needs at least 3 good days in a month. */
export function parseSmapCsv(text: string, valueLayer: string, flagLayer: string | null): MonthlyValue[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const valueCol = cols.find((c) => c.toLowerCase().endsWith(valueLayer.toLowerCase()));
  const flagCol = flagLayer ? cols.find((c) => c.toLowerCase().endsWith(flagLayer.toLowerCase())) : undefined;
  if (!valueCol) throw new NasaError("The SMAP results had no soil moisture column.");

  const months = new Map<string, number[]>();
  for (const r of rows) {
    const date = (r["Date"] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const v = Number(r[valueCol]);
    if (!Number.isFinite(v) || r[valueCol] === "" || v < 0 || v > 0.7) continue; // -9999 is the fill value
    if (flagCol) {
      const flag = Number(r[flagCol]);
      if (!Number.isFinite(flag) || (flag & 1) !== 0) continue; // bit 0 set means "not recommended quality"
    }
    const key = date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), v]);
  }
  const out: MonthlyValue[] = [];
  for (const [key, vals] of Array.from(months.entries()).sort()) {
    if (vals.length < 3) continue;
    const [y, m] = key.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push({
      periodStart: `${key}-01`,
      periodEnd: `${key}-${String(last).padStart(2, "0")}`,
      value: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10000) / 10000,
    });
  }
  return out;
}
