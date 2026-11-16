import Link from "next/link";
import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import FarmMap from "@/components/FarmMap";
import FarmSnapshotCard from "@/components/FarmSnapshotCard";
import { loadAdminStats, loadFarmSnapshot, type FarmRow } from "@/lib/dashboard";

const roleLabel = { farmer: "Farmer", officer: "Agricultural officer", admin: "Administrator" } as const;

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (<><p className="text-sm font-semibold">{label}</p><p className="text-3xl font-bold">{value}</p></>);
  return href ? <Link href={href} className="card block hover:border-field-800">{inner}</Link> : <div className="card">{inner}</div>;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: notes, count: unread } = await supabase.from("notifications")
    .select("id, title, link, created_at", { count: "exact" }).is("read_at", null).order("created_at", { ascending: false }).limit(4);

  let body: React.ReactNode = null;

  if (user.role === "farmer") {
    const { data } = await supabase.from("farms").select("id, name, county, size_ha, lat, lng").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(12);
    const farms = (data ?? []) as FarmRow[];
    const snaps = await Promise.all(farms.slice(0, 4).map((f) => loadFarmSnapshot(supabase, f)));
    const alerts = snaps.flatMap((s) => s.alerts);
    body = (
      <>
        {farms.length === 0 ? (
          <section className="card">
            <h2 className="text-xl font-bold">Your farms</h2>
            <p className="mt-1">No farms registered yet. Register your first farm to get soil, climate and crop advice.</p>
            <Link href="/farms/new" className="btn-primary mt-3">Register a farm</Link>
          </section>
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="text-xl font-bold">Alerts</h2>
              {alerts.length === 0 ? (
                <p className="card">Nothing needs your attention right now.</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((a, i) => (
                    <li key={i} className={`card ${a.level === "warning" ? "border-orange-600 bg-orange-50" : ""}`}>
                      <span className="font-semibold">{a.level === "warning" ? "Attention: " : "Note: "}</span>
                      {a.href ? <Link href={a.href} className="underline">{a.text}</Link> : a.text}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-bold">Your farms on the map</h2>
              <FarmMap pin={null} points={[]} markers={farms.map((f) => ({ lat: f.lat, lng: f.lng, label: f.name }))} />
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold">Your farms</h2>
                <Link href="/farms/new" className="btn-secondary min-h-10 px-3 py-1 text-sm">Register another farm</Link>
              </div>
              {snaps.map((s) => <FarmSnapshotCard key={s.farm.id} s={s} />)}
              {farms.length > snaps.length && <p className="text-sm">Showing {snaps.length} of {farms.length} farms. <Link href="/farms" className="font-semibold underline">See all farms</Link>.</p>}
            </section>
          </>
        )}
      </>
    );
  }

  if (user.role === "officer") {
    body = (
      <section className="card">
        <h2 className="text-xl font-bold">Field work</h2>
        <p className="mt-1">See your assigned farms, plan visits and record soil samples.</p>
        <Link href="/officer" className="btn-primary mt-3">Open officer dashboard</Link>
      </section>
    );
  }

  if (user.role === "admin") {
    const st = await loadAdminStats(supabase);
    const waiting = (st.officers.pending ?? 0) + (st.samples.pending ?? 0);
    body = (
      <>
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Needs attention</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Officers waiting for verification" value={st.officers.pending ?? 0} href="/admin" />
            <Stat label="Soil samples waiting for review" value={st.samples.pending ?? 0} href="/admin/soil" />
            <Stat label="Failed NASA syncs (7 days)" value={st.syncFailures7d} href="/admin/data" />
            <Stat label="Draft crops awaiting review" value={st.draftCrops} href="/admin/crops" />
          </div>
          {waiting === 0 && st.syncFailures7d === 0 && st.draftCrops === 0 && <p className="card">All caught up.</p>}
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Platform statistics</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Accounts" value={st.users} href="/admin/users" />
            <Stat label="Farmers" value={st.roles.farmer ?? 0} />
            <Stat label="Officers (verified)" value={`${st.officers.verified ?? 0} of ${(st.officers.verified ?? 0) + (st.officers.pending ?? 0) + (st.officers.rejected ?? 0)}`} />
            <Stat label="Farms" value={st.farms} href="/admin/farms" />
            <Stat label="Verified soil samples" value={st.samples.verified ?? 0} />
            <Stat label="NASA values stored" value={st.observations.toLocaleString("en-GB")} />
            <Stat label="Saved recommendations" value={st.recommendations} />
            <Stat label="Rotation plans" value={st.plans} />
          </div>
        </section>
        <section className="card space-y-2">
          <h2 className="text-xl font-bold">Manage</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/users" className="btn-secondary">Users</Link>
            <Link href="/admin" className="btn-secondary">Officers</Link>
            <Link href="/admin/farms" className="btn-secondary">Assignments</Link>
            <Link href="/admin/soil" className="btn-secondary">Soil reviews</Link>
            <Link href="/admin/crops" className="btn-secondary">Crops</Link>
            <Link href="/admin/engine" className="btn-secondary">Engine</Link>
            <Link href="/admin/data" className="btn-secondary">Data sync</Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Hello, {user.name}</h1>
        <p className="mt-1">Signed in as: {roleLabel[user.role]}</p>
      </div>

      {(unread ?? 0) > 0 && (
        <section className="card border-field-800 bg-field-100">
          <h2 className="text-lg font-bold">{unread} new notification{unread === 1 ? "" : "s"}</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {(notes ?? []).map((n: { id: string; title: string }) => <li key={n.id}>{n.title}</li>)}
          </ul>
          <Link href="/notifications" className="mt-2 inline-block font-semibold underline">Open notifications</Link>
        </section>
      )}

      {body}
    </div>
  );
}
