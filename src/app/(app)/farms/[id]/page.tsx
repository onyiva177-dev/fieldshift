import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import FarmMap from "@/components/FarmMap";
import { ringToPoints, type Ring } from "@/lib/geo";
import {
  CROP_SUGGESTIONS,
  FERTILIZER_PRACTICES,
  IRRIGATION_TYPES,
  PRIORITIES,
  WATER_SOURCES,
  labelOf,
} from "@/lib/farm-options";
import StatusBadge from "@/components/StatusBadge";
import { addCropRecord, deleteCropRecord, markHarvested } from "../actions";
import SubmitButton from "@/components/SubmitButton";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CropRow = {
  id: string; crop_name: string; status: "current" | "previous"; planted_on: string | null; harvested_on: string | null;
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "not recorded");

function CropList({ title, rows, farmId, canEdit }: { title: string; rows: CropRow[]; farmId: string; canEdit: boolean }) {
  return (
    <div>
      <h3 className="text-lg font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm">None recorded.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="rounded-md border border-field-200 p-3">
              <p className="font-semibold">{c.crop_name}</p>
              <p className="text-sm">Planted: {fmt(c.planted_on)}. Harvested: {fmt(c.harvested_on)}.</p>
              {canEdit && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.status === "current" && (
                    <form action={markHarvested}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="farmId" value={farmId} />
                      <SubmitButton className="btn-secondary min-h-10 px-3 py-1 text-sm" pendingText="Saving...">Mark as harvested</SubmitButton>
                    </form>
                  )}
                  <form action={deleteCropRecord}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="farmId" value={farmId} />
                    <SubmitButton className="btn-secondary min-h-10 px-3 py-1 text-sm" pendingText="Deleting...">Delete record</SubmitButton>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function FarmProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cropError?: string }>;
}) {
  const { id } = await params;
  const { cropError } = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();

  const supabase = await createClient();
  const [farmRes, boundaryRes, prioRes, cropRes, soilRes] = await Promise.all([
    supabase.from("farms").select("*").eq("id", id).maybeSingle(),
    supabase.from("farm_boundaries").select("geojson, area_ha, source").eq("farm_id", id).maybeSingle(),
    supabase.from("farmer_priorities").select("priority").eq("farm_id", id),
    supabase.from("crop_history").select("id, crop_name, status, planted_on, harvested_on").eq("farm_id", id).order("planted_on", { ascending: false, nullsFirst: false }),
    supabase.from("soil_samples").select("id, sampled_on, verification_status").eq("farm_id", id).order("sampled_on", { ascending: false }).limit(20),
  ]);
  const soilTests = (soilRes.data ?? []) as { id: string; sampled_on: string; verification_status: string }[];
  const f = farmRes.data;
  if (!f) notFound();

  const canEdit = f.owner_id === user.id || user.role === "admin";
  const ring = boundaryRes.data?.geojson?.coordinates?.[0] as Ring | undefined;
  const points = ring ? ringToPoints(ring) : [];
  const priorities = (prioRes.data ?? []).map((p: { priority: string }) => p.priority);
  const crops = (cropRes.data ?? []) as CropRow[];
  const place = [f.village, f.sub_county, f.county].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <Link href={user.role === "admin" ? "/dashboard" : "/farms"} className="font-semibold text-field-800 underline">Back</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{f.name}</h1>
          <p>{place}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/farms/${id}/environment`} className="btn-secondary">NASA climate data</Link>
          {canEdit && <Link href={`/farms/${id}/edit`} className="btn-secondary">Edit farm</Link>}
        </div>
      </div>

      <FarmMap pin={{ lat: f.lat, lng: f.lng }} points={points} />
      <p className="text-sm">
        Pin: {f.lat.toFixed(5)}, {f.lng.toFixed(5)}.{" "}
        {boundaryRes.data
          ? `Boundary on file (${boundaryRes.data.source}), measured area ${Number(boundaryRes.data.area_ha)} ha.`
          : "No boundary drawn yet."}
      </p>

      <section className="card">
        <h2 className="text-xl font-bold">Farm details</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-sm font-semibold">Declared size</dt><dd>{Number(f.size_ha)} ha</dd></div>
          <div>
            <dt className="text-sm font-semibold">Irrigation</dt>
            <dd>{f.irrigation_available ? `Yes${f.irrigation_type ? `, ${labelOf(IRRIGATION_TYPES, f.irrigation_type).toLowerCase()}` : ""}` : "No irrigation"}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold">Water sources</dt>
            <dd>{f.water_sources?.length ? f.water_sources.map((v: string) => labelOf(WATER_SOURCES, v)).join(", ") : "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold">Fertilizer and organic inputs</dt>
            <dd>{f.fertilizer_practices?.length ? f.fertilizer_practices.map((v: string) => labelOf(FERTILIZER_PRACTICES, v)).join(", ") : "Not recorded"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-semibold">Priorities</dt>
            <dd>{priorities.length ? priorities.map((v: string) => labelOf(PRIORITIES, v)).join(", ") : "None selected"}</dd>
          </div>
          {f.notes && <div className="sm:col-span-2"><dt className="text-sm font-semibold">Notes</dt><dd>{f.notes}</dd></div>}
        </dl>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">Soil tests</h2>
        <p className="text-sm">Soil tests are recorded by agricultural officers. Only verified tests are used for recommendations.</p>
        {soilTests.length === 0 ? (
          <p>No soil tests recorded for this farm yet.</p>
        ) : (
          <ul className="space-y-2">
            {soilTests.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-field-200 p-3">
                <Link href={`/soil/${t.id}`} className="font-semibold underline">Sampled {fmt(t.sampled_on)}</Link>
                <StatusBadge status={t.verification_status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="crops" className="card space-y-5">
        <h2 className="text-xl font-bold">Crop history</h2>
        <CropList title="Current crops" rows={crops.filter((c) => c.status === "current")} farmId={id} canEdit={canEdit} />
        <CropList title="Previous crops" rows={crops.filter((c) => c.status === "previous")} farmId={id} canEdit={canEdit} />

        {canEdit && (
          <form action={addCropRecord} className="space-y-3 rounded-md bg-field-50 p-4">
            <h3 className="text-lg font-bold">Add a crop record</h3>
            <input type="hidden" name="farmId" value={id} />
            <div>
              <label htmlFor="cropName" className="label">Crop</label>
              <input id="cropName" name="cropName" list="crop-list" required className="input" />
              <datalist id="crop-list">{CROP_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label htmlFor="status" className="label">Status</label>
              <select id="status" name="status" className="input">
                <option value="current">Currently growing</option>
                <option value="previous">Already harvested</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="plantedOn" className="label">Planting date (optional)</label>
                <input id="plantedOn" name="plantedOn" type="date" className="input" />
              </div>
              <div>
                <label htmlFor="harvestedOn" className="label">Harvest date (optional)</label>
                <input id="harvestedOn" name="harvestedOn" type="date" className="input" />
              </div>
            </div>
            {cropError && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{cropError}</p>}
            <SubmitButton pendingText="Adding...">Add record</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
