"use client";

import { useState, useTransition } from "react";
import FarmMap from "@/components/FarmMap";
import {
  COUNTIES,
  FERTILIZER_PRACTICES,
  IRRIGATION_TYPES,
  PRIORITIES,
  WATER_SOURCES,
} from "@/lib/farm-options";
import { parseUploadedGeoJson, pointsToPolygon, polygonAreaHa, type Ring } from "@/lib/geo";

export interface FarmInitial {
  name: string;
  county: string;
  subCounty: string;
  village: string;
  lat: number;
  lng: number;
  sizeHa: string;
  irrigationAvailable: boolean;
  irrigationType: string;
  waterSources: string[];
  fertilizerPractices: string[];
  priorities: string[];
  notes: string;
  points: Ring;
  boundarySource: "drawn" | "uploaded";
}

interface Props {
  action: (formData: FormData) => Promise<{ error?: string }>;
  submitLabel: string;
  initial?: FarmInitial;
}

function CheckGroup({
  legend,
  name,
  options,
  selected,
}: {
  legend: string;
  name: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} className="h-5 w-5" />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function FarmForm({ action, submitLabel, initial }: Props) {
  const [lat, setLat] = useState(initial ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial ? String(initial.lng) : "");
  const [points, setPoints] = useState<Ring>(initial?.points ?? []);
  const [source, setSource] = useState<"drawn" | "uploaded">(initial?.boundarySource ?? "drawn");
  const [mode, setMode] = useState<"pin" | "boundary">("pin");
  const [size, setSize] = useState(initial?.sizeHa ?? "");
  const [irrigation, setIrrigation] = useState(initial?.irrigationAvailable ?? false);
  const [error, setError] = useState<string | null>(null);
  const [mapMsg, setMapMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const latNum = lat.trim() === "" ? NaN : Number(lat);
  const lngNum = lng.trim() === "" ? NaN : Number(lng);
  const pin =
    Number.isFinite(latNum) && Number.isFinite(lngNum) && Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180
      ? { lat: latNum, lng: lngNum }
      : null;
  const boundary = pointsToPolygon(points);
  const area = points.length >= 3 ? polygonAreaHa(points) : null;

  function setPin(la: number, ln: number) {
    setLat(la.toFixed(6));
    setLng(ln.toFixed(6));
  }

  function onMapClick(la: number, ln: number) {
    if (mode === "pin") setPin(la, ln);
    else {
      setPoints((p) => [...p, [ln, la]]);
      setSource("drawn");
    }
  }

  function useMyLocation() {
    setMapMsg(null);
    if (!navigator.geolocation) {
      setMapMsg("This device cannot share its location. Tap the map to place the pin instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPin(pos.coords.latitude, pos.coords.longitude),
      () => setMapMsg("Could not get your location. Allow location access, or tap the map to place the pin."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMapMsg(null);
    if (file.size > 1_000_000) {
      setMapMsg("The file is larger than 1 MB.");
      return;
    }
    const res = parseUploadedGeoJson(await file.text());
    if (res.error || !res.points) {
      setMapMsg(res.error ?? "Could not read the file.");
      return;
    }
    setPoints(res.points);
    setSource("uploaded");
    setMapMsg(res.note ?? "Boundary loaded from file.");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="card space-y-4">
        <h2 className="text-xl font-bold">Farm details</h2>
        <div>
          <label htmlFor="name" className="label">Farm name</label>
          <input id="name" name="name" required defaultValue={initial?.name} className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="county" className="label">County</label>
            <input id="county" name="county" list="counties" required defaultValue={initial?.county} className="input" />
            <datalist id="counties">{COUNTIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label htmlFor="subCounty" className="label">Sub-county</label>
            <input id="subCounty" name="subCounty" defaultValue={initial?.subCounty} className="input" />
          </div>
          <div>
            <label htmlFor="village" className="label">Village</label>
            <input id="village" name="village" defaultValue={initial?.village} className="input" />
          </div>
        </div>
        <div>
          <label htmlFor="sizeHa" className="label">Farm size (hectares)</label>
          <input
            id="sizeHa"
            name="sizeHa"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="input max-w-xs"
          />
          <p className="mt-1 text-sm">One acre is about 0.4 hectares.</p>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-bold">Location and boundary</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Map tool">
          <button
            type="button"
            onClick={() => setMode("pin")}
            aria-pressed={mode === "pin"}
            className={mode === "pin" ? "btn-primary" : "btn-secondary"}
          >
            Place pin
          </button>
          <button
            type="button"
            onClick={() => setMode("boundary")}
            aria-pressed={mode === "boundary"}
            className={mode === "boundary" ? "btn-primary" : "btn-secondary"}
          >
            Draw boundary
          </button>
          <button type="button" onClick={useMyLocation} className="btn-secondary">Use my location</button>
        </div>
        <p className="text-sm">
          {mode === "pin"
            ? "Tap the map to place the farm pin, or drag the pin to adjust it."
            : "Tap each corner of the farm in order. At least 3 corners make a boundary."}
        </p>

        <FarmMap pin={pin} points={points} editable onMapClick={onMapClick} onPinDrag={setPin} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="lat" className="label">Latitude</label>
            <input id="lat" name="lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="lng" className="label">Longitude</label>
            <input id="lng" name="lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} className="input" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length} className="btn-secondary disabled:opacity-50">
            Undo last corner
          </button>
          <button type="button" onClick={() => setPoints([])} disabled={!points.length} className="btn-secondary disabled:opacity-50">
            Clear boundary
          </button>
          <label className="btn-secondary cursor-pointer">
            Upload GeoJSON
            <input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={onFile} className="sr-only" />
          </label>
        </div>

        {area !== null && (
          <p>
            Boundary area: <strong>{area.toFixed(2)} ha</strong>.{" "}
            <button type="button" onClick={() => setSize(area.toFixed(2))} className="font-semibold text-field-800 underline">
              Use this as the farm size
            </button>
          </p>
        )}
        {points.length > 0 && points.length < 3 && <p className="text-sm">Add at least {3 - points.length} more corner(s) to complete the boundary.</p>}
        {mapMsg && <p role="status" className="rounded-md bg-field-100 p-3">{mapMsg}</p>}
        <input type="hidden" name="boundary" value={boundary ? JSON.stringify(boundary) : ""} />
        <input type="hidden" name="boundarySource" value={source} />
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-bold">Water and inputs</h2>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="irrigationAvailable"
            checked={irrigation}
            onChange={(e) => setIrrigation(e.target.checked)}
            className="h-5 w-5"
          />
          <span>I have irrigation on this farm</span>
        </label>
        {irrigation && (
          <div>
            <label htmlFor="irrigationType" className="label">Irrigation type</label>
            <select id="irrigationType" name="irrigationType" defaultValue={initial?.irrigationType ?? ""} className="input max-w-sm">
              <option value="">Select</option>
              {IRRIGATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        )}
        <CheckGroup legend="Water sources" name="waterSources" options={WATER_SOURCES} selected={initial?.waterSources ?? []} />
        <CheckGroup legend="Fertilizer and organic inputs you use" name="fertilizerPractices" options={FERTILIZER_PRACTICES} selected={initial?.fertilizerPractices ?? []} />
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-bold">Your priorities</h2>
        <CheckGroup legend="What matters most for this farm? Choose any." name="priorities" options={PRIORITIES} selected={initial?.priorities ?? []} />
        <div>
          <label htmlFor="notes" className="label">Notes (optional)</label>
          <textarea id="notes" name="notes" rows={3} maxLength={1000} defaultValue={initial?.notes} className="input" />
        </div>
      </section>

      {error && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60 sm:w-auto">
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
