import Link from "next/link";
import { requireUser } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { KIND_EXPLAIN, KIND_LABEL, type ObsKind } from "@/lib/nasa/catalog";

const DATASETS = [
  { name: "NASA POWER", text: "Daily weather for any location: temperature, rainfall, humidity, sunlight and modelled soil wetness, from 2001. Resolution about 55 km (weather) and 110 km (sunlight).", kind: "model_derived" as ObsKind },
  { name: "GPM IMERG", text: "Satellite rainfall estimates at about 10 km, from mid-2000. The final version arrives about 4 months after each month ends.", kind: "satellite_estimate" as ObsKind },
  { name: "SMAP", text: "Satellite soil moisture for the top 5 cm of soil at about 9 km, from 2015. A regional signal, not a field measurement.", kind: "satellite_estimate" as ObsKind },
  { name: "MODIS", text: "Vegetation greenness (NDVI and EVI) at 250 m in 16-day composites, from 2001.", kind: "satellite_observed" as ObsKind },
];

export default async function NasaPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("farms").select("id, name, county").order("name").limit(100);
  const farms = (data ?? []) as { id: string; name: string; county: string }[];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">NASA Earth observation data</h1>
      <p>Pick a farm to see its rainfall, temperature, soil moisture and vegetation trends, with the source of every value.</p>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Farms</h2>
        {farms.length === 0 ? (
          <p className="card">No farms to show yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {farms.map((f) => (
              <li key={f.id} className="card">
                <Link href={`/farms/${f.id}/environment`} className="text-lg font-bold underline-offset-4 hover:underline">{f.name}</Link>
                <p className="text-sm">{f.county}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Datasets used</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {DATASETS.map((d) => (
            <li key={d.name} className="card">
              <p className="text-lg font-bold">{d.name}</p>
              <p className="text-sm">{d.text}</p>
              <p className="mt-1 text-sm"><span className="font-semibold">{KIND_LABEL[d.kind]}:</span> {KIND_EXPLAIN[d.kind]}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
