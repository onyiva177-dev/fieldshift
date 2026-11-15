import { z } from "zod";
import { DRAINAGE_OPTIONS, TEXTURE_OPTIONS } from "@/lib/soil-parameters";

const num = (label: string) => z.number({ message: `${label}: enter a number` });
const optNum = z.number().nullable();
const level = z.enum(["low", "medium", "high"]);
const SEASONS = ["long_rains", "short_rains", "year_round"] as const;

export const cropSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_]+$/, "Short name: lowercase letters, numbers and underscores only").min(2).max(40),
  name: z.string().trim().min(2, "Enter the crop name").max(80),
  aliases: z.array(z.string().trim().min(1).max(60)).max(15),
  scientific_name: z.string().trim().min(3, "Enter the scientific name").max(120),
  family: z.string().trim().min(3, "Enter the plant family, for example Poaceae").max(60),
  crop_group: z.enum(["cereal", "legume", "root_tuber", "vegetable"]),
  cycle_days_min: num("Shortest cycle").int().min(20).max(700),
  cycle_days_max: num("Longest cycle").int().min(20).max(700),
  planting_seasons: z.array(z.enum(SEASONS)),
  drought_tolerance: z.enum(["low", "moderate", "high"]),
  n_demand: level, p_demand: level, k_demand: level,
  n_fixation_min: optNum, n_fixation_max: optNum,
  root_type: z.string().trim().min(3).max(40),
  root_depth_cm: z.number().int().min(5).max(600).nullable(),
  shared_risks: z.array(z.string().trim().min(2).max(80)).max(15),
  reference_list: z.array(z.object({ title: z.string().min(2).max(200), url: z.string().url().optional() })).max(10),
  notes: z.string().trim().max(1500),
  review_status: z.enum(["draft", "reviewed"]),
  is_active: z.boolean(),
}).refine((c) => c.cycle_days_max >= c.cycle_days_min, { message: "The longest cycle must not be shorter than the shortest" })
  .refine((c) => c.n_fixation_min === null || c.n_fixation_max === null || c.n_fixation_max >= c.n_fixation_min, { message: "Nitrogen fixation: the maximum must not be below the minimum" });

export const requirementSchema = z.object({
  temp_abs_min: num("Absolute minimum temperature"), temp_opt_min: num("Optimal minimum temperature"),
  temp_opt_max: num("Optimal maximum temperature"), temp_abs_max: num("Absolute maximum temperature"),
  rain_abs_min: num("Absolute minimum rainfall"), rain_opt_min: num("Optimal minimum rainfall"),
  rain_opt_max: num("Optimal maximum rainfall"), rain_abs_max: num("Absolute maximum rainfall"),
  ph_abs_min: num("Absolute minimum pH"), ph_opt_min: num("Optimal minimum pH"),
  ph_opt_max: num("Optimal maximum pH"), ph_abs_max: num("Absolute maximum pH"),
  textures_suitable: z.array(z.enum(TEXTURE_OPTIONS.map((t) => t.value) as [string, ...string[]])),
  textures_marginal: z.array(z.enum(TEXTURE_OPTIONS.map((t) => t.value) as [string, ...string[]])),
  drainage_suitable: z.array(z.enum(DRAINAGE_OPTIONS.map((t) => t.value) as [string, ...string[]])).min(1, "Choose at least one suitable drainage class"),
  depth_min_cm: z.number().int().min(1).max(500).nullable(),
  ec_max_dsm: z.number().min(0).max(50).nullable(),
  region_note: z.string().trim().max(500),
}).superRefine((r, ctx) => {
  const chk = (a: number, b: number, c: number, d: number, what: string) => {
    if (!(a <= b && b <= c && c <= d)) ctx.addIssue({ code: "custom", message: `${what}: order must be absolute minimum, optimal minimum, optimal maximum, absolute maximum` });
  };
  chk(r.temp_abs_min, r.temp_opt_min, r.temp_opt_max, r.temp_abs_max, "Temperature");
  chk(r.rain_abs_min, r.rain_opt_min, r.rain_opt_max, r.rain_abs_max, "Rainfall");
  chk(r.ph_abs_min, r.ph_opt_min, r.ph_opt_max, r.ph_abs_max, "pH");
  if (r.ph_abs_min < 2 || r.ph_abs_max > 11) ctx.addIssue({ code: "custom", message: "pH values must be between 2 and 11" });
});

function toNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const lines = (v: FormDataEntryValue | null) => String(v ?? "").split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);

export function parseCropForm(fd: FormData): { payload?: { crop: Record<string, unknown>; requirement: Record<string, unknown> }; error?: string } {
  const refs = String(fd.get("references") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [title, url] = l.split("|").map((s) => s.trim());
    return url ? { title, url } : { title };
  });
  const crop = cropSchema.safeParse({
    slug: String(fd.get("slug") ?? "").trim(), name: String(fd.get("name") ?? ""),
    aliases: lines(fd.get("aliases")), scientific_name: String(fd.get("scientific_name") ?? ""), family: String(fd.get("family") ?? ""),
    crop_group: String(fd.get("crop_group") ?? ""), cycle_days_min: toNum(fd.get("cycle_days_min")), cycle_days_max: toNum(fd.get("cycle_days_max")),
    planting_seasons: fd.getAll("planting_seasons").map(String), drought_tolerance: String(fd.get("drought_tolerance") ?? ""),
    n_demand: String(fd.get("n_demand") ?? ""), p_demand: String(fd.get("p_demand") ?? ""), k_demand: String(fd.get("k_demand") ?? ""),
    n_fixation_min: toNum(fd.get("n_fixation_min")), n_fixation_max: toNum(fd.get("n_fixation_max")),
    root_type: String(fd.get("root_type") ?? ""), root_depth_cm: toNum(fd.get("root_depth_cm")),
    shared_risks: lines(fd.get("shared_risks")), reference_list: refs, notes: String(fd.get("notes") ?? ""),
    review_status: String(fd.get("review_status") ?? ""), is_active: fd.get("is_active") === "on",
  });
  if (!crop.success) return { error: crop.error.issues[0]?.message ?? "Check the crop details." };

  const keys = ["temp_abs_min", "temp_opt_min", "temp_opt_max", "temp_abs_max", "rain_abs_min", "rain_opt_min", "rain_opt_max", "rain_abs_max", "ph_abs_min", "ph_opt_min", "ph_opt_max", "ph_abs_max"];
  const raw: Record<string, unknown> = Object.fromEntries(keys.map((k) => [k, toNum(fd.get(`r_${k}`))]));
  const req = requirementSchema.safeParse({
    ...raw, textures_suitable: fd.getAll("textures_suitable").map(String), textures_marginal: fd.getAll("textures_marginal").map(String),
    drainage_suitable: fd.getAll("drainage_suitable").map(String), depth_min_cm: toNum(fd.get("r_depth_min_cm")),
    ec_max_dsm: toNum(fd.get("r_ec_max_dsm")), region_note: String(fd.get("r_region_note") ?? ""),
  });
  if (!req.success) return { error: req.error.issues[0]?.message ?? "Check the requirement values." };
  return { payload: { crop: crop.data, requirement: req.data } };
}
