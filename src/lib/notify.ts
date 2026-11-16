import "server-only";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";

/** Best-effort in-app notifications. Never blocks or fails the action that triggered it. */
export async function notify(userIds: (string | null | undefined)[], title: string, body: string | null, link: string | null) {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)));
  if (!ids.length || !hasServiceRole()) return;
  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert(ids.map((user_id) => ({ user_id, title, body, link })));
  } catch (err) {
    console.error("[notify] failed", err instanceof Error ? err.message : err);
  }
}
