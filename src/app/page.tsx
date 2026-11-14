import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const rotation = [
  { season: "Long rains", crop: "Maize", note: "Takes a lot of nitrogen from the soil" },
  { season: "Short rains", crop: "Common beans", note: "A legume can return nitrogen, if soil and rainfall suit it" },
  { season: "Next long rains", crop: "Sorghum", note: "Copes with drier spells and breaks the maize pest cycle" },
];

const nasa = [
  { name: "NASA POWER", text: "Daily temperature, rainfall, humidity and sunlight for your farm location, going back decades." },
  { name: "SMAP", text: "Satellite soil moisture trends. Coarse resolution, so we show it as a regional signal, not a field reading." },
  { name: "GPM IMERG", text: "Satellite rainfall estimates that show dry and wet spells through the season." },
  { name: "MODIS", text: "Vegetation greenness (NDVI and EVI) to see how crops and land cover change over time." },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <>
      <header className="border-b border-field-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-xl font-extrabold text-field-800">Field Shift</span>
          <nav className="flex items-center gap-2">
            {user ? (
              <Link href="/dashboard" className="btn-primary">Open dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="btn-secondary">Log in</Link>
                <Link href="/register" className="btn-primary">Create account</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 py-12 md:py-16">
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight text-field-900 md:text-5xl">
            Choose what to plant next with satellite data and real soil tests.
          </h1>
          <p className="mt-4 max-w-2xl text-lg">
            Rain is less predictable and soils are wearing out. Field Shift compares your farm's climate history from
            NASA with soil results from agricultural officers, then ranks crop rotations and explains why.
          </p>

          <ol className="mt-10 grid gap-3 md:grid-cols-3" aria-label="Example of a three-season rotation">
            {rotation.map((r, i) => (
              <li key={r.crop} className="card border-l-4 border-l-maize-400">
                <p className="text-sm font-semibold text-maize-700">Season {i + 1}: {r.season}</p>
                <p className="mt-1 text-2xl font-bold">{r.crop}</p>
                <p className="mt-1 text-sm">{r.note}</p>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-sm text-stone-700">
            An example of the idea only. Your recommendations depend on your own soil, rainfall and crop history.
          </p>
        </section>

        <section className="bg-white py-12">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold">Climate evidence from NASA</h2>
            <p className="mt-2 max-w-2xl">
              Every value shows its source, the period it covers and its resolution. Satellite estimates are never
              presented as laboratory measurements.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {nasa.map((d) => (
                <div key={d.name} className="card">
                  <h3 className="text-lg font-bold">{d.name}</h3>
                  <p className="mt-1">{d.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-2xl font-bold">Soil results you can trust</h2>
          <p className="mt-2 max-w-2xl">
            Agricultural officers and soil technicians record pH, nutrients, organic carbon and texture at sampling
            points across a farm. A reviewer verifies each result before it influences a recommendation. Missing
            tests stay blank, and the platform tells you which test would improve your advice.
          </p>
        </section>

        <section className="bg-field-800 py-12 text-white">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold">How it works</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>Register your farm and pin its location on the map.</li>
              <li>Officers add verified soil tests for your fields.</li>
              <li>Field Shift combines NASA climate data, soil results, crop history and your priorities.</li>
              <li>You get ranked rotations with a score breakdown, risks and the data behind each one.</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register" className="btn bg-maize-400 text-ink hover:bg-maize-500">Create an account</Link>
              <Link href="/login" className="btn border border-white text-white hover:bg-field-900">Log in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-4 py-6 text-center text-sm text-stone-700">
        Built for the 2026 NASA Space Apps Challenge: Field Shift, Adapting Farms with NASA Data.
      </footer>
    </>
  );
}
