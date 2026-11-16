import Link from "next/link";
import type { FarmSnapshot } from "@/lib/dashboard";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ratingStyle: Record<string, string> = { low: "bg-orange-100 text-orange-900", medium: "bg-amber-100 text-amber-900", high: "bg-green-100 text-green-900" };
const label: Record<string, string> = { nitrogen: "Nitrogen", phosphorus: "Phosphorus", potassium: "Potassium", organicCarbon: "Organic carbon" };

export default function FarmSnapshotCard({ s }: { s: FarmSnapshot }) {
  const { farm, soil, crops, climate, rec, nextPlanned } = s;
  const sum = soil.summary;
  return (
    <article className="card space-y-4">
      <header>
        <h3 className="text-xl font-bold"><Link href={`/farms/${farm.id}`} className="underline-offset-4 hover:underline">{farm.name}</Link></h3>
        <p className="text-sm">{farm.county}. {Number(farm.size_ha)} ha.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h4 className="font-bold">Crops</h4>
          <p className="text-sm">Current: {crops.current.length ? crops.current.join(", ") : "none recorded"}.</p>
          <p className="text-sm">Previous: {crops.last ?? "none recorded"}.</p>
          {nextPlanned && <p className="text-sm">Next in your plan: <span className="font-semibold">{nextPlanned.crop}</span>, {nextPlanned.label}.</p>}
        </section>

        <section>
          <h4 className="font-bold">Environment (NASA)</h4>
          {climate.rain12 === null && climate.temp12 === null ? (
            <p className="text-sm">No NASA data yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {climate.rain12 !== null && <li>Rainfall, last 12 months: about {Math.round(climate.rain12)} mm ({climate.source}).</li>}
              {climate.rainPct3 !== null && <li>Last 3 months: about {Math.round(climate.rainPct3)}% of normal.</li>}
              {climate.temp12 !== null && <li>Average temperature: {Math.round(climate.temp12 * 10) / 10} °C (model).</li>}
            </ul>
          )}
        </section>

        <section>
          <h4 className="font-bold">Soil health (verified tests)</h4>
          {!sum ? (
            <p className="text-sm">No verified soil test yet.{soil.counts.pending > 0 ? ` ${soil.counts.pending} waiting for verification.` : ""}</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p>Latest test: {soil.latestVerifiedOn ? new Date(soil.latestVerifiedOn).toLocaleDateString("en-GB") : "unknown"}. {soil.counts.verified} verified.</p>
              <p>
                {sum.ph !== undefined ? `pH ${Math.round(sum.ph * 10) / 10}. ` : ""}
                {sum.texture ? `Texture: ${sum.texture.replace(/_/g, " ")}.` : ""}
              </p>
              <ul className="flex flex-wrap gap-2">
                {Object.entries(sum.ratings).map(([k, v]) => (
                  <li key={k} className={`rounded px-2 py-0.5 font-semibold ${ratingStyle[v]}`}>{label[k] ?? k}: {v}</li>
                ))}
              </ul>
              {sum.missing.length > 0 && <p>Not yet measured: {sum.missing.join(", ")}.</p>}
            </div>
          )}
        </section>

        <section>
          <h4 className="font-bold">Recommended rotation</h4>
          {rec ? (
            <div className="text-sm">
              <p>For {MONTHS[rec.plantingMonth - 1]}: {rec.top.map((t) => t.name).join(", ") || "no suitable crop"}.</p>
              <p>Confidence {rec.level}. Saved {new Date(rec.createdAt).toLocaleDateString("en-GB")}.</p>
            </div>
          ) : (
            <p className="text-sm">No saved recommendation yet.</p>
          )}
        </section>
      </div>

      <footer className="flex flex-wrap gap-2">
        <Link href={`/farms/${farm.id}/recommendations`} className="btn-primary min-h-10 px-3 py-1 text-sm">Recommendations</Link>
        <Link href={`/farms/${farm.id}/planner`} className="btn-secondary min-h-10 px-3 py-1 text-sm">Rotation planner</Link>
        <Link href={`/farms/${farm.id}/environment`} className="btn-secondary min-h-10 px-3 py-1 text-sm">NASA data</Link>
      </footer>
    </article>
  );
}
