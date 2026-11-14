import Link from "next/link";
import { requireRolePage } from "@/lib/policy";
import FarmForm from "@/components/FarmForm";
import { createFarm } from "../actions";

export default async function NewFarmPage() {
  await requireRolePage(["farmer"]);
  return (
    <div className="space-y-6">
      <Link href="/farms" className="font-semibold text-field-800 underline">Back to my farms</Link>
      <h1 className="text-3xl font-bold">Register a farm</h1>
      <FarmForm action={createFarm} submitLabel="Register farm" />
    </div>
  );
}
