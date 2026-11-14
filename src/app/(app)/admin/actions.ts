"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRoleAction } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assignOfficer(fd: FormData): Promise<void> {
  const admin = await requireRoleAction(["admin"]);
  const farmId = String(fd.get("farmId") ?? "");
  const officerId = String(fd.get("officerId") ?? "");
  if (!UUID.test(farmId) || !UUID.test(officerId)) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("farm_officer_assignments")
    .insert({ farm_id: farmId, officer_user_id: officerId, assigned_by: admin.id })
    .select("id")
    .single();
  if (!error && data) {
    await logAudit({ actorId: admin.id, action: "assignment.created", entity: "farm", entityId: farmId, details: { officerId } });
  }
  revalidatePath("/admin/farms");
}

export async function unassignOfficer(fd: FormData): Promise<void> {
  const admin = await requireRoleAction(["admin"]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;

  const supabase = await createClient();
  const { data } = await supabase.from("farm_officer_assignments").delete().eq("id", id).select("farm_id, officer_user_id");
  if (data?.length) {
    await logAudit({ actorId: admin.id, action: "assignment.removed", entity: "farm", entityId: data[0].farm_id, details: { officerId: data[0].officer_user_id } });
  }
  revalidatePath("/admin/farms");
}

export async function reviewSample(fd: FormData): Promise<void> {
  const admin = await requireRoleAction(["admin"]);
  const id = String(fd.get("sampleId") ?? "");
  const decision = String(fd.get("decision") ?? "");
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000);
  if (!UUID.test(id)) return;
  if (!["verified", "rejected", "needs_correction"].includes(decision)) {
    redirect(`/soil/${id}?reviewError=${encodeURIComponent("Choose a decision.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_soil_sample", { p_sample: id, p_decision: decision, p_note: note });
  if (error) {
    const msg = error.code === "P0001" ? error.message : "Could not save the review.";
    redirect(`/soil/${id}?reviewError=${encodeURIComponent(msg)}`);
  }

  await logAudit({ actorId: admin.id, action: `soil_sample.${decision}`, entity: "soil_sample", entityId: id });
  revalidatePath("/admin/soil");
  revalidatePath(`/soil/${id}`);
  redirect("/admin/soil");
}
