import SubmitButton from "@/components/SubmitButton";
import { DRAINAGE_OPTIONS, TEXTURE_OPTIONS } from "@/lib/soil-parameters";

export interface CropFormValues {
  slug: string; name: string; aliases: string; scientific_name: string; family: string; crop_group: string;
  cycle_days_min: string; cycle_days_max: string; planting_seasons: string[]; drought_tolerance: string;
  n_demand: string; p_demand: string; k_demand: string; n_fixation_min: string; n_fixation_max: string;
  root_type: string; root_depth_cm: string; shared_risks: string; references: string; notes: string;
  review_status: string; is_active: boolean;
  r: Record<string, string>; textures_suitable: string[]; textures_marginal: string[]; drainage_suitable: string[];
}

export const EMPTY_CROP: CropFormValues = {
  slug: "", name: "", aliases: "", scientific_name: "", family: "", crop_group: "cereal", cycle_days_min: "", cycle_days_max: "",
  planting_seasons: ["long_rains"], drought_tolerance: "moderate", n_demand: "medium", p_demand: "medium", k_demand: "medium",
  n_fixation_min: "", n_fixation_max: "", root_type: "fibrous", root_depth_cm: "", shared_risks: "", references: "", notes: "",
  review_status: "draft", is_active: true, r: {}, textures_suitable: [], textures_marginal: [], drainage_suitable: ["well"],
};

const REQ: [string, string][] = [
  ["temp_abs_min", "Absolute minimum temperature (C)"], ["temp_opt_min", "Optimal minimum temperature (C)"],
  ["temp_opt_max", "Optimal maximum temperature (C)"], ["temp_abs_max", "Absolute maximum temperature (C)"],
  ["rain_abs_min", "Absolute minimum rainfall (mm per cycle)"], ["rain_opt_min", "Optimal minimum rainfall (mm)"],
  ["rain_opt_max", "Optimal maximum rainfall (mm)"], ["rain_abs_max", "Absolute maximum rainfall (mm)"],
  ["ph_abs_min", "Absolute minimum pH"], ["ph_opt_min", "Optimal minimum pH"],
  ["ph_opt_max", "Optimal maximum pH"], ["ph_abs_max", "Absolute maximum pH"],
];

function Num({ name, label, v, step = "any" }: { name: string; label: string; v?: string; step?: string }) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} inputMode="decimal" step={step} defaultValue={v} className="input" />
    </div>
  );
}

function Checks({ legend, name, options, selected }: { legend: string; name: string; options: readonly { value: string; label: string }[]; selected: string[] }) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="grid gap-1 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} className="h-5 w-5" /> {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const LEVELS = [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }];

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <select id={name} name={name} defaultValue={value} className="input">{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </div>
  );
}

export default function CropForm({ action, v, error }: { action: (fd: FormData) => Promise<void>; v: CropFormValues; error?: string }) {
  return (
    <form action={action} className="space-y-8">
      <section className="card space-y-4">
        <h2 className="text-xl font-bold">Crop</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="name" className="label">Name</label><input id="name" name="name" required defaultValue={v.name} className="input" /></div>
          <div><label htmlFor="slug" className="label">Short name (letters, numbers, underscore)</label><input id="slug" name="slug" required defaultValue={v.slug} className="input" /></div>
          <div><label htmlFor="scientific_name" className="label">Scientific name</label><input id="scientific_name" name="scientific_name" required defaultValue={v.scientific_name} className="input" /></div>
          <div><label htmlFor="family" className="label">Plant family (for rotation rules)</label><input id="family" name="family" required defaultValue={v.family} className="input" /></div>
          <Select name="crop_group" label="Group" value={v.crop_group} options={[{ value: "cereal", label: "Cereal" }, { value: "legume", label: "Legume" }, { value: "root_tuber", label: "Root or tuber" }, { value: "vegetable", label: "Vegetable" }]} />
          <div><label htmlFor="aliases" className="label">Other names (comma separated)</label><input id="aliases" name="aliases" defaultValue={v.aliases} className="input" /></div>
          <Num name="cycle_days_min" label="Shortest growing cycle (days)" v={v.cycle_days_min} step="1" />
          <Num name="cycle_days_max" label="Longest growing cycle (days)" v={v.cycle_days_max} step="1" />
        </div>
        <Checks legend="Planting seasons" name="planting_seasons" options={[{ value: "long_rains", label: "Long rains" }, { value: "short_rains", label: "Short rains" }, { value: "year_round", label: "Year round (irrigated)" }]} selected={v.planting_seasons} />
        <div className="grid gap-4 sm:grid-cols-4">
          <Select name="drought_tolerance" label="Drought tolerance" value={v.drought_tolerance} options={[{ value: "low", label: "Low" }, { value: "moderate", label: "Moderate" }, { value: "high", label: "High" }]} />
          <Select name="n_demand" label="Nitrogen demand" value={v.n_demand} options={LEVELS} />
          <Select name="p_demand" label="Phosphorus demand" value={v.p_demand} options={LEVELS} />
          <Select name="k_demand" label="Potassium demand" value={v.k_demand} options={LEVELS} />
          <Num name="n_fixation_min" label="Nitrogen fixation, minimum (kg N/ha)" v={v.n_fixation_min} />
          <Num name="n_fixation_max" label="Nitrogen fixation, maximum (kg N/ha)" v={v.n_fixation_max} />
          <div><label htmlFor="root_type" className="label">Root type</label><input id="root_type" name="root_type" defaultValue={v.root_type} className="input" /></div>
          <Num name="root_depth_cm" label="Root depth (cm)" v={v.root_depth_cm} step="1" />
        </div>
        <div>
          <label htmlFor="shared_risks" className="label">Shared pests and diseases (one per line). Use identical wording across crops that share a risk.</label>
          <textarea id="shared_risks" name="shared_risks" rows={4} defaultValue={v.shared_risks} className="input" />
        </div>
        <div>
          <label htmlFor="references" className="label">Reliable references (one per line: Title | https://link)</label>
          <textarea id="references" name="references" rows={3} defaultValue={v.references} className="input" />
        </div>
        <div><label htmlFor="notes" className="label">Notes shown to farmers</label><textarea id="notes" name="notes" rows={3} maxLength={1500} defaultValue={v.notes} className="input" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select name="review_status" label="Review status" value={v.review_status} options={[{ value: "draft", label: "Draft: awaiting expert review" }, { value: "reviewed", label: "Reviewed by an agronomist" }]} />
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={v.is_active} className="h-5 w-5" /> Active (used in recommendations)</label>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-bold">Requirements (default region)</h2>
        <p className="text-sm">Temperature is the mean over the growing cycle. Rainfall is the total over the whole cycle. Set order: absolute minimum, optimal minimum, optimal maximum, absolute maximum.</p>
        <div className="grid gap-4 sm:grid-cols-4">{REQ.map(([k, label]) => <Num key={k} name={`r_${k}`} label={label} v={v.r[k]} />)}</div>
        <Checks legend="Suitable soil textures" name="textures_suitable" options={TEXTURE_OPTIONS} selected={v.textures_suitable} />
        <Checks legend="Marginal soil textures" name="textures_marginal" options={TEXTURE_OPTIONS} selected={v.textures_marginal} />
        <Checks legend="Suitable drainage" name="drainage_suitable" options={DRAINAGE_OPTIONS} selected={v.drainage_suitable} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Num name="r_depth_min_cm" label="Minimum soil depth (cm)" v={v.r.depth_min_cm} step="1" />
          <Num name="r_ec_max_dsm" label="Maximum salinity (dS/m)" v={v.r.ec_max_dsm} />
          <div><label htmlFor="r_region_note" className="label">Note shown as a risk</label><input id="r_region_note" name="r_region_note" defaultValue={v.r.region_note} className="input" /></div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{error}</p>}
      <SubmitButton pendingText="Saving...">Save crop</SubmitButton>
    </form>
  );
}
