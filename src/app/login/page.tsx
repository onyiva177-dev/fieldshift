import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";

async function login(formData: FormData) {
  "use server";
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) redirect("/login?error=1");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(error.code === "email_not_confirmed" ? "/login?error=confirm" : "/login?error=1");
  redirect("/dashboard");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Link href="/" className="text-lg font-extrabold text-field-800">Field Shift</Link>
      <h1 className="mt-6 text-3xl font-bold">Log in</h1>
      {sp.registered && (
        <p role="status" className="mt-4 rounded-md bg-field-100 p-3">Account created. Log in to continue.</p>
      )}
      {sp.error === "confirm" && (
        <p role="alert" className="mt-4 rounded-md border border-amber-700 bg-amber-50 p-3 text-amber-900">
          Confirm your email first. Open the message we sent and select the link.
        </p>
      )}
      {sp.error === "1" && (
        <p role="alert" className="mt-4 rounded-md border border-red-700 bg-red-50 p-3 text-red-900">
          Email or password is incorrect.
        </p>
      )}
      <form action={login} className="card mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <button type="submit" className="btn-primary w-full">Log in</button>
      </form>
      <p className="mt-4">
        New here? <Link href="/register" className="font-semibold text-field-800 underline">Create an account</Link>
      </p>
    </main>
  );
}
