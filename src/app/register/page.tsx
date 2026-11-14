"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerSchema } from "@/lib/validation";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<"farmer" | "officer">("farmer");
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");

    const parsed = registerSchema.safeParse({
      name: get("name"),
      email: get("email"),
      phone: get("phone"),
      password: get("password"),
      role,
      officer:
        role === "officer"
          ? {
              organization: get("organization"),
              professionalRole: get("professionalRole"),
              county: get("county"),
              subCounty: get("subCounty"),
            }
          : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    const v = parsed.data;

    setBusy(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: v.name,
          phone: v.phone,
          role: v.role,
          organization: v.officer?.organization,
          professional_role: v.officer?.professionalRole,
          county: v.officer?.county,
          sub_county: v.officer?.subCounty,
        },
      },
    });

    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    // Supabase returns no error for an email that already exists, but the identities list is empty.
    if (data.user && data.user.identities?.length === 0) {
      setError("An account with this email already exists. Log in instead.");
      setBusy(false);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setCheckEmail(true);
    setBusy(false);
  }

  if (checkEmail) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <Link href="/" className="text-lg font-extrabold text-field-800">Field Shift</Link>
        <h1 className="mt-6 text-3xl font-bold">Check your email</h1>
        <p className="mt-3">
          We sent a confirmation link. Open it to activate your account, then{" "}
          <Link href="/login" className="font-semibold text-field-800 underline">log in</Link>.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Link href="/" className="text-lg font-extrabold text-field-800">Field Shift</Link>
      <h1 className="mt-6 text-3xl font-bold">Create an account</h1>

      <form onSubmit={onSubmit} className="card mt-6 space-y-4">
        <fieldset>
          <legend className="label">I am a</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["farmer", "officer"] as const).map((r) => (
              <label
                key={r}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 py-2 font-semibold ${
                  role === r ? "border-field-800 bg-field-800 text-white" : "border-stone-400 bg-white"
                }`}
              >
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                {r === "farmer" ? "Farmer" : "Agricultural officer"}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" name="name" autoComplete="name" required className="input" />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label htmlFor="phone" className="label">Phone number</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password (at least 10 characters)</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" />
        </div>

        {role === "officer" && (
          <div className="space-y-4 rounded-md bg-field-50 p-3">
            <p className="text-sm">Officer accounts are checked by an administrator before you can submit soil data.</p>
            <div>
              <label htmlFor="organization" className="label">Organization</label>
              <input id="organization" name="organization" required className="input" />
            </div>
            <div>
              <label htmlFor="professionalRole" className="label">Professional role</label>
              <input id="professionalRole" name="professionalRole" placeholder="e.g. Extension officer" required className="input" />
            </div>
            <div>
              <label htmlFor="county" className="label">Assigned county</label>
              <input id="county" name="county" required className="input" />
            </div>
            <div>
              <label htmlFor="subCounty" className="label">Assigned sub-county (optional)</label>
              <input id="subCounty" name="subCounty" className="input" />
            </div>
          </div>
        )}

        {error && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
          {busy ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="mt-4">
        Already registered? <Link href="/login" className="font-semibold text-field-800 underline">Log in</Link>
      </p>
    </main>
  );
}
