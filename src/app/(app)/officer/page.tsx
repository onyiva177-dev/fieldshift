import Link from "next/link";
import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import StatusBadge from "@/components/StatusBadge";
import SubmitButton from "@/components/SubmitButton";
import { addFieldVisit, setVisitStatus } from "./actions";

type Farm = { id: string; name: string; county: string; sub_county: string | null; village: string | null };
type Sample = { id: string; farm_id: string; sampled_on: string; verification_status: string };
type Visit = { id: string; farm_id: string; visit_date: string; purpose: string; notes: string | null; status: string };

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="card"><p className="text-sm font-semibold">{label}</p><p className="text-3xl font-bold">{value}</p></div>;
}

export default async function OfficerPage({ searchParams }: { searchParams: Promise<{ visitError?: string }> }) {
  const user = await requireRolePage(["officer"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: officer } = await supabase.from("agricultural_officers").select("verification_status").eq("user_id", user.id).maybeSingle();
  const verified = officer?.verification_status === "verified";

  let farms: Farm[] = [];
  let samples: Sample[] = [];
  let visits: Visit[] = [];
  if (verified) {
    const { data: assigned } = await supabase.from("farm_officer_assignments").select("farm_id").eq("officer_user_id", user.id);
    const ids = (assigned ?? []).map((a: { farm_id: string }) => a.farm_id);
    const [farmsRes, samplesRes, visitsRes] = await Promise.all([
      ids.length ? supabase.from("farms").select("id, name, county, sub_county, village").in("id", ids).order("name") : Promise.resolve({ data: [] }),
      supabase.from("soil_samples").select("id, farm_id, sampled_on, verification_status").eq("submitted_by", user.id).order("created_at", { ascending: false }).limit(60),
      supabase.from("field_visits").select("id, farm_id, visit_date, purpose, notes, status").eq("officer_user_id", user.id).order("visit_date", { ascending: true }).limit(80),
    ]);
    farms = (farmsRes.data ?? []) as Farm[];
    samples = (samplesRes.data ?? []) as Sample[];
    visits = (visitsRes.data ?? []) as Visit[];
  }
  const fname = (id: string) => farms.find((f) => f.id === id)?.name ?? "Farm";
  const needsFix = samples.filter((s) => ["needs_correction", "rejected"].includes(s.verification_status));
  const count = (st: string) => samples.filter((s) => s.verification_status === st).length;
  const planned = visits.filter((v) => v.status === "planned");
  const done = visits.filter((v) => v.status === "completed").slice(-5).reverse();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Officer dashboard</h1>

      {!verified && (
        <p role="status" className="card border-amber-600 bg-amber-50">
          {officer?.verification_status === "rejected"
            ? "Your officer registration was rejected. Contact your administrator."
            : "Your account is waiting for administrator verification. You can work on farms once it is verified and farms are assigned to you."}
        </p>
      )}

      {verified && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Assigned farms" value={farms.length} />
          <Stat label="Waiting for verification" value={count("pending")} />
          <Stat label="Need your attention" value={needsFix.length} />
          <Stat label="Planned visits" value={planned.length} />
        </section>
      )}

      {verified && needsFix.length > 0 && (
        <section className="card border-orange-600 bg-orange-50">
          <h2 className="text-xl font-bold">Samples that need your attention</h2>
          <ul className="mt-2 space-y-1">
            {needsFix.map((s) => (
              <li key={s.id}>
                <Link href={`/soil/${s.id}`} className="font-semibold underline">{fname(s.farm_id)}, sampled {new Date(s.sampled_on).toLocaleDateString("en-GB")}</Link>{" "}
                <StatusBadge status={s.verification_status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {verified && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Assigned farms</h2>
          {farms.length === 0 ? (
            <p className="card">No farms are assigned to you yet. An administrator assigns farms to officers.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {farms.map((f) => (
                <li key={f.id} className="card">
                  <Link href={`/officer/farms/${f.id}`} className="text-lg font-bold underline-offset-4 hover:underline">{f.name}</Link>
                  <p>{[f.village, f.sub_county, f.county].filter(Boolean).join(", ")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {verified && farms.length > 0 && (
        <section id="visits" className="space-y-3">
          <h2 className="text-xl font-bold">Field visits</h2>
          {sp.visitError && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{sp.visitError}</p>}

          {planned.length === 0 ? <p className="card">No planned visits.</p> : (
            <ul className="space-y-2">
              {planned.map((v) => (
                <li key={v.id} className="card space-y-2">
                  <p className="font-bold">{new Date(v.visit_date).toLocaleDateString("en-GB")}: {fname(v.farm_id)}{v.visit_date < today ? <span className="ml-2 rounded bg-orange-100 px-2 py-0.5 text-sm text-orange-900">Overdue</span> : null}</p>
                  <p className="text-sm">{v.purpose}{v.notes ? `. ${v.notes}` : ""}</p>
                  <div className="flex gap-2">
                    <form action={setVisitStatus}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="status" value="completed" /><SubmitButton pendingText="Saving...">Mark completed</SubmitButton></form>
                    <form action={setVisitStatus}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="status" value="cancelled" /><SubmitButton className="btn-secondary" pendingText="Cancelling...">Cancel visit</SubmitButton></form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form action={addFieldVisit} className="card space-y-3">
            <h3 className="text-lg font-bold">Plan a visit</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="farmId" className="label">Farm</label>
                <select id="farmId" name="farmId" required defaultValue="" className="input"><option value="" disabled>Choose a farm</option>{farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
              <div><label htmlFor="visitDate" className="label">Date</label><input id="visitDate" name="visitDate" type="date" required defaultValue={today} className="input" /></div>
            </div>
            <div><label htmlFor="purpose" className="label">Purpose</label><input id="purpose" name="purpose" required maxLength={200} placeholder="e.g. Soil sampling at two points" className="input" /></div>
            <div><label htmlFor="notes" className="label">Notes (optional)</label><textarea id="notes" name="notes" rows={2} maxLength={1000} className="input" /></div>
            <SubmitButton pendingText="Saving...">Add visit</SubmitButton>
          </form>

          {done.length > 0 && (
            <div>
              <h3 className="font-bold">Recently completed</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">{done.map((v) => <li key={v.id}>{new Date(v.visit_date).toLocaleDateString("en-GB")}: {fname(v.farm_id)}. {v.purpose}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {verified && samples.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Your recent soil submissions</h2>
          <ul className="space-y-2">
            {samples.slice(0, 12).map((s) => (
              <li key={s.id} className="card flex flex-wrap items-center justify-between gap-2">
                <Link href={`/soil/${s.id}`} className="font-semibold underline">{fname(s.farm_id)}, {new Date(s.sampled_on).toLocaleDateString("en-GB")}</Link>
                <StatusBadge status={s.verification_status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
