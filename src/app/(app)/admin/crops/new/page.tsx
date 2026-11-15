import Link from "next/link";
import { requireRolePage } from "@/lib/policy";
import CropForm, { EMPTY_CROP } from "@/components/CropForm";
import { saveCrop } from "../actions";

export default async function NewCropPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRolePage(["admin"]);
  const sp = await searchParams;
  return (
    <div className="space-y-6">
      <Link href="/admin/crops" className="font-semibold text-field-800 underline">Back to crops</Link>
      <h1 className="text-3xl font-bold">Add a crop</h1>
      <CropForm action={saveCrop.bind(null, null)} v={EMPTY_CROP} error={sp.error} />
    </div>
  );
}
