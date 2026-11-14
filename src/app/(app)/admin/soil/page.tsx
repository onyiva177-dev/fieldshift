import Link from "next/link";
import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import StatusBadge from "@/components/StatusBadge";

type Row = { id: string; farm_id: string; sampled_on: string; verification_status: string; created_at: string };

export default async function AdminSoilPage() {
  await requireRolePage(["admin"]);
  const supabase = await createClient();

  const [pendingRes, doneRes] = await Promise.all([
    supabase.from("soil_samples").select("id, farm_id, sampled_on, verification_status, created_at").eq("verification_status", "pending").order("created_at").limit(100),
    supabase.from("soil_samples").select("id, farm_id, sampled_on, verification_status, created_at").neq("verification_status", "pending").order("reviewed_at", { ascending: false }).limit(10),
  ]);
  const pending = (pendingRes.data ?? []) as Row[];
  const done = (doneRes.data ?? []) as Row[];

  const farmIds = Array.from(new Set([...pending, ...done].map((r) => r.farm_id)));
  const { data: farms } = farmIds.length ? await supabase.from("farms").select("id, name").in("id", farmIds) : { data: [] };
  const fname = new Map<string, string>((farms ?? []).map((f: { id: string; name: string }) => [f.id, f.name]));

  const List = ({ rows }: { rows: Row[] }) => (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2">
          <Link href={`/soil/${r.id}`} className="font-semibold underline">
            {fname.get(r.farm_id) ?? "Farm"}, sampled {new Date(r.sampled_on).toLocaleDateString("en-GB")}
          </Link>
          <StatusBadge status={r.verification_status} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Soil sample reviews</h1>
      <section className="space-y-2">
        <h2 className="text-xl font-bold">Waiting for review ({pending.length})</h2>
        {pending.length === 0 ? <p className="card">Nothing is waiting for review.</p> : <List rows={pending} />}
      </section>
      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Recently reviewed</h2>
          <List rows={done} />
        </section>
      )}
    </div>
  );
}
