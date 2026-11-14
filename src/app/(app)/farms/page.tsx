import Link from "next/link";
import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";

export default async function FarmsPage() {
  const user = await requireRolePage(["farmer"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("farms")
    .select("id, name, county, sub_county, village, size_ha")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  const farms = (data ?? []) as {
    id: string; name: string; county: string; sub_county: string | null; village: string | null; size_ha: number;
  }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">My farms</h1>
        <Link href="/farms/new" className="btn-primary">Register a farm</Link>
      </div>

      {farms.length === 0 ? (
        <p className="card">You have not registered a farm yet. Register one to start planning rotations.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {farms.map((f) => (
            <li key={f.id} className="card">
              <h2 className="text-xl font-bold">
                <Link href={`/farms/${f.id}`} className="underline-offset-4 hover:underline">{f.name}</Link>
              </h2>
              <p>{[f.village, f.sub_county, f.county].filter(Boolean).join(", ")}</p>
              <p className="text-sm">{Number(f.size_ha)} ha</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
