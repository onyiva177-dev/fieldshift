import Link from "next/link";
import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import type { OfficerVerification } from "@/lib/types";

const roleLabel = { farmer: "Farmer", officer: "Agricultural officer", admin: "Administrator" } as const;

type OfficerRow = {
  professional_role: string;
  county: string;
  sub_county: string | null;
  verification_status: OfficerVerification;
  organizations: { name: string } | null;
};

const statusText: Record<OfficerVerification, string> = {
  pending: "Waiting for administrator review",
  verified: "Verified",
  rejected: "Rejected",
};
const statusClass: Record<OfficerVerification, string> = {
  pending: "bg-amber-100 text-amber-900",
  verified: "bg-green-100 text-green-900",
  rejected: "bg-red-100 text-red-900",
};

export default async function DashboardPage() {
  const user = await requireUser();

  let officer: OfficerRow | null = null;
  if (user.role === "officer") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("agricultural_officers")
      .select("professional_role, county, sub_county, verification_status, organizations(name)")
      .eq("user_id", user.id)
      .maybeSingle();
    officer = data as unknown as OfficerRow | null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Hello, {user.name}</h1>
        <p className="mt-1">Signed in as: {roleLabel[user.role]}</p>
      </div>

      {officer && (
        <section className="card">
          <h2 className="text-xl font-bold">Your officer account</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div><dt className="text-sm font-semibold">Organization</dt><dd>{officer.organizations?.name}</dd></div>
            <div><dt className="text-sm font-semibold">Role</dt><dd>{officer.professional_role}</dd></div>
            <div>
              <dt className="text-sm font-semibold">Assigned area</dt>
              <dd>{officer.county}{officer.sub_county ? `, ${officer.sub_county}` : ""}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold">Verification</dt>
              <dd>
                <span className={`inline-block rounded px-2 py-0.5 text-sm font-semibold ${statusClass[officer.verification_status]}`}>
                  {statusText[officer.verification_status]}
                </span>
              </dd>
            </div>
          </dl>
        </section>
      )}

      {user.role === "admin" && (
        <section className="card">
          <h2 className="text-xl font-bold">Administration</h2>
          <p className="mt-1">Review officer registrations before they can submit soil data.</p>
          <Link href="/admin" className="btn-primary mt-3">Review officers</Link>
        </section>
      )}

      {user.role === "farmer" && (
        <section className="card">
          <h2 className="text-xl font-bold">Your farms</h2>
          <p className="mt-1">No farms registered yet. Farm registration with map pinning is the next module being added.</p>
        </section>
      )}
    </div>
  );
}
