"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRoleAction } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { parseSoilForm } from "@/lib/soil-validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export type ActionResult = { error?: string };

const dbMessage = (err: { code?: string; message: string }, fallback: string) =>
  err.code === "P0001" ? err.message : fallback;

export async function addSamplingPoint(fd: FormData): Promise<ActionResult> {
  const user = await requireRoleAction(["officer", "admin"]);
  const farmId = String(fd.get("farmId") ?? "");
  const label = String(fd.get("label") ?? "").trim();
  const notes = String(fd.get("notes") ?? "").trim();
  const latRaw = String(fd.get("lat") ?? "").trim();
  const lngRaw = String(fd.get("lng") ?? "").trim();
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!UUID.test(farmId)) return { error: "Farm not found." };
  if (label.length < 1 || label.length > 60) return { error: "Enter a short label for the sampling point, such as P1." };
  if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "Place the sampling point on the map, or enter valid coordinates." };
  }
  if (notes.length > 300) return { error: "The note is too long (300 characters at most)." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("farm_sampling_points")
    .insert({ farm_id: farmId, label, lat, lng, notes: notes || null, created_by: user.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "A sampling point with this label already exists on this farm." };
    return { error: dbMessage(error, "Could not save the sampling point. You may not be assigned to this farm.") };
  }

  await logAudit({ actorId: user.id, action: "sampling_point.created", entity: "sampling_point", entityId: data.id });
  revalidatePath(`/officer/farms/${farmId}`);
  redirect(`/officer/farms/${farmId}`);
}

export async function submitSoilSample(fd: FormData): Promise<ActionResult & { sampleId?: string; farmId?: string }> {
  const user = await requireRoleAction(["officer"]);
  const { payload, error: invalid } = parseSoilForm(fd);
  if (!payload) return { error: invalid };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_soil_sample", { p: payload });
  if (error) {
    return { error: dbMessage(error, "Could not submit the sample. Check that you are assigned to this farm and your account is verified.") };
  }

  const sampleId = String(data);
  await logAudit({ actorId: user.id, action: "soil_sample.submitted", entity: "soil_sample", entityId: sampleId });
  revalidatePath(`/officer/farms/${String(payload.farm_id)}`);
  return { sampleId, farmId: String(payload.farm_id) };
}

export interface AttachmentInput {
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: "lab_report" | "photo";
}

export async function registerSoilAttachments(sampleId: string, items: AttachmentInput[]): Promise<ActionResult> {
  const user = await requireRoleAction(["officer"]);
  if (!UUID.test(sampleId)) return { error: "Sample not found." };
  if (!Array.isArray(items) || items.length === 0 || items.length > 10) return { error: "No files to register." };

  const supabase = await createClient();
  const { data: sample } = await supabase.from("soil_samples").select("farm_id").eq("id", sampleId).maybeSingle();
  if (!sample) return { error: "Sample not found." };

  const prefix = `${sample.farm_id}/${sampleId}/`;
  const rows = [];
  for (const it of items) {
    const ok =
      typeof it.path === "string" && it.path.startsWith(prefix) && !it.path.includes("..") &&
      MIME.includes(it.mime) && Number.isInteger(it.size) && it.size > 0 && it.size <= 5 * 1024 * 1024 &&
      (it.kind === "lab_report" || it.kind === "photo") && typeof it.name === "string" && it.name.length > 0;
    if (!ok) return { error: "One of the files was not accepted." };
    rows.push({
      sample_id: sampleId, storage_path: it.path, file_name: it.name.slice(0, 200), mime_type: it.mime,
      size_bytes: it.size, kind: it.kind, uploaded_by: user.id,
    });
  }

  const { error } = await supabase.from("soil_attachments").insert(rows);
  if (error) return { error: dbMessage(error, "Could not attach the files. Attachments can only be added while a sample is pending.") };

  await logAudit({ actorId: user.id, action: "soil_attachment.added", entity: "soil_sample", entityId: sampleId, details: { count: rows.length } });
  revalidatePath(`/soil/${sampleId}`);
  return {};
}

// Field visits -----------------------------------------------------------

export async function addFieldVisit(fd: FormData): Promise<void> {
  const user = await requireRoleAction(["officer"]);
  const farmId = String(fd.get("farmId") ?? "");
  const date = String(fd.get("visitDate") ?? "");
  const purpose = String(fd.get("purpose") ?? "").trim();
  const notes = String(fd.get("notes") ?? "").trim();
  const fail = (m: string) => redirect(`/officer?visitError=${encodeURIComponent(m)}#visits`);

  if (!UUID.test(farmId)) return fail("Choose a farm.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return fail("Choose a valid visit date.");
  const days = (Date.parse(date) - Date.now()) / 86400000;
  if (days > 366 || days < -366) return fail("The visit date must be within a year of today.");
  if (purpose.length < 3 || purpose.length > 200) return fail("Describe the purpose of the visit (3 to 200 characters).");
  if (notes.length > 1000) return fail("Notes are too long (1000 characters at most).");

  const supabase = await createClient();
  const { data, error } = await supabase.from("field_visits")
    .insert({ farm_id: farmId, officer_user_id: user.id, visit_date: date, purpose, notes: notes || null }).select("id").single();
  if (error || !data) return fail("Could not save the visit. You may not be assigned to that farm.");

  await logAudit({ actorId: user.id, action: "field_visit.created", entity: "field_visit", entityId: data.id });
  revalidatePath("/officer");
  redirect("/officer#visits");
}

export async function setVisitStatus(fd: FormData): Promise<void> {
  const user = await requireRoleAction(["officer"]);
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!UUID.test(id) || !["completed", "cancelled"].includes(status)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("field_visits").update({ status }).eq("id", id).eq("status", "planned").select("id");
  if (data?.length) await logAudit({ actorId: user.id, action: `field_visit.${status}`, entity: "field_visit", entityId: id });
  revalidatePath("/officer");
}
