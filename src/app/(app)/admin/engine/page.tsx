import { requireRolePage } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";
import { COMPONENTS, DEFAULT_WEIGHTS } from "@/lib/engine/types";
import { addRule, deleteRule, saveWeights } from "./actions";

type Rule = { id: string; from_kind: string; from_value: string; to_kind: string; to_value: string; effect: string; score: number; reason: string };
const effectStyle: Record<string, string> = { beneficial: "bg-green-100 text-green-900", neutral: "bg-stone-200 text-stone-900", caution: "bg-amber-100 text-amber-900", avoid: "bg-red-100 text-red-900" };

export default async function AdminEnginePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireRolePage(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: cfg }, { data: rulesData }, { data: crops }] = await Promise.all([
    supabase.from("scoring_config").select("weights").eq("id", "default").maybeSingle(),
    supabase.from("crop_rotation_rules").select("*").order("from_kind").order("from_value"),
    supabase.from("crops").select("slug, family, crop_group"),
  ]);
  const weights = { ...DEFAULT_WEIGHTS, ...(cfg?.weights ?? {}) } as Record<string, number>;
  const rules = (rulesData ?? []) as Rule[];
  const cropRows = (crops ?? []) as { slug: string; family: string; crop_group: string }[];
  const families = Array.from(new Set(cropRows.map((c) => c.family)));
  const groups = Array.from(new Set(cropRows.map((c) => c.crop_group)));

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Recommendation engine settings</h1>
      {sp.error && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{sp.error}</p>}
      {sp.saved && <p role="status" className="card border-field-800 bg-field-100">Saved.</p>}

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Default weights</h2>
        <p className="text-sm">How much each factor counts in a crop's total score. Numbers are relative, so they do not need to add up to 100. Farmers can adjust them for a single run.</p>
        <form action={saveWeights} className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {COMPONENTS.map((c) => (
              <div key={c.key}>
                <label htmlFor={`w_${c.key}`} className="label">{c.label}</label>
                <input id={`w_${c.key}`} name={`w_${c.key}`} type="number" min={0} max={100} defaultValue={weights[c.key]} className="input" />
                <p className="text-xs">{c.help}</p>
              </div>
            ))}
          </div>
          <SubmitButton pendingText="Saving...">Save weights</SubmitButton>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Rotation rules ({rules.length})</h2>
        <p className="text-sm">Rules say how well one crop follows another. The most specific rule wins: a rule about two crops beats one about two families, which beats one about two groups. Without a rule the pair counts as neutral (60).</p>
        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.id} className="card space-y-1">
              <p className="font-semibold">{r.from_kind} {r.from_value} then {r.to_kind} {r.to_value}{" "}
                <span className={`rounded px-2 py-0.5 text-sm ${effectStyle[r.effect]}`}>{r.effect}, score {r.score}</span></p>
              <p className="text-sm">{r.reason}</p>
              <form action={deleteRule}><input type="hidden" name="id" value={r.id} /><SubmitButton className="btn-secondary min-h-10 px-3 py-1 text-sm" pendingText="Deleting...">Delete rule</SubmitButton></form>
            </li>
          ))}
        </ul>

        <form action={addRule} className="card space-y-3">
          <h3 className="text-lg font-bold">Add a rule</h3>
          <datalist id="values">
            {cropRows.map((c) => <option key={c.slug} value={c.slug} />)}
            {families.map((f) => <option key={f} value={f} />)}
            {groups.map((g) => <option key={g} value={g} />)}
          </datalist>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex gap-2">
              <div><label htmlFor="from_kind" className="label">After (type)</label><select id="from_kind" name="from_kind" className="input"><option>group</option><option>family</option><option>crop</option></select></div>
              <div className="flex-1"><label htmlFor="from_value" className="label">After (value)</label><input id="from_value" name="from_value" list="values" required className="input" /></div>
            </div>
            <div className="flex gap-2">
              <div><label htmlFor="to_kind" className="label">Then (type)</label><select id="to_kind" name="to_kind" className="input"><option>group</option><option>family</option><option>crop</option></select></div>
              <div className="flex-1"><label htmlFor="to_value" className="label">Then (value)</label><input id="to_value" name="to_value" list="values" required className="input" /></div>
            </div>
            <div><label htmlFor="effect" className="label">Effect</label><select id="effect" name="effect" className="input"><option>beneficial</option><option>neutral</option><option>caution</option><option>avoid</option></select></div>
            <div><label htmlFor="score" className="label">Score (0 to 100)</label><input id="score" name="score" type="number" min={0} max={100} required className="input" /></div>
          </div>
          <div><label htmlFor="reason" className="label">Reason shown to farmers</label><textarea id="reason" name="reason" rows={2} maxLength={500} required className="input" /></div>
          <SubmitButton pendingText="Adding...">Add rule</SubmitButton>
        </form>
      </section>
    </div>
  );
}
