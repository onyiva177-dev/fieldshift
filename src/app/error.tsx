"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] page error", error.digest ?? "", error.message);
  }, [error]);
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="mt-3">We could not load this page. Your data is safe. Try again, or go back to your dashboard.</p>
      {error.digest && <p className="mt-2 text-xs">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/dashboard" className="btn-secondary">Dashboard</Link>
      </div>
    </main>
  );
}
