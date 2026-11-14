import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";

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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xl font-extrabold text-field-800">Field Shift</Link>
            <nav className="flex gap-3 font-semibold">
              <Link href="/dashboard" className="underline-offset-4 hover:underline">Dashboard</Link>
              {user.role === "farmer" && (
                <Link href="/farms" className="underline-offset-4 hover:underline">My farms</Link>
              )}
              {user.role === "admin" && (
                <Link href="/admin" className="underline-offset-4 hover:underline">Administration</Link>
              )}
            </nav>
          </div>
          <form action={logout} className="flex items-center gap-3">
            <span className="hidden text-sm sm:inline">{user.name}</span>
            <button type="submit" className="btn-secondary min-h-10 px-3 py-1 text-sm">Log out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}
