export type Ring = [number, number][]; // each point is [longitude, latitude]

export interface Polygon {
  type: "Polygon";
  coordinates: Ring[];
}

/** Open list of corner points to a closed GeoJSON polygon. Needs at least 3 points. */
export function pointsToPolygon(points: Ring): Polygon | null {
  if (points.length < 3) return null;
  return { type: "Polygon", coordinates: [[...points, points[0]]] };
}

/** Closed GeoJSON ring to an open list of corner points. */
export function ringToPoints(ring: Ring): Ring {
  const last = ring[ring.length - 1];
  const first = ring[0];
  return last && first && last[0] === first[0] && last[1] === first[1] ? ring.slice(0, -1) : ring;
}

/** Approximate geodesic area in hectares, for display only. The database computes the stored value. */
export function polygonAreaHa(points: Ring): number {
  if (points.length < 3) return 0;
  const R = 6378137;
  const rad = (d: number) => (d * Math.PI) / 180;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [lng1, lat1] = points[i];
    const [lng2, lat2] = points[(i + 1) % points.length];
    sum += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return (Math.abs((sum * R * R) / 2)) / 10000;
}

const MAX_POINTS = 500;

type Geom = { type?: string; coordinates?: unknown };

/** Reads a GeoJSON file's text and returns the first polygon's outer ring as corner points. */
export function parseUploadedGeoJson(text: string): { points?: Ring; note?: string; error?: string } {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "This file is not valid GeoJSON." };
  }

  let geom: Geom | undefined = data;
  if (data?.type === "FeatureCollection") geom = data.features?.[0]?.geometry;
  else if (data?.type === "Feature") geom = data.geometry;

  let ring: unknown;
  let note: string | undefined;
  if (geom?.type === "Polygon") {
    ring = (geom.coordinates as unknown[])?.[0];
  } else if (geom?.type === "MultiPolygon") {
    const polys = geom.coordinates as unknown[][];
    ring = polys?.[0]?.[0];
    if (polys.length > 1) note = "The file has several polygons. Only the first was used.";
  } else {
    return { error: "The file must contain a Polygon boundary." };
  }

  if (!Array.isArray(ring)) return { error: "The polygon has no coordinates." };
  const pts: Ring = [];
  for (const p of ring) {
    if (!Array.isArray(p) || typeof p[0] !== "number" || typeof p[1] !== "number") {
      return { error: "The polygon contains invalid coordinates." };
    }
    if (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) {
      return { error: "Coordinates must be longitude and latitude (WGS84)." };
    }
    pts.push([p[0], p[1]]);
  }
  const open = ringToPoints(pts);
  if (open.length < 3) return { error: "A boundary needs at least 3 corner points." };
  if (open.length > MAX_POINTS) return { error: `The boundary has too many points (maximum ${MAX_POINTS}).` };
  return { points: open, note };
}
