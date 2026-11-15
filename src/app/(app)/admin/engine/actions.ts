"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRoleAction } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { COMPONENTS } from "@/lib/engine/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const here = (q: string) => `/admin/engine?${q}`;

export async function saveWeights(fd: FormData): Promise<void> {
  const admin = await requireRoleAction(["admin"]);
  const weights: Record<string, number> = {};
  for (const c of COMPONENTS) {
    const n = Number(String(fd.get(`w_${c.key}`) ?? ""));
    if (!Number.isFinite(n) || n < 0 || n > 100) redirect(here(`error=${encodeURIComponent(`${c.label}: enter a number from 0 to 100.`)}`));
    weights[c.key] = n;
  }
  if (!Object.values(weights).some((v) => v > 0)) redirect(here(`error=${encodeURIComponent("At least one weight must be above zero.")}`));

  const supabase = await createClient();
  const { error } = await supabase.from("scoring_config").update({ weights, updated_by: admin.id, updated_at: new Date().toISOString() }).eq("id", "default");
  if (error) redirect(here(`error=${encodeURIComponent("Could not save the weights.")}`));
  await logAudit({ actorId: admin.id, action: "scoring_config.updated", entity: "scoring_config", entityId: "default", details: weights });
  revalidatePath("/admin/engine");
  redirect(here("saved=weights"));
}

export async function addRule(fd: FormData): Promise<void> {
  const admin = await requireRoleAction(["admin"]);
  const get = (k: string) => String(fd.get(k) ?? "").trim();
  const kinds = ["crop", "family", "group"];
  const effects = ["beneficial", "neutral", "caution", "avoid"];
  const [fk, fv, tk, tv, effect, reason] = [get("from_kind"), get("from_value"), get("to_kind"), get("to_value"), get("effect"), get("reason")];
  const score = Number(get("score"));
  if (!kinds.includes(fk) || !kinds.includes(tk) || !fv || !tv || fv.length > 60 || tv.length > 60) redirect(here(`error=${encodeURIComponent("Fill in both sides of the rule.")}`));
  if (!effects.includes(effect) || !Number.isInteger(score) || score < 0 || score > 100) redirect(here(`error=${encodeURIComponent("Choose an effect and a score from 0 to 100.")}`));
  if (reason.length < 10 || reason.length > 500) redirect(here(`error=${encodeURIComponent("Explain the reason in 10 to 500 characters. Farmers see it.")}`));

  const supabase = await createClient();
  const { data, error } = await supabase.from("crop_rotation_rules")
    .insert({ from_kind: fk, from_value: fv, to_kind: tk, to_value: tv, effect, score, reason }).select("id").single();
  if (error || !data) redirect(here(`error=${encodeURIComponent("Could not save the rule.")}`));
  await logAudit({ actorId: admin.id, action: "rotation_rule.created", entity: "rotation_rule", entityId: data.id });
  revalidatePath("/admin/engine");
  redirect(here("saved=rule"));
}

export async function deleteRule(fd: FormData): Promise<void> {
  const admin = await requireRoleAction(["admin"]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("crop_rotation_rules").delete().eq("id", id).select("id");
  if (data?.length) await logAudit({ actorId: admin.id, action: "rotation_rule.deleted", entity: "rotation_rule", entityId: id });
  revalidatePath("/admin/engine");
}
