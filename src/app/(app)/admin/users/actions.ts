"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRoleAction } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setUserRole(fd: FormData): Promise<void> {
  const admin = await requireRoleAction(["admin"]);
  const userId = String(fd.get("userId") ?? "");
  const role = String(fd.get("role") ?? "");
  if (!UUID.test(userId) || !["farmer", "admin"].includes(role)) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role", { p_user: userId, p_role: role });
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.code === "P0001" ? error.message : "Could not change the role.")}`);

  await logAudit({ actorId: admin.id, action: "user.role_changed", entity: "user", entityId: userId, details: { role } });
  await notify([userId], role === "admin" ? "You are now an administrator" : "Your administrator access was removed", null, "/dashboard");
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}
