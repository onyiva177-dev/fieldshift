import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

const link = "inline-flex min-h-11 items-center underline-offset-4 hover:underline";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  async function logout() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <>
      <header className="border-b border-field-200 bg-white">
        <div className="mx-auto max-w-5xl space-y-1 px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <Link href="/dashboard" className="text-xl font-extrabold text-field-800">Field Shift</Link>
            <form action={logout} className="flex items-center gap-3">
              <span className="hidden max-w-[12rem] truncate text-sm sm:inline">{user.name}</span>
              <SubmitButton className="btn-secondary min-h-10 px-3 py-1 text-sm" pendingText="Signing out...">Log out</SubmitButton>
            </form>
          </div>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 font-semibold">
            <Link href="/dashboard" className={link}>Dashboard</Link>
            {user.role === "farmer" && <Link href="/farms" className={link}>My farms</Link>}
            {user.role === "officer" && <Link href="/officer" className={link}>My farms</Link>}
            <Link href="/nasa" className={link}>NASA data</Link>
            <Link href="/notifications" className={link}>Notifications</Link>
            {user.role === "admin" && (
              <details className="relative">
                <summary className={`${link} cursor-pointer list-none`}>Admin tools</summary>
                <div className="absolute left-0 z-20 mt-1 w-56 rounded-md border border-field-200 bg-white p-2 shadow-lg">
                  {[
                    ["/admin/users", "Users"], ["/admin", "Officers"], ["/admin/farms", "Assignments"], ["/admin/soil", "Soil reviews"],
                    ["/admin/data", "Data sync"], ["/admin/crops", "Crops"], ["/admin/engine", "Engine"],
                  ].map(([href, label]) => <Link key={href} href={href} className={`${link} w-full px-2`}>{label}</Link>)}
                </div>
              </details>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
