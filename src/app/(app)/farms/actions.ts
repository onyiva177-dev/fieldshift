"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRoleAction } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { cropRecordSchema, farmSchema } from "@/lib/farm-validation";

export type FormResult = { error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseFarm(fd: FormData): { payload?: Record<string, unknown>; error?: string } {
  const latRaw = String(fd.get("lat") ?? "").trim();
  const lngRaw = String(fd.get("lng") ?? "").trim();
  if (!latRaw || !lngRaw) return { error: "Place the farm pin on the map, or enter its coordinates." };

  let boundary: unknown = null;
  const b = String(fd.get("boundary") ?? "");
  if (b) {
    try {
      boundary = JSON.parse(b);
    } catch {
      return { error: "The boundary data is not valid. Redraw the boundary and try again." };
    }
  }

  const irrigationAvailable = fd.get("irrigationAvailable") === "on";
  const irrigationType = String(fd.get("irrigationType") ?? "");

  const parsed = farmSchema.safeParse({
    name: String(fd.get("name") ?? ""),
    county: String(fd.get("county") ?? ""),
    subCounty: String(fd.get("subCounty") ?? ""),
    village: String(fd.get("village") ?? ""),
    lat: Number(latRaw),
    lng: Number(lngRaw),
    sizeHa: Number(String(fd.get("sizeHa") ?? "")),
    irrigationAvailable,
    irrigationType: irrigationAvailable && irrigationType ? irrigationType : undefined,
    waterSources: fd.getAll("waterSources").map(String),
    fertilizerPractices: fd.getAll("fertilizerPractices").map(String),
    priorities: fd.getAll("priorities").map(String),
    notes: String(fd.get("notes") ?? ""),
    boundary,
    boundarySource: String(fd.get("boundarySource") ?? "drawn") === "uploaded" ? "uploaded" : "drawn",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const v = parsed.data;
  return {
    payload: {
      name: v.name,
      county: v.county,
      sub_county: v.subCounty,
      village: v.village,
      lat: v.lat,
      lng: v.lng,
      size_ha: v.sizeHa,
      irrigation_available: v.irrigationAvailable,
      irrigation_type: v.irrigationType ?? "",
      water_sources: v.waterSources,
      fertilizer_practices: v.fertilizerPractices,
      priorities: v.priorities,
      notes: v.notes,
      boundary: v.boundary,
      boundary_source: v.boundarySource,
    },
  };
}

async function saveFarm(farmId: string | null, fd: FormData): Promise<FormResult> {
  const user = await requireRoleAction(["farmer", "admin"]);
  const { payload, error: invalid } = parseFarm(fd);
  if (!payload) return { error: invalid };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_farm", { p_farm_id: farmId, p: payload });
  if (error) {
    // P0001 = a message written for the user inside the database function
    return { error: error.code === "P0001" ? error.message : "Could not save the farm. Check the details and try again." };
  }

  const id = String(data);
  await logAudit({ actorId: user.id, action: farmId ? "farm.updated" : "farm.created", entity: "farm", entityId: id });
  revalidatePath("/farms");
  revalidatePath(`/farms/${id}`);
  redirect(`/farms/${id}`);
}

export async function createFarm(fd: FormData): Promise<FormResult> {
  return saveFarm(null, fd);
}

export async function updateFarm(farmId: string, fd: FormData): Promise<FormResult> {
  if (!UUID.test(farmId)) return { error: "Farm not found." };
  return saveFarm(farmId, fd);
}

// Crop history ---------------------------------------------------------

export async function addCropRecord(fd: FormData): Promise<void> {
  const user = await requireRoleAction(["farmer", "admin"]);
  const farmId = String(fd.get("farmId") ?? "");
  if (!UUID.test(farmId)) return;

  const parsed = cropRecordSchema.safeParse({
    cropName: String(fd.get("cropName") ?? ""),
    status: String(fd.get("status") ?? ""),
    plantedOn: String(fd.get("plantedOn") ?? ""),
    harvestedOn: String(fd.get("harvestedOn") ?? ""),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Check the crop details.";
    redirect(`/farms/${farmId}?cropError=${encodeURIComponent(msg)}#crops`);
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crop_history")
    .insert({
      farm_id: farmId,
      crop_name: v.cropName,
      status: v.status,
      planted_on: v.plantedOn || null,
      harvested_on: v.harvestedOn || null,
    })
    .select("id")
    .single();
  if (error) redirect(`/farms/${farmId}?cropError=${encodeURIComponent("Could not save the crop record.")}#crops`);

  await logAudit({ actorId: user.id, action: "crop_history.added", entity: "crop_history", entityId: data.id });
  revalidatePath(`/farms/${farmId}`);
  redirect(`/farms/${farmId}#crops`);
}

export async function markHarvested(fd: FormData): Promise<void> {
  const user = await requireRoleAction(["farmer", "admin"]);
  const id = String(fd.get("id") ?? "");
  const farmId = String(fd.get("farmId") ?? "");
  if (!UUID.test(id) || !UUID.test(farmId)) return;

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("crop_history")
    .update({ status: "previous", harvested_on: today })
    .eq("id", id)
    .select("id");
  if (data?.length) await logAudit({ actorId: user.id, action: "crop_history.harvested", entity: "crop_history", entityId: id });
  revalidatePath(`/farms/${farmId}`);
}

export async function deleteCropRecord(fd: FormData): Promise<void> {
  const user = await requireRoleAction(["farmer", "admin"]);
  const id = String(fd.get("id") ?? "");
  const farmId = String(fd.get("farmId") ?? "");
  if (!UUID.test(id) || !UUID.test(farmId)) return;

  const supabase = await createClient();
  const { data } = await supabase.from("crop_history").delete().eq("id", id).select("id");
  if (data?.length) await logAudit({ actorId: user.id, action: "crop_history.deleted", entity: "crop_history", entityId: id });
  revalidatePath(`/farms/${farmId}`);
}
