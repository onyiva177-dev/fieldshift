import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";

const statusStyle: Record<string, string> = {
  succeeded: "bg-green-100 text-green-900", failed: "bg-red-100 text-red-900", skipped: "bg-amber-100 text-amber-900", running: "bg-blue-100 text-blue-900",
};

export default async function AdminDataPage() {
  await requireRolePage(["admin"]);
  const supabase = await createClient();

  const [{ data: runs }, { count: obsCount }, { count: farmCount }] = await Promise.all([
    supabase.from("nasa_sync_runs").select("farm_id, dataset, trigger, status, rows_written, message, started_at").order("started_at", { ascending: false }).limit(60),
    supabase.from("nasa_observations").select("id", { count: "exact", head: true }),
    supabase.from("farms").select("id", { count: "exact", head: true }),
  ]);
  const list = (runs ?? []) as { farm_id: string; dataset: string; trigger: string; status: string; rows_written: number; message: string | null; started_at: string }[];
  const ids = Array.from(new Set(list.map((r) => r.farm_id)));
  const { data: farms } = ids.length ? await supabase.from("farms").select("id, name").in("id", ids) : { data: [] };
  const fname = new Map<string, string>((farms ?? []).map((f: { id: string; name: string }) => [f.id, f.name]));

  // only whether each setting exists is shown, never its value
  const checks = [
    { label: "SUPABASE_SERVICE_ROLE_KEY (lets the server save NASA data)", ok: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
    { label: "CRON_SECRET (protects the daily sync job)", ok: !!process.env.CRON_SECRET },
    { label: "EARTHDATA_USERNAME and EARTHDATA_PASSWORD (SMAP and MODIS)", ok: !!(process.env.EARTHDATA_USERNAME && process.env.EARTHDATA_PASSWORD) },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Data sources and sync</h1>
      <p>{farmCount ?? 0} farms. {obsCount ?? 0} NASA values stored.</p>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Server configuration</h2>
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.label} className="card flex flex-wrap items-center justify-between gap-2">
              <span>{c.label}</span>
              <span className={`rounded px-2 py-0.5 text-sm font-semibold ${c.ok ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>{c.ok ? "Set" : "Missing"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Recent sync runs</h2>
        {list.length === 0 ? (
          <p className="card">No sync has run yet.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((r, i) => (
              <li key={i} className="card">
                <p className="font-semibold">{fname.get(r.farm_id) ?? "Farm"}, {r.dataset}{" "}
                  <span className={`rounded px-2 py-0.5 text-sm ${statusStyle[r.status] ?? ""}`}>{r.status}</span></p>
                <p className="text-sm">{new Date(r.started_at).toLocaleString("en-GB")}. Started by {r.trigger.replace("_", " ")}. {r.rows_written} values written.</p>
                {r.message && <p className="text-sm">{r.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
