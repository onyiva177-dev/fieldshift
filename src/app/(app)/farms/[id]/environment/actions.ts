"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireRoleAction } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { syncFarm } from "@/lib/nasa/sync";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Starts a refresh in the background and returns at once, so the page never waits on NASA.
export async function refreshFarmData(fd: FormData): Promise<void> {
  const user = await requireRoleAction(["farmer", "admin"]);
  const farmId = String(fd.get("farmId") ?? "");
  if (!UUID.test(farmId)) return;
  const back = `/farms/${farmId}/environment`;

  const supabase = await createClient();
  const { data: farm } = await supabase.from("farms").select("id").eq("id", farmId).maybeSingle();
  if (!farm) redirect(back);

  if (!hasServiceRole()) redirect(`${back}?msg=not_configured`);

  const { data: last } = await supabase
    .from("nasa_sync_runs").select("started_at").eq("farm_id", farmId).order("started_at", { ascending: false }).limit(1);
  if (last?.[0] && Date.now() - new Date(last[0].started_at).getTime() < 10 * 60 * 1000) redirect(`${back}?msg=too_soon`);

  after(async () => {
    try {
      await syncFarm(farmId, "manual", { force: true });
    } catch (err) {
      console.error("[refresh] sync failed", farmId, err);
    }
  });
  await logAudit({ actorId: user.id, action: "nasa.refresh_requested", entity: "farm", entityId: farmId });
  redirect(`${back}?msg=started`);
}
