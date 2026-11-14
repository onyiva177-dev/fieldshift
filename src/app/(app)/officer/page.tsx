import Link from "next/link";
import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import StatusBadge from "@/components/StatusBadge";

type Farm = { id: string; name: string; county: string; sub_county: string | null; village: string | null };
type Sample = { id: string; farm_id: string; sampled_on: string; verification_status: string };

export default async function OfficerPage() {
  const user = await requireRolePage(["officer"]);
  const supabase = await createClient();

  const { data: officer } = await supabase
    .from("agricultural_officers")
    .select("verification_status")
    .eq("user_id", user.id)
    .maybeSingle();
  const verified = officer?.verification_status === "verified";

  let farms: Farm[] = [];
  let samples: Sample[] = [];
  if (verified) {
    const { data: assigned } = await supabase.from("farm_officer_assignments").select("farm_id").eq("officer_user_id", user.id);
    const ids = (assigned ?? []).map((a: { farm_id: string }) => a.farm_id);
    if (ids.length) {
      const { data } = await supabase.from("farms").select("id, name, county, sub_county, village").in("id", ids).order("name");
      farms = (data ?? []) as Farm[];
    }
    const { data: s } = await supabase
      .from("soil_samples")
      .select("id, farm_id, sampled_on, verification_status")
      .eq("submitted_by", user.id)
      .order("created_at", { ascending: false })
      .limit(15);
    samples = (s ?? []) as Sample[];
  }
  const farmName = (id: string) => farms.find((f) => f.id === id)?.name ?? "Farm";
  const needsFix = samples.filter((s) => s.verification_status === "needs_correction" || s.verification_status === "rejected");

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

      {verified && needsFix.length > 0 && (
        <section className="card border-orange-600 bg-orange-50">
          <h2 className="text-xl font-bold">Samples that need your attention</h2>
          <ul className="mt-2 space-y-1">
            {needsFix.map((s) => (
              <li key={s.id}>
                <Link href={`/soil/${s.id}`} className="font-semibold underline">{farmName(s.farm_id)}, sampled {new Date(s.sampled_on).toLocaleDateString("en-GB")}</Link>{" "}
                <StatusBadge status={s.verification_status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {verified && (
        <section>
          <h2 className="text-xl font-bold">Assigned farms</h2>
          {farms.length === 0 ? (
            <p className="card mt-2">No farms are assigned to you yet. An administrator assigns farms to officers.</p>
          ) : (
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
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

      {verified && samples.length > 0 && (
        <section>
          <h2 className="text-xl font-bold">Your recent submissions</h2>
          <ul className="mt-2 space-y-2">
            {samples.map((s) => (
              <li key={s.id} className="card flex flex-wrap items-center justify-between gap-2">
                <Link href={`/soil/${s.id}`} className="font-semibold underline">{farmName(s.farm_id)}, {new Date(s.sampled_on).toLocaleDateString("en-GB")}</Link>
                <StatusBadge status={s.verification_status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
