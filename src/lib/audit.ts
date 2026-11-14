import { createClient } from "@/lib/supabase/server";

export async function logAudit(entry: {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId,
    details: entry.details ?? null,
  });
  if (error) console.error("audit log failed", error.message);
}
