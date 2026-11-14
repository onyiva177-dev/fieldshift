import { z } from "zod";
import { FERTILIZER_PRACTICES, IRRIGATION_TYPES, PRIORITIES, WATER_SOURCES, enumValues } from "@/lib/farm-options";

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const polygonSchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(position).min(4, "A boundary needs at least 3 corner points").max(501)).length(1),
  })
  .refine((p) => {
    const r = p.coordinates[0];
    return r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  }, "The boundary outline must be closed");

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

export const farmSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a farm name").max(120),
    county: z.string().trim().min(2, "Enter the county").max(80),
    subCounty: optionalText(80),
    village: optionalText(80),
    lat: z.number({ message: "Enter a valid latitude" }).min(-90).max(90),
    lng: z.number({ message: "Enter a valid longitude" }).min(-180).max(180),
    sizeHa: z.number({ message: "Enter the farm size in hectares" }).positive("Farm size must be more than zero").max(100000),
    irrigationAvailable: z.boolean(),
    irrigationType: z.enum(enumValues(IRRIGATION_TYPES)).optional(),
    waterSources: z.array(z.enum(enumValues(WATER_SOURCES))),
    fertilizerPractices: z.array(z.enum(enumValues(FERTILIZER_PRACTICES))),
    priorities: z.array(z.enum(enumValues(PRIORITIES))),
    notes: optionalText(1000),
    boundary: polygonSchema.nullable(),
    boundarySource: z.enum(["drawn", "uploaded"]),
  });

export const cropRecordSchema = z
  .object({
    cropName: z.string().trim().min(2, "Enter the crop name").max(80),
    status: z.enum(["current", "previous"]),
    plantedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid planting date").or(z.literal("")),
    harvestedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid harvest date").or(z.literal("")),
  })
  .refine((v) => !v.plantedOn || !v.harvestedOn || v.harvestedOn >= v.plantedOn, {
    message: "The harvest date cannot be before the planting date",
  });
