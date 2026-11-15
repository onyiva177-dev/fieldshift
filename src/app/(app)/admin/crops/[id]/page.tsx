import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import CropForm, { type CropFormValues } from "@/components/CropForm";
import { saveCrop } from "../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function EditCropPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  await requireRolePage(["admin"]);
  const supabase = await createClient();

  const [{ data: c }, { data: reqs }] = await Promise.all([
    supabase.from("crops").select("*").eq("id", id).maybeSingle(),
    supabase.from("crop_requirements").select("*").eq("crop_id", id),
  ]);
  if (!c) notFound();
  const r = ((reqs ?? []) as any[]).find((x) => (x.regions as string[]).includes("default")) ?? {};

  const v: CropFormValues = {
    slug: c.slug, name: c.name, aliases: (c.aliases ?? []).join(", "), scientific_name: c.scientific_name, family: c.family, crop_group: c.crop_group,
    cycle_days_min: s(c.cycle_days_min), cycle_days_max: s(c.cycle_days_max), planting_seasons: c.planting_seasons ?? [],
    drought_tolerance: c.drought_tolerance, n_demand: c.n_demand, p_demand: c.p_demand, k_demand: c.k_demand,
    n_fixation_min: s(c.n_fixation_min), n_fixation_max: s(c.n_fixation_max), root_type: c.root_type, root_depth_cm: s(c.root_depth_cm),
    shared_risks: (c.shared_risks ?? []).join("\n"),
    references: ((c.reference_list ?? []) as { title: string; url?: string }[]).map((x) => (x.url ? `${x.title} | ${x.url}` : x.title)).join("\n"),
    notes: s(c.notes), review_status: c.review_status, is_active: c.is_active,
    r: Object.fromEntries(["temp_abs_min", "temp_opt_min", "temp_opt_max", "temp_abs_max", "rain_abs_min", "rain_opt_min", "rain_opt_max", "rain_abs_max", "ph_abs_min", "ph_opt_min", "ph_opt_max", "ph_abs_max", "depth_min_cm", "ec_max_dsm", "region_note"].map((k) => [k, s(r[k])])),
    textures_suitable: r.textures_suitable ?? [], textures_marginal: r.textures_marginal ?? [], drainage_suitable: r.drainage_suitable ?? [],
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/crops" className="font-semibold text-field-800 underline">Back to crops</Link>
      <h1 className="text-3xl font-bold">Edit {c.name}</h1>
      <CropForm action={saveCrop.bind(null, id)} v={v} error={sp.error} />
    </div>
  );
}
