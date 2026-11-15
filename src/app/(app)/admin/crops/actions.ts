"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRoleAction } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { parseCropForm } from "@/lib/crop-validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveCrop(cropId: string | null, fd: FormData): Promise<void> {
  const admin = await requireRoleAction(["admin"]);
  const here = cropId ? `/admin/crops/${cropId}` : "/admin/crops/new";
  if (cropId && !UUID.test(cropId)) redirect("/admin/crops");

  const { payload, error: invalid } = parseCropForm(fd);
  if (!payload) redirect(`${here}?error=${encodeURIComponent(invalid ?? "Check the form.")}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_crop", { p_crop_id: cropId, p: payload });
  if (error) {
    const msg = error.code === "23505" ? "A crop with this short name already exists." : error.code === "P0001" ? error.message : "Could not save the crop.";
    redirect(`${here}?error=${encodeURIComponent(msg)}`);
  }
  await logAudit({ actorId: admin.id, action: cropId ? "crop.updated" : "crop.created", entity: "crop", entityId: String(data) });
  revalidatePath("/admin/crops");
  redirect("/admin/crops?saved=1");
}
