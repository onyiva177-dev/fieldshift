import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import SoilSampleForm, { type SoilInitial } from "@/components/SoilSampleForm";
import { submitSoilSample } from "../../../../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewSamplePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ supersedes?: string }>;
}) {
  const { id } = await params;
  const { supersedes } = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireRolePage(["officer"]);
  const supabase = await createClient();

  const [farmRes, pointsRes] = await Promise.all([
    supabase.from("farms").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("farm_sampling_points").select("id, label").eq("farm_id", id).order("label"),
  ]);
  if (!farmRes.data) notFound();
  const points = (pointsRes.data ?? []) as { id: string; label: string }[];

  let initial: SoilInitial | undefined;
  let previousNote: string | null = null;
  if (supersedes && UUID.test(supersedes)) {
    const { data: prev } = await supabase
      .from("soil_samples")
      .select("id, sampling_point_id, sampled_on, sample_depth_cm, lab_name, lab_reference, notes, verification_status, submitted_by")
      .eq("id", supersedes)
      .eq("farm_id", id)
      .maybeSingle();
    if (prev && prev.submitted_by === user.id && ["needs_correction", "rejected"].includes(prev.verification_status)) {
      const [{ data: ms }, { data: rec }] = await Promise.all([
        supabase.from("soil_measurements").select("parameter, value_num, value_text, unit, method, source, responsible_party").eq("sample_id", supersedes),
        supabase.from("soil_verification_records").select("note").eq("sample_id", supersedes).order("created_at", { ascending: false }).limit(1),
      ]);
      const values: SoilInitial["values"] = {};
      for (const m of (ms ?? []) as { parameter: string; value_num: number | null; value_text: string | null; unit: string | null; method: string | null; source: string }[]) {
        if (m.parameter.startsWith("custom:")) continue;
        values[m.parameter] = {
          value: m.value_num !== null ? String(Number(m.value_num)) : m.value_text ?? "",
          unit: m.unit ?? "", method: m.method ?? "", source: m.source,
        };
      }
      initial = {
        samplingPointId: prev.sampling_point_id, sampledOn: prev.sampled_on,
        sampleDepthCm: prev.sample_depth_cm ? String(prev.sample_depth_cm) : "",
        labName: prev.lab_name ?? "", labReference: prev.lab_reference ?? "", notes: prev.notes ?? "",
        supersedesId: prev.id, responsibleParty: (ms?.[0] as { responsible_party?: string } | undefined)?.responsible_party ?? "",
        values,
      };
      previousNote = rec?.[0]?.note ?? null;
    }
  }

  return (
    <div className="space-y-6">
      <Link href={`/officer/farms/${id}`} className="font-semibold text-field-800 underline">Back to {farmRes.data.name}</Link>
      <h1 className="text-3xl font-bold">{initial ? "Submit a corrected sample" : "New soil sample"}</h1>
      {initial && (
        <div className="card border-orange-600 bg-orange-50">
          <p className="font-semibold">You are replacing an earlier sample. The original stays on record.</p>
          {previousNote && <p className="mt-1">Reviewer note: {previousNote}</p>}
          <p className="mt-1 text-sm">Check each value against the lab report. Attach the report again if needed.</p>
        </div>
      )}
      <SoilSampleForm farmId={id} points={points} defaultResponsible={user.name} initial={initial} action={submitSoilSample} />
    </div>
  );
}
