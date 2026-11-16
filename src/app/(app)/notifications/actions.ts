"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRoleAction } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function openNotification(fd: FormData): Promise<void> {
  await requireRoleAction(["farmer", "officer", "admin"]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).select("link");
  revalidatePath("/notifications");
  const link = data?.[0]?.link;
  redirect(typeof link === "string" && link.startsWith("/") ? link : "/notifications");
}

export async function markAllRead(): Promise<void> {
  await requireRoleAction(["farmer", "officer", "admin"]);
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
