import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";
import { setUserRole } from "./actions";

type P = { id: string; full_name: string; phone: string | null; created_at: string };

const style: Record<string, string> = { admin: "bg-purple-100 text-purple-900", officer: "bg-blue-100 text-blue-900", farmer: "bg-green-100 text-green-900" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const me = await requireRolePage(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: profs }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, created_at").order("created_at", { ascending: false }).limit(300),
    supabase.from("user_roles").select("user_id, role").limit(1000),
  ]);
  const role = new Map<string, string>((roles ?? []).map((r: { user_id: string; role: string }) => [r.user_id, r.role]));
  const list = (profs ?? []) as P[];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Users</h1>
      <p>{list.length} accounts. Officer accounts are created at registration and verified under Officers. Here you can make a farmer account an administrator, or remove administrator access.</p>
      {sp.error && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{sp.error}</p>}
      {sp.saved && <p role="status" className="card border-field-800 bg-field-100">Role updated.</p>}
      <ul className="space-y-2">
        {list.map((p) => {
          const r = role.get(p.id) ?? "farmer";
          const isMe = p.id === me.id;
          return (
            <li key={p.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{p.full_name}{isMe ? " (you)" : ""}</p>
                <p className="text-sm">{p.phone || "No phone"}. Joined {new Date(p.created_at).toLocaleDateString("en-GB")}.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-sm font-semibold ${style[r]}`}>{r}</span>
                {!isMe && r !== "officer" && (
                  <form action={setUserRole}>
                    <input type="hidden" name="userId" value={p.id} />
                    <input type="hidden" name="role" value={r === "admin" ? "farmer" : "admin"} />
                    <SubmitButton className="btn-secondary min-h-10 px-3 py-1 text-sm" pendingText="Saving...">{r === "admin" ? "Remove admin" : "Make admin"}</SubmitButton>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
