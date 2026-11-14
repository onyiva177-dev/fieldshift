import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import FarmMap from "@/components/FarmMap";
import SamplingPointForm from "@/components/SamplingPointForm";
import StatusBadge from "@/components/StatusBadge";
import { ringToPoints, type Ring } from "@/lib/geo";
import { PRIORITIES, labelOf } from "@/lib/farm-options";
import { addSamplingPoint } from "../../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OfficerFarmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireRolePage(["officer", "admin"]);
  const supabase = await createClient();

  const [farmRes, boundaryRes, pointsRes, samplesRes, prioRes, cropRes] = await Promise.all([
    supabase.from("farms").select("id, name, county, sub_county, village, lat, lng, size_ha").eq("id", id).maybeSingle(),
    supabase.from("farm_boundaries").select("geojson").eq("farm_id", id).maybeSingle(),
    supabase.from("farm_sampling_points").select("id, label, lat, lng, notes").eq("farm_id", id).order("label"),
    supabase.from("soil_samples").select("id, sampling_point_id, sampled_on, verification_status").eq("farm_id", id).order("created_at", { ascending: false }),
    supabase.from("farmer_priorities").select("priority").eq("farm_id", id),
    supabase.from("crop_history").select("crop_name, status").eq("farm_id", id).eq("status", "current"),
  ]);
  const f = farmRes.data;
  if (!f) notFound();

  const ring = boundaryRes.data?.geojson?.coordinates?.[0] as Ring | undefined;
  const boundary = ring ? ringToPoints(ring) : [];
  const points = (pointsRes.data ?? []) as { id: string; label: string; lat: number; lng: number; notes: string | null }[];
  const samples = (samplesRes.data ?? []) as { id: string; sampling_point_id: string; sampled_on: string; verification_status: string }[];
  const markers = points.map((p) => ({ lat: p.lat, lng: p.lng, label: p.label }));
  const pointLabel = (pid: string) => points.find((p) => p.id === pid)?.label ?? "Point";
  const priorities = (prioRes.data ?? []).map((p: { priority: string }) => labelOf(PRIORITIES, p.priority));
  const current = (cropRes.data ?? []).map((c: { crop_name: string }) => c.crop_name);

  return (
    <div className="space-y-6">
      <Link href={user.role === "admin" ? "/admin/farms" : "/officer"} className="font-semibold text-field-800 underline">Back</Link>
      <div>
        <h1 className="text-3xl font-bold">{f.name}</h1>
        <p>{[f.village, f.sub_county, f.county].filter(Boolean).join(", ")}. {Number(f.size_ha)} ha.</p>
      </div>

      <FarmMap pin={{ lat: f.lat, lng: f.lng }} points={boundary} markers={markers} />

      <section className="card">
        <h2 className="text-xl font-bold">Farmer context</h2>
        <p className="mt-1">Current crops: {current.length ? current.join(", ") : "none recorded"}.</p>
        <p>Priorities: {priorities.length ? priorities.join(", ") : "none selected"}.</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Soil samples</h2>
          {user.role === "officer" && (
            points.length > 0
              ? <Link href={`/officer/farms/${id}/samples/new`} className="btn-primary">New soil sample</Link>
              : <p className="text-sm">Add a sampling point first.</p>
          )}
        </div>
        {samples.length === 0 ? (
          <p className="card">No soil samples yet.</p>
        ) : (
          <ul className="space-y-2">
            {samples.map((s) => (
              <li key={s.id} className="card flex flex-wrap items-center justify-between gap-2">
                <Link href={`/soil/${s.id}`} className="font-semibold underline">
                  {pointLabel(s.sampling_point_id)}, sampled {new Date(s.sampled_on).toLocaleDateString("en-GB")}
                </Link>
                <StatusBadge status={s.verification_status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Sampling points</h2>
        {points.length === 0 ? (
          <p className="card">No sampling points yet. Add one below before recording a sample.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {points.map((p) => (
              <li key={p.id} className="card">
                <p className="font-bold">{p.label}</p>
                <p className="text-sm">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}{p.notes ? `. ${p.notes}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
        <SamplingPointForm farmId={id} farmPin={{ lat: f.lat, lng: f.lng }} boundary={boundary} existing={markers} action={addSamplingPoint} />
      </section>
    </div>
  );
}
