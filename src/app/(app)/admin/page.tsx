import { revalidatePath } from "next/cache";
import { requireRoleAction, requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import SubmitButton from "@/components/SubmitButton";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function decide(formData: FormData) {
  "use server";
  const admin = await requireRoleAction(["admin"]);

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!UUID.test(id) || (decision !== "verified" && decision !== "rejected")) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agricultural_officers")
    .update({ verification_status: decision, verified_by: admin.id, verified_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  if (!error && data?.length) {
    await logAudit({ actorId: admin.id, action: `officer.${decision}`, entity: "officer", entityId: id });
  }
  revalidatePath("/admin");
}

type PendingRow = {
  id: string;
  professional_role: string;
  county: string;
  sub_county: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  organizations: { name: string } | null;
};

export default async function AdminPage() {
  await requireRolePage(["admin"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("agricultural_officers")
    .select("id, professional_role, county, sub_county, contact_email, contact_phone, created_at, organizations(name)")
    .eq("verification_status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  const pending = (data ?? []) as unknown as PendingRow[];

  const { count: reviewed } = await supabase
    .from("agricultural_officers")
    .select("id", { count: "exact", head: true })
    .neq("verification_status", "pending");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Officer verification</h1>
      <p>{pending.length} waiting for review. {reviewed ?? 0} already reviewed.</p>

      {pending.length === 0 ? (
        <p className="card">No officer registrations are waiting for review.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((o) => (
            <li key={o.id} className="card">
              <p className="text-lg font-bold">{o.professional_role}, {o.organizations?.name}</p>
              <p>Area: {o.county}{o.sub_county ? `, ${o.sub_county}` : ""}</p>
              <p>Contact: {o.contact_email}, {o.contact_phone}</p>
              <p className="text-sm">Registered {new Date(o.created_at).toLocaleDateString("en-GB")}</p>
              <form action={decide} className="mt-3 flex gap-2">
                <input type="hidden" name="id" value={o.id} />
                <SubmitButton name="decision" value="verified" pendingText="Verifying...">Verify officer</SubmitButton>
                <SubmitButton name="decision" value="rejected" className="btn-secondary" pendingText="Rejecting...">Reject</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
