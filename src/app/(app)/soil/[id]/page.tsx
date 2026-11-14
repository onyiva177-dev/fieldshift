import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import StatusBadge from "@/components/StatusBadge";
import AttachmentUploader from "@/components/AttachmentUploader";
import { categoryLabel, parameterLabel, paramByKey, sourceLabel } from "@/lib/soil-parameters";
import { reviewSample } from "../../admin/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "not recorded");

type Measurement = {
  parameter: string; value_num: number | null; value_text: string | null; unit: string | null;
  method: string | null; measured_on: string | null; source: string; responsible_party: string;
};

export default async function SoilSamplePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reviewError?: string; uploadProblem?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();

  const { data: s } = await supabase.from("soil_samples").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();

  const [farmRes, pointRes, measRes, attRes, recRes, replacedRes, prevRes] = await Promise.all([
    supabase.from("farms").select("id, name").eq("id", s.farm_id).maybeSingle(),
    supabase.from("farm_sampling_points").select("label, lat, lng").eq("id", s.sampling_point_id).maybeSingle(),
    supabase.from("soil_measurements").select("parameter, value_num, value_text, unit, method, measured_on, source, responsible_party").eq("sample_id", id),
    supabase.from("soil_attachments").select("id, storage_path, file_name, kind, mime_type").eq("sample_id", id).order("created_at"),
    supabase.from("soil_verification_records").select("decision, note, created_at").eq("sample_id", id).order("created_at"),
    supabase.from("soil_samples").select("id").eq("supersedes_sample_id", id).limit(1),
    s.supersedes_sample_id ? supabase.from("soil_samples").select("id").eq("id", s.supersedes_sample_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const order = (k: string) => { const i = (paramByKey(k) ? ["ph","nitrogen_total","phosphorus_available","potassium_exchangeable","organic_carbon","organic_matter","soil_moisture","electrical_conductivity","soil_depth","soil_texture","drainage"].indexOf(k) : 99); return i < 0 ? 99 : i; };
  const measurements = ((measRes.data ?? []) as Measurement[]).sort((a, b) => order(a.parameter) - order(b.parameter));
  const attachments = (attRes.data ?? []) as { id: string; storage_path: string; file_name: string; kind: string; mime_type: string }[];
  const records = (recRes.data ?? []) as { decision: string; note: string | null; created_at: string }[];
  const replacedBy = replacedRes.data?.[0]?.id as string | undefined;

  const urls = new Map<string, string>();
  if (attachments.length) {
    const { data: signed } = await supabase.storage.from("soil-attachments").createSignedUrls(attachments.map((a) => a.storage_path), 600);
    (signed ?? []).forEach((r) => { if (r.path && r.signedUrl) urls.set(r.path, r.signedUrl); });
  }

  const isSubmitter = s.submitted_by === user.id;
  const backHref = user.role === "farmer" ? `/farms/${s.farm_id}` : user.role === "admin" ? "/admin/soil" : `/officer/farms/${s.farm_id}`;

  return (
    <div className="space-y-6">
      <Link href={backHref} className="font-semibold text-field-800 underline">Back</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Soil sample</h1>
          <p>{farmRes.data?.name}. Point {pointRes.data?.label ?? "unknown"}, sampled {fmt(s.sampled_on)}{s.sample_depth_cm ? `, depth ${s.sample_depth_cm} cm` : ""}.</p>
        </div>
        <StatusBadge status={s.verification_status} />
      </div>

      {s.verification_status !== "verified" && (
        <p className="card border-amber-600 bg-amber-50 text-sm">
          This result is not verified, so it is not used for crop recommendations.
        </p>
      )}
      {sp.uploadProblem && (
        <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">
          The sample was submitted, but some files did not upload. Add them again below.
        </p>
      )}
      {replacedBy && (
        <p className="card text-sm">A corrected sample replaced this one. <Link href={`/soil/${replacedBy}`} className="font-semibold underline">View the newer sample</Link>.</p>
      )}
      {prevRes.data && (
        <p className="card text-sm">This sample replaces an earlier one. <Link href={`/soil/${prevRes.data.id}`} className="font-semibold underline">View the earlier sample</Link>.</p>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Measurements</h2>
        {s.lab_name && <p className="text-sm">Laboratory: {s.lab_name}{s.lab_reference ? `, report ${s.lab_reference}` : ""}.</p>}
        <ul className="space-y-2">
          {measurements.map((m) => {
            const has = m.value_num !== null || m.value_text !== null;
            return (
              <li key={m.parameter} className="card">
                <p className="font-bold">{parameterLabel(m.parameter)}</p>
                {has ? (
                  <>
                    <p className="text-lg">
                      {m.value_num !== null ? `${Number(m.value_num)} ${m.unit ?? ""}` : categoryLabel(m.parameter, m.value_text ?? "")}
                    </p>
                    <p className="text-sm">
                      {m.method ? `Method: ${m.method}. ` : ""}Source: {sourceLabel(m.source)}. Tested {fmt(m.measured_on)}. Responsible: {m.responsible_party}.
                    </p>
                  </>
                ) : (
                  <p>Not available. Not measured.</p>
                )}
              </li>
            );
          })}
        </ul>
        {s.notes && <p><span className="font-semibold">Notes:</span> {s.notes}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Lab reports and photos</h2>
        {attachments.length === 0 ? (
          <p>No files attached.</p>
        ) : (
          <ul className="space-y-1">
            {attachments.map((a) => (
              <li key={a.id}>
                {urls.get(a.storage_path) ? (
                  <a href={urls.get(a.storage_path)} target="_blank" rel="noopener noreferrer" className="font-semibold text-field-800 underline">{a.file_name}</a>
                ) : (
                  a.file_name
                )}{" "}
                <span className="text-sm">({a.kind === "lab_report" ? "lab report" : "photo"})</span>
              </li>
            ))}
          </ul>
        )}
        {isSubmitter && s.verification_status === "pending" && <AttachmentUploader farmId={s.farm_id} sampleId={id} />}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Verification history</h2>
        {records.length === 0 ? (
          <p>Waiting for review.</p>
        ) : (
          <ul className="space-y-2">
            {records.map((r, i) => (
              <li key={i} className="card">
                <StatusBadge status={r.decision} /> <span className="text-sm">{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
                {r.note && <p className="mt-1">{r.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isSubmitter && ["needs_correction", "rejected"].includes(s.verification_status) && !replacedBy && (
        <Link href={`/officer/farms/${s.farm_id}/samples/new?supersedes=${id}`} className="btn-primary">Submit a corrected sample</Link>
      )}

      {user.role === "admin" && s.verification_status === "pending" && (
        <form action={reviewSample} className="card space-y-3 border-field-800">
          <h2 className="text-xl font-bold">Review this sample</h2>
          <input type="hidden" name="sampleId" value={id} />
          <fieldset className="space-y-1">
            <legend className="label">Decision</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="decision" value="verified" className="h-5 w-5" /> Verified: the results look correct</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="decision" value="needs_correction" className="h-5 w-5" /> Needs correction: ask the officer to fix and resubmit</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="decision" value="rejected" className="h-5 w-5" /> Rejected: the results cannot be used</label>
          </fieldset>
          <div>
            <label htmlFor="note" className="label">Note (required unless verifying)</label>
            <textarea id="note" name="note" rows={3} maxLength={1000} className="input" />
          </div>
          {sp.reviewError && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{sp.reviewError}</p>}
          <button type="submit" className="btn-primary">Save decision</button>
        </form>
      )}
    </div>
  );
}
