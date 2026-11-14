export const COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo",
  "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale",
  "Laikipia", "Lamu", "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a",
  "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta",
  "Tana River", "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
];

// Suggestions only. Phase 5 replaces this with the crop knowledge database.
export const CROP_SUGGESTIONS = [
  "Maize", "Beans", "Sorghum", "Millet", "Groundnuts", "Cowpeas", "Green grams", "Soybeans",
  "Sweet potatoes", "Cassava", "Rice", "Kale (sukuma wiki)", "Tomatoes", "Cabbage", "Onions",
];

export const IRRIGATION_TYPES = [
  { value: "drip", label: "Drip" },
  { value: "sprinkler", label: "Sprinkler" },
  { value: "furrow", label: "Furrow or flood" },
  { value: "manual", label: "Manual (buckets, watering cans)" },
  { value: "other", label: "Other" },
] as const;

export const WATER_SOURCES = [
  { value: "rainfall", label: "Rainfall only" },
  { value: "river_stream", label: "River or stream" },
  { value: "borehole", label: "Borehole" },
  { value: "shallow_well", label: "Shallow well" },
  { value: "dam_pan", label: "Dam or water pan" },
  { value: "piped", label: "Piped water" },
  { value: "roof_harvesting", label: "Roof rainwater harvesting" },
] as const;

export const FERTILIZER_PRACTICES = [
  { value: "none", label: "No fertilizer" },
  { value: "manure", label: "Animal manure" },
  { value: "compost", label: "Compost" },
  { value: "crop_residue", label: "Crop residues left in field" },
  { value: "synthetic", label: "Synthetic fertilizer (for example DAP, CAN, urea)" },
  { value: "lime", label: "Lime" },
] as const;

export const PRIORITIES = [
  { value: "soil_fertility", label: "Improve soil fertility" },
  { value: "water_conservation", label: "Conserve water" },
  { value: "productivity", label: "Increase productivity" },
  { value: "lower_input_costs", label: "Reduce input costs" },
  { value: "drought_risk", label: "Manage drought risk" },
  { value: "long_term_sustainability", label: "Improve long-term sustainability" },
] as const;

type Option = { readonly value: string; readonly label: string };

export function enumValues<T extends readonly Option[]>(list: T) {
  return list.map((o) => o.value) as unknown as [T[number]["value"], ...T[number]["value"][]];
}

export function labelOf(list: readonly Option[], value: string) {
  return list.find((o) => o.value === value)?.label ?? value;
}
