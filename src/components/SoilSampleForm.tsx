"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SOIL_PARAMS, SOURCES, type SoilParam } from "@/lib/soil-parameters";
import { CUSTOM_ROWS } from "@/lib/soil-validation";
import { uploadSoilFiles, validateFiles, type AttachmentKind } from "@/lib/upload";
import { registerSoilAttachments } from "@/app/(app)/officer/actions";

export interface SoilInitial {
  samplingPointId: string;
  sampledOn: string;
  sampleDepthCm: string;
  labName: string;
  labReference: string;
  notes: string;
  supersedesId: string;
  responsibleParty: string;
  values: Record<string, { value: string; unit: string; method: string; source: string }>;
}

interface Props {
  farmId: string;
  points: { id: string; label: string }[];
  defaultResponsible: string;
  initial?: SoilInitial;
  action: (fd: FormData) => Promise<{ error?: string; sampleId?: string; farmId?: string }>;
}

function ParamCard({ p, init }: { p: SoilParam; init?: SoilInitial["values"][string] }) {
  return (
    <div className="rounded-md border border-field-200 p-4">
      <h3 className="text-lg font-bold">{p.label}</h3>
      {p.help && <p className="text-sm">{p.help}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`val_${p.key}`} className="label">Result</label>
          {p.kind === "number" ? (
            <div className="flex gap-2">
              <input id={`val_${p.key}`} name={`val_${p.key}`} inputMode="decimal" defaultValue={init?.value} className="input" />
              <select name={`unit_${p.key}`} aria-label={`${p.label} unit`} defaultValue={init?.unit || p.units[0]} className="input max-w-[9rem]">
                {p.units.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          ) : (
            <select id={`val_${p.key}`} name={`val_${p.key}`} defaultValue={init?.value ?? ""} className="input">
              <option value="">Not available</option>
              {p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {p.kind === "number" && <p className="mt-1 text-sm">Leave empty if not available.</p>}
        </div>
        <div>
          <label htmlFor={`method_${p.key}`} className="label">Test method</label>
          <input id={`method_${p.key}`} name={`method_${p.key}`} list={`methods_${p.key}`} defaultValue={init?.method} className="input" />
          <datalist id={`methods_${p.key}`}>{p.methods.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div>
          <label htmlFor={`src_${p.key}`} className="label">Source</label>
          <select id={`src_${p.key}`} name={`src_${p.key}`} defaultValue={init?.source || p.defaultSource} className="input">
            {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function SoilSampleForm({ farmId, points, defaultResponsible, initial, action }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const reports = Array.from((form.elements.namedItem("reports") as HTMLInputElement).files ?? []);
    const photos = Array.from((form.elements.namedItem("photos") as HTMLInputElement).files ?? []);
    const bad = validateFiles(reports, "lab_report") ?? validateFiles(photos, "photo");
    if (bad) return setError(bad);
    // files stay out of the server action: they go straight to storage afterwards
    fd.delete("reports");
    fd.delete("photos");

    startTransition(async () => {
      const res = await action(fd);
      if (res.error || !res.sampleId) return setError(res.error ?? "Could not submit the sample.");

      let uploadProblem = false;
      const files = [
        ...reports.map((file) => ({ file, kind: "lab_report" as AttachmentKind })),
        ...photos.map((file) => ({ file, kind: "photo" as AttachmentKind })),
      ];
      if (files.length) {
        const up = await uploadSoilFiles(farmId, res.sampleId, files);
        if (up.items.length) {
          const reg = await registerSoilAttachments(res.sampleId, up.items);
          if (reg.error) uploadProblem = true;
        }
        if (up.error) uploadProblem = true;
      }
      router.push(`/soil/${res.sampleId}${uploadProblem ? "?uploadProblem=1" : ""}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <input type="hidden" name="farmId" value={farmId} />
      <input type="hidden" name="supersedesId" value={initial?.supersedesId ?? ""} />

      <section className="card space-y-4">
        <h2 className="text-xl font-bold">Sample details</h2>
        <div>
          <label htmlFor="samplingPointId" className="label">Sampling point</label>
          <select id="samplingPointId" name="samplingPointId" required defaultValue={initial?.samplingPointId ?? ""} className="input">
            <option value="" disabled>Choose a point</option>
            {points.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="sampledOn" className="label">Date sampled</label>
            <input id="sampledOn" name="sampledOn" type="date" required max={today} defaultValue={initial?.sampledOn} className="input" />
          </div>
          <div>
            <label htmlFor="testedOn" className="label">Date tested (optional)</label>
            <input id="testedOn" name="testedOn" type="date" max={today} className="input" />
          </div>
          <div>
            <label htmlFor="sampleDepthCm" className="label">Sampling depth (cm)</label>
            <input id="sampleDepthCm" name="sampleDepthCm" inputMode="numeric" defaultValue={initial?.sampleDepthCm} className="input" />
          </div>
        </div>
        <div>
          <label htmlFor="responsibleParty" className="label">Responsible for the results (you, or the laboratory)</label>
          <input id="responsibleParty" name="responsibleParty" required defaultValue={initial?.responsibleParty ?? defaultResponsible} className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="labName" className="label">Laboratory name (if any)</label>
            <input id="labName" name="labName" maxLength={120} defaultValue={initial?.labName} className="input" />
          </div>
          <div>
            <label htmlFor="labReference" className="label">Lab report number (if any)</label>
            <input id="labReference" name="labReference" maxLength={80} defaultValue={initial?.labReference} className="input" />
          </div>
        </div>
        <div>
          <label htmlFor="notes" className="label">Notes (optional)</label>
          <textarea id="notes" name="notes" rows={2} maxLength={500} defaultValue={initial?.notes} className="input" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Measurements</h2>
        <p>Only enter values that were actually measured. Leave the rest empty; they are recorded as not available.</p>
        {SOIL_PARAMS.map((p) => <ParamCard key={p.key} p={p} init={initial?.values[p.key]} />)}
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-bold">Additional laboratory measurements</h2>
        <p className="text-sm">For anything else the lab reported, such as CEC, calcium or zinc.</p>
        {Array.from({ length: CUSTOM_ROWS }, (_, i) => i + 1).map((i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-4">
            <div><label htmlFor={`cname_${i}`} className="label">Name</label><input id={`cname_${i}`} name={`cname_${i}`} maxLength={60} className="input" /></div>
            <div><label htmlFor={`cval_${i}`} className="label">Value</label><input id={`cval_${i}`} name={`cval_${i}`} inputMode="decimal" className="input" /></div>
            <div><label htmlFor={`cunit_${i}`} className="label">Unit</label><input id={`cunit_${i}`} name={`cunit_${i}`} maxLength={20} className="input" /></div>
            <div><label htmlFor={`cmethod_${i}`} className="label">Method</label><input id={`cmethod_${i}`} name={`cmethod_${i}`} maxLength={120} className="input" /></div>
          </div>
        ))}
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-bold">Attachments (optional)</h2>
        <div>
          <label htmlFor="reports" className="label">Laboratory reports (PDF or image, 5 MB each)</label>
          <input id="reports" name="reports" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="input" />
        </div>
        <div>
          <label htmlFor="photos" className="label">Photos of the sampling site (images, 5 MB each)</label>
          <input id="photos" name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="input" />
        </div>
      </section>

      {error && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60 sm:w-auto">
        {pending ? "Submitting..." : "Submit for verification"}
      </button>
    </form>
  );
}
