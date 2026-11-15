import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { syncFarm } from "@/lib/nasa/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called once a day by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!hasServiceRole()) return Response.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });

  const admin = createAdminClient();
  const [{ data: farms }, { data: runs }] = await Promise.all([
    admin.from("farms").select("id").limit(500),
    admin.from("nasa_sync_runs").select("farm_id, started_at").order("started_at", { ascending: false }).limit(2000),
  ]);

  // least recently synced first, so every farm gets a turn even if a run is cut short
  const last = new Map<string, number>();
  for (const r of runs ?? []) if (!last.has(r.farm_id)) last.set(r.farm_id, new Date(r.started_at).getTime());
  const order = (farms ?? []).map((f) => f.id as string).sort((a, b) => (last.get(a) ?? 0) - (last.get(b) ?? 0));

  const started = Date.now();
  let processed = 0;
  for (const id of order) {
    if (Date.now() - started > 35000) break; // leave room to finish inside the function time limit
    try {
      await syncFarm(id, "cron");
    } catch (err) {
      console.error("[cron] farm failed", id, err);
    }
    processed++;
  }
  return Response.json({ ok: true, farms: order.length, processed, seconds: Math.round((Date.now() - started) / 1000) });
}
