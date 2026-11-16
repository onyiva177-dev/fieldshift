import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";
import { markAllRead, openNotification } from "./actions";

type N = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export default async function NotificationsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(50);
  const list = (data ?? []) as N[];
  const unread = list.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Notifications</h1>
        {unread > 0 && <form action={markAllRead}><SubmitButton className="btn-secondary" pendingText="Marking...">Mark all as read</SubmitButton></form>}
      </div>
      {list.length === 0 ? (
        <p className="card">No notifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id} className={`card ${n.read_at ? "" : "border-field-800 bg-field-100"}`}>
              <p className="font-bold">{n.title}{!n.read_at && <span className="ml-2 rounded bg-field-800 px-2 py-0.5 text-xs font-semibold text-white">New</span>}</p>
              {n.body && <p className="text-sm">{n.body}</p>}
              <p className="text-xs">{new Date(n.created_at).toLocaleString("en-GB")}</p>
              <form action={openNotification} className="mt-2">
                <input type="hidden" name="id" value={n.id} />
                <SubmitButton className="btn-secondary min-h-10 px-3 py-1 text-sm" pendingText="Opening...">{n.link ? "Open" : "Mark as read"}</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
