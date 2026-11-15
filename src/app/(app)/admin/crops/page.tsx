import Link from "next/link";
import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCropsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireRolePage(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("crops").select("id, name, scientific_name, crop_group, family, review_status, is_active").order("name");
  const crops = (data ?? []) as { id: string; name: string; scientific_name: string; crop_group: string; family: string; review_status: string; is_active: boolean }[];
  const drafts = crops.filter((c) => c.review_status === "draft").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Crop database</h1>
        <Link href="/admin/crops/new" className="btn-primary">Add a crop</Link>
      </div>
      {sp.saved && <p role="status" className="card border-field-800 bg-field-100">Crop saved.</p>}
      {drafts > 0 && (
        <p className="card border-amber-600 bg-amber-50 text-sm">
          {drafts} of {crops.length} crops are drafts. The seeded values are indicative ranges adapted from FAO ECOCROP and extension guides.
          Have an agronomist check each crop against local data (for example KALRO), correct it, then mark it Reviewed.
        </p>
      )}
      <ul className="space-y-2">
        {crops.map((c) => (
          <li key={c.id} className="card flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link href={`/admin/crops/${c.id}`} className="text-lg font-bold underline-offset-4 hover:underline">{c.name}</Link>
              <p className="text-sm"><span className="italic">{c.scientific_name}</span>. {c.crop_group.replace("_", " ")}, {c.family}.</p>
            </div>
            <div className="flex gap-2 text-sm font-semibold">
              <span className={`rounded px-2 py-0.5 ${c.review_status === "reviewed" ? "bg-green-100 text-green-900" : "bg-stone-200 text-stone-900"}`}>{c.review_status === "reviewed" ? "Reviewed" : "Draft"}</span>
              {!c.is_active && <span className="rounded bg-red-100 px-2 py-0.5 text-red-900">Inactive</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
