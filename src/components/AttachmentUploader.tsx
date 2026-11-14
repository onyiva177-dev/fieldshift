"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { uploadSoilFiles, validateFiles, type AttachmentKind } from "@/lib/upload";
import { registerSoilAttachments } from "@/app/(app)/officer/actions";

export default function AttachmentUploader({ farmId, sampleId }: { farmId: string; sampleId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const reports = Array.from((form.elements.namedItem("reports") as HTMLInputElement).files ?? []);
    const photos = Array.from((form.elements.namedItem("photos") as HTMLInputElement).files ?? []);
    if (reports.length + photos.length === 0) return setError("Choose at least one file.");
    const bad = validateFiles(reports, "lab_report") ?? validateFiles(photos, "photo");
    if (bad) return setError(bad);

    startTransition(async () => {
      const files = [
        ...reports.map((file) => ({ file, kind: "lab_report" as AttachmentKind })),
        ...photos.map((file) => ({ file, kind: "photo" as AttachmentKind })),
      ];
      const up = await uploadSoilFiles(farmId, sampleId, files);
      if (up.items.length) {
        const res = await registerSoilAttachments(sampleId, up.items);
        if (res.error) return setError(res.error);
      }
      if (up.error) return setError(up.error);
      form.reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md bg-field-50 p-4">
      <h3 className="text-lg font-bold">Add lab reports or photos</h3>
      <div>
        <label htmlFor="reports" className="label">Laboratory reports (PDF or image, 5 MB each)</label>
        <input id="reports" name="reports" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="input" />
      </div>
      <div>
        <label htmlFor="photos" className="label">Photos of the sampling site (images, 5 MB each)</label>
        <input id="photos" name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="input" />
      </div>
      {error && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">{pending ? "Uploading..." : "Upload files"}</button>
    </form>
  );
}
