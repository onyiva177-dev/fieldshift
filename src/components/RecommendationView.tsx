import type { ComponentKey, CropResult, RunResult } from "@/lib/engine/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const levelStyle = { high: "bg-green-100 text-green-900", medium: "bg-amber-100 text-amber-900", low: "bg-orange-100 text-orange-900" };

function Bar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-sm">No data</span>;
  const color = score >= 75 ? "bg-field-700" : score >= 50 ? "bg-maize-500" : "bg-orange-700";
  return (
    <span className="flex items-center gap-2">
      <span className="h-3 w-24 overflow-hidden rounded bg-stone-200 sm:w-32" aria-hidden="true">
        <span className={`block h-3 ${color}`} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
      </span>
      <span className="w-10 text-sm font-semibold">{Math.round(score)}</span>
    </span>
  );
}

function Items({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="font-bold">{title}</h4>
      <ul className={`mt-1 list-disc space-y-1 pl-5 text-sm ${tone === "warn" ? "text-orange-950" : ""}`}>
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}

const notesOf = (c: CropResult, key: ComponentKey) => c.components.find((x) => x.key === key)?.notes.map((n) => n.text) ?? [];

function CropCard({ c, rank }: { c: CropResult; rank: number }) {
  const [needLo, needHi] = c.water.needMm;
  return (
    <details open={rank === 1} className="card">
      <summary className="cursor-pointer">
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-lg font-bold">{rank}. {c.name}</span>
          <span className="rounded bg-field-100 px-2 py-0.5 text-sm font-semibold">Score {c.total} of 100</span>
          {c.reviewStatus === "draft" && <span className="rounded bg-stone-200 px-2 py-0.5 text-xs font-semibold">Draft crop data</span>}
        </span>
        <span className="block text-sm italic">{c.scientificName}</span>
      </summary>

      <div className="mt-4 space-y-5">
        <Items title="Why it is recommended" items={c.why} />

        <div>
          <h4 className="font-bold">Score breakdown</h4>
          <p className="text-sm">Each factor is scored 0 to 100. "Weight used" is how much it counts in the total, after leaving out factors with no data.</p>
          <ul className="mt-2 space-y-2">
            {c.components.map((k) => (
              <li key={k.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="text-sm">{k.label}</span>
                <span className="flex items-center gap-3">
                  <Bar score={k.score} />
                  <span className="w-20 text-right text-xs">{k.score === null ? "not counted" : `weight ${k.weightUsed}%`}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Items title="Expected soil health benefits" items={c.benefits} />

        <div>
          <h4 className="font-bold">Water requirements</h4>
          <p className="mt-1 text-sm">
            Needs about {needLo} to {needHi} mm over the season.{" "}
            {c.water.expectedMm === null ? "No NASA rainfall average is available yet for this farm." : `This farm's NASA average for the season is about ${c.water.expectedMm} mm.`}{" "}
            {c.water.irrigationCover > 0 ? `Your irrigation could cover about ${Math.round(c.water.irrigationCover * 100)}% of a shortfall.` : "No irrigation is recorded."}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{notesOf(c, "water").map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>

        <Items title="Climate suitability" items={notesOf(c, "climate")} />
        <Items title="Soil suitability" items={notesOf(c, "soil")} />
        <Items title="Nutrient considerations" items={notesOf(c, "nutrients")} />
        <Items title="Relationship to the previous crop" items={notesOf(c, "rotation")} />
        <Items title="Your priorities" items={notesOf(c, "priorities")} />
        <Items title="Possible limitations" items={c.limitations} tone="warn" />
        <Items title="Potential risks" items={c.risks} tone="warn" />
        <Items title="Data sources used" items={c.sources} />
      </div>
    </details>
  );
}

export default function RecommendationView({ result }: { result: RunResult }) {
  const { confidence: conf, soil } = result;
  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold">Confidence</h2>
          <span className={`rounded px-3 py-1 font-bold ${levelStyle[conf.level]}`}>{conf.level.toUpperCase()} ({conf.score} of 100)</span>
        </div>
        <p className="text-sm">Confidence reflects how much good data stands behind the ranking, not how good the crops are.</p>
        <Items title="Why" items={conf.reasons} />
        <Items title="To improve confidence" items={conf.improve} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Ranked crops for planting in {MONTHS[result.plantingMonth - 1]}</h2>
        {result.ranked.length === 0 ? (
          <p className="card">No crop in the database fits this farm's conditions at this planting month. See the list below for why.</p>
        ) : (
          <div className="space-y-3">{result.ranked.map((c, i) => <CropCard key={c.cropId} c={c} rank={i + 1} />)}</div>
        )}
      </section>

      {result.notSuitable.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Not suitable at this planting month</h2>
          <ul className="space-y-2">
            {result.notSuitable.map((c) => (
              <li key={c.cropId} className="card">
                <p className="font-bold">{c.name}</p>
                <ul className="mt-1 list-disc pl-5 text-sm">{c.limiting.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">What this is based on</h2>
        <Items title="Data used" items={result.dataSources} />
        <Items
          title="Soil data on record"
          items={[
            soil.sampleCount ? `${soil.sampleCount} verified sample(s) at ${soil.pointCount} point(s), latest ${soil.latestSampledOn}.` : "No verified soil tests.",
            soil.present.length ? `Measured: ${soil.present.join(", ")}.` : "",
            soil.missing.length ? `Missing: ${soil.missing.join(", ")}.` : "",
          ].filter(Boolean)}
        />
        <Items title="Previous crops used" items={result.previousCrops.length ? result.previousCrops.slice(0, 3).map((p) => (p.matched ? `${p.name}` : `${p.name} (not in the crop database, so no rotation rule was applied)`)) : ["None recorded."]} />
        <Items title="Please note" items={result.caveats} tone="warn" />
      </section>
    </div>
  );
}
