"use client";

import { useState, useTransition } from "react";
import FarmMap from "@/components/FarmMap";
import type { Ring } from "@/lib/geo";

interface Props {
  farmId: string;
  farmPin: { lat: number; lng: number };
  boundary: Ring;
  existing: { lat: number; lng: number; label: string }[];
  action: (fd: FormData) => Promise<{ error?: string }>;
}

export default function SamplingPointForm({ farmId, farmPin, boundary, existing, action }: Props) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const la = lat.trim() === "" ? NaN : Number(lat);
  const ln = lng.trim() === "" ? NaN : Number(lng);
  const pin = Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 ? { lat: la, lng: ln } : null;
  const setPin = (a: number, b: number) => {
    setLat(a.toFixed(6));
    setLng(b.toFixed(6));
  };

  function gps() {
    setMsg(null);
    if (!navigator.geolocation) return setMsg("This device cannot share its location. Tap the map instead.");
    navigator.geolocation.getCurrentPosition(
      (p) => setPin(p.coords.latitude, p.coords.longitude),
      () => setMsg("Could not get your location. Allow location access, or tap the map."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
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
    <form onSubmit={onSubmit} className="card space-y-4">
      <h3 className="text-lg font-bold">Add a sampling point</h3>
      <input type="hidden" name="farmId" value={farmId} />
      <p className="text-sm">Stand where you took the sample and use your location, or tap the map. Blue dots are existing points.</p>
      <button type="button" onClick={gps} className="btn-secondary">Use my location</button>
      <FarmMap
        pin={pin}
        points={boundary}
        editable
        markers={[{ ...farmPin, label: "Farm pin" }, ...existing]}
        onMapClick={setPin}
        onPinDrag={setPin}
      />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sp-lat" className="label">Latitude</label>
          <input id="sp-lat" name="lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} className="input" />
        </div>
        <div>
          <label htmlFor="sp-lng" className="label">Longitude</label>
          <input id="sp-lng" name="lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} className="input" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sp-label" className="label">Label</label>
          <input id="sp-label" name="label" placeholder="P1" maxLength={60} required className="input" />
        </div>
        <div>
          <label htmlFor="sp-notes" className="label">Note (optional)</label>
          <input id="sp-notes" name="notes" maxLength={300} placeholder="e.g. lower slope, near the stream" className="input" />
        </div>
      </div>
      {msg && <p role="status" className="rounded-md bg-field-100 p-3">{msg}</p>}
      {error && <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-red-900">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">{pending ? "Saving..." : "Save sampling point"}</button>
    </form>
  );
}
