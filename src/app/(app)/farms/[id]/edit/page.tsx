import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import FarmForm, { type FarmInitial } from "@/components/FarmForm";
import { ringToPoints, type Ring } from "@/lib/geo";
import { updateFarm } from "../../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditFarmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireRolePage(["farmer", "admin"]);

  const supabase = await createClient();
  const [farmRes, boundaryRes, prioRes] = await Promise.all([
    supabase.from("farms").select("*").eq("id", id).maybeSingle(),
    supabase.from("farm_boundaries").select("geojson, source").eq("farm_id", id).maybeSingle(),
    supabase.from("farmer_priorities").select("priority").eq("farm_id", id),
  ]);
  const f = farmRes.data;
  if (!f) notFound();

  const ring = boundaryRes.data?.geojson?.coordinates?.[0] as Ring | undefined;
  const initial: FarmInitial = {
    name: f.name,
    county: f.county,
    subCounty: f.sub_county ?? "",
    village: f.village ?? "",
    lat: f.lat,
    lng: f.lng,
    sizeHa: String(Number(f.size_ha)),
    irrigationAvailable: f.irrigation_available,
    irrigationType: f.irrigation_type ?? "",
    waterSources: f.water_sources ?? [],
    fertilizerPractices: f.fertilizer_practices ?? [],
    priorities: (prioRes.data ?? []).map((p: { priority: string }) => p.priority),
    notes: f.notes ?? "",
    points: ring ? ringToPoints(ring) : [],
    boundarySource: boundaryRes.data?.source === "uploaded" ? "uploaded" : "drawn",
  };

  return (
    <div className="space-y-6">
      <Link href={`/farms/${id}`} className="font-semibold text-field-800 underline">Back to farm</Link>
      <h1 className="text-3xl font-bold">Edit {f.name}</h1>
      <FarmForm action={updateFarm.bind(null, id)} submitLabel="Save changes" initial={initial} />
    </div>
  );
}
