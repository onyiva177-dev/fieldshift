import Link from "next/link";
import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { assignOfficer, unassignOfficer } from "../actions";

export default async function AdminFarmsPage() {
  await requireRolePage(["admin"]);
  const supabase = await createClient();

  const [farmsRes, assignRes, officersRes] = await Promise.all([
    supabase.from("farms").select("id, name, county, sub_county, owner_id").order("created_at", { ascending: false }).limit(200),
    supabase.from("farm_officer_assignments").select("id, farm_id, officer_user_id"),
    supabase.from("agricultural_officers").select("user_id, organization_id, county").eq("verification_status", "verified"),
  ]);
  const farms = (farmsRes.data ?? []) as { id: string; name: string; county: string; sub_county: string | null; owner_id: string }[];
  const assigns = (assignRes.data ?? []) as { id: string; farm_id: string; officer_user_id: string }[];
  const officers = (officersRes.data ?? []) as { user_id: string; county: string }[];

  const userIds = Array.from(new Set([...farms.map((f) => f.owner_id), ...officers.map((o) => o.user_id)]));
  const { data: profs } = userIds.length ? await supabase.from("profiles").select("id, full_name").in("id", userIds) : { data: [] };
  const name = new Map<string, string>((profs ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Farms and officer assignments</h1>
      <p>Only verified officers can be assigned. Assigned officers can view the farm and record soil samples for it.</p>
      {officers.length === 0 && <p className="card">No verified officers yet. Verify an officer under <Link href="/admin" className="font-semibold underline">Officers</Link> first.</p>}

      {farms.length === 0 ? (
        <p className="card">No farms have been registered yet.</p>
      ) : (
        <ul className="space-y-3">
          {farms.map((f) => {
            const mine = assigns.filter((a) => a.farm_id === f.id);
            const free = officers.filter((o) => !mine.some((a) => a.officer_user_id === o.user_id));
            return (
              <li key={f.id} className="card space-y-3">
                <div>
                  <p className="text-lg font-bold">{f.name}</p>
                  <p className="text-sm">{[f.sub_county, f.county].filter(Boolean).join(", ")}. Owner: {name.get(f.owner_id) ?? "unknown"}.</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Assigned officers</p>
                  {mine.length === 0 ? <p className="text-sm">None.</p> : (
                    <ul className="space-y-1">
                      {mine.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center gap-2">
                          <span>{name.get(a.officer_user_id) ?? "Officer"}</span>
                          <form action={unassignOfficer}>
                            <input type="hidden" name="id" value={a.id} />
                            <button className="btn-secondary min-h-10 px-3 py-1 text-sm">Remove</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {free.length > 0 && (
                  <form action={assignOfficer} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="farmId" value={f.id} />
                    <div>
                      <label htmlFor={`o-${f.id}`} className="label">Assign an officer</label>
                      <select id={`o-${f.id}`} name="officerId" required defaultValue="" className="input">
                        <option value="" disabled>Choose</option>
                        {free.map((o) => <option key={o.user_id} value={o.user_id}>{name.get(o.user_id) ?? "Officer"} ({o.county})</option>)}
                      </select>
                    </div>
                    <button className="btn-primary">Assign</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
