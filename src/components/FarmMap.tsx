"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Ring } from "@/lib/geo";

interface Props {
  pin: { lat: number; lng: number } | null;
  points: Ring; // boundary corner points as [lng, lat]
  editable?: boolean;
  markers?: { lat: number; lng: number; label: string }[];
  onMapClick?: (lat: number, lng: number) => void;
  onPinDrag?: (lat: number, lng: number) => void;
}

const KENYA_CENTER: [number, number] = [0.0236, 37.9062];

export default function FarmMap({ pin, points, editable = false, markers = [], onMapClick, onPinDrag }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const groupRef = useRef<Leaflet.LayerGroup | null>(null);
  const libRef = useRef<typeof Leaflet | null>(null);
  const clickRef = useRef(onMapClick);
  const dragRef = useRef(onPinDrag);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const markersKey = JSON.stringify(markers);

  clickRef.current = onMapClick;
  dragRef.current = onPinDrag;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (cancelled || !el.current || mapRef.current) return;
      const map = L.map(el.current, { scrollWheelZoom: false }).setView(KENYA_CENTER, 6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => clickRef.current?.(e.latlng.lat, e.latlng.lng));
      groupRef.current = L.layerGroup().addTo(map);
      libRef.current = L;
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      groupRef.current = null;
      fitted.current = false;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const L = libRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!ready || !L || !map || !group) return;

    group.clearLayers();
    const latlngs = points.map(([lng, lat]) => [lat, lng] as [number, number]);
    if (latlngs.length >= 3) {
      L.polygon(latlngs, { color: "#1f4d3a", weight: 3, fillOpacity: 0.15 }).addTo(group);
    } else if (latlngs.length === 2) {
      L.polyline(latlngs, { color: "#1f4d3a", weight: 3, dashArray: "6 6" }).addTo(group);
    }
    if (editable) {
      latlngs.forEach((ll) =>
        L.circleMarker(ll, { radius: 6, color: "#7a5504", fillColor: "#e0ac2b", fillOpacity: 1, weight: 2 }).addTo(group)
      );
    }
    markers.forEach((m) =>
      L.circleMarker([m.lat, m.lng], { radius: 7, color: "#ffffff", weight: 2, fillColor: "#1d4ed8", fillOpacity: 1 })
        .bindTooltip(m.label, { permanent: false })
        .addTo(group)
    );
    if (pin) {
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#1f4d3a;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 0 0 1px #1f4d3a"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });
      const marker = L.marker([pin.lat, pin.lng], {
        icon, draggable: editable, keyboard: editable,
        title: editable ? "Pin. Drag to move it." : "Farm pin", alt: "Pin",
      }).addTo(group);
      if (editable) {
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          dragRef.current?.(p.lat, p.lng);
        });
      }
    }

    if (!fitted.current) {
      if (latlngs.length >= 3) {
        map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
        fitted.current = true;
      } else if (pin) {
        map.setView([pin.lat, pin.lng], 15);
        fitted.current = true;
      } else if (markers.length === 1) {
        map.setView([markers[0].lat, markers[0].lng], 12);
        fitted.current = true;
      } else if (markers.length > 1) {
        map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])), { padding: [32, 32], maxZoom: 12 });
        fitted.current = true;
      }
    } else if (pin && !map.getBounds().contains([pin.lat, pin.lng])) {
      map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), 15));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points, pin, editable, markersKey]);

  return (
    <div
      ref={el}
      role="application"
      aria-label="Farm map"
      className="relative z-0 h-80 w-full rounded-md border border-stone-400 md:h-96"
    />
  );
}
