import { createClient } from "@/lib/supabase/client";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_KIND = 5;
export const REPORT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type AttachmentKind = "lab_report" | "photo";
export interface UploadedItem { path: string; name: string; mime: string; size: number; kind: AttachmentKind }

export function validateFiles(files: File[], kind: AttachmentKind): string | null {
  const allowed = kind === "lab_report" ? REPORT_TYPES : PHOTO_TYPES;
  if (files.length > MAX_FILES_PER_KIND) return `Choose at most ${MAX_FILES_PER_KIND} files.`;
  for (const f of files) {
    if (!allowed.includes(f.type)) {
      return `${f.name}: ${kind === "lab_report" ? "use a PDF or an image (JPG, PNG, WebP)" : "use an image (JPG, PNG, WebP)"}.`;
    }
    if (f.size > MAX_FILE_BYTES) return `${f.name} is larger than 5 MB.`;
    if (f.size === 0) return `${f.name} is empty.`;
  }
  return null;
}

/** Uploads straight from the browser to private storage. Returns what succeeded, plus an error if one failed. */
export async function uploadSoilFiles(
  farmId: string,
  sampleId: string,
  files: { file: File; kind: AttachmentKind }[]
): Promise<{ items: UploadedItem[]; error?: string }> {
  const supabase = createClient();
  const items: UploadedItem[] = [];
  for (const { file, kind } of files) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${farmId}/${sampleId}/${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage.from("soil-attachments").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) return { items, error: `Could not upload ${file.name}: ${error.message}` };
    items.push({ path, name: file.name.slice(0, 200), mime: file.type, size: file.size, kind });
  }
  return { items };
}
