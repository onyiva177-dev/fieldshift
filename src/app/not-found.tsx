import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-3">This page does not exist, or you do not have access to it.</p>
      <Link href="/dashboard" className="btn-primary mt-6">Go to dashboard</Link>
    </main>
  );
}
