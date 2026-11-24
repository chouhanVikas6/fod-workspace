import type { CompiledSegmentPreview, GeoPoint } from '../store';

export const PATHWAY_COLORS = [
  '#22d3ee', // cyan-400
  '#f472b6', // pink-400
  '#a78bfa', // violet-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#fb7185', // rose-400
  '#60a5fa', // blue-400
  '#a3e635', // lime-400
];

export interface BoundaryPreset {
  id: string;
  name: string;
  tag: string;
  points: GeoPoint[];
}

export const PRESET_BOUNDARIES: BoundaryPreset[] = [
  {
    id: 'kochi-garuda',
    name: 'Kochi INS Garuda Runway',
    tag: 'Hi-Res Offline',
    points: [
      { lat: 9.9445, lon: 76.2625 },
      { lat: 9.9445, lon: 76.2662 },
      { lat: 9.9472, lon: 76.2662 },
      { lat: 9.9472, lon: 76.2625 },
    ],
  },
  {
    id: 'kochi-default',
    name: 'Kochi Default Box',
    tag: '4 pts',
    points: [
      { lat: 9.9400, lon: 76.2700 },
      { lat: 9.9400, lon: 76.2800 },
      { lat: 9.9500, lon: 76.2800 },
      { lat: 9.9500, lon: 76.2700 },
    ],
  },
  {
    id: 'angled-09-27',
    name: 'Angled Runway (09/27)',
    tag: '4 pts',
    points: [
      { lat: 9.9415, lon: 76.2690 },
      { lat: 9.9475, lon: 76.2835 },
      { lat: 9.9505, lon: 76.2820 },
      { lat: 9.9445, lon: 76.2675 },
    ],
  },
  {
    id: 'l-shape-apron',
    name: 'L-Shape Apron & Taxiway',
    tag: '6 pts N-gon',
    points: [
      { lat: 9.9442, lon: 76.2622 },
      { lat: 9.9442, lon: 76.2664 },
      { lat: 9.9455, lon: 76.2664 },
      { lat: 9.9455, lon: 76.2640 },
      { lat: 9.9474, lon: 76.2640 },
      { lat: 9.9474, lon: 76.2622 },
    ],
  },
  {
    id: 'delhi-noida',
    name: 'Delhi / Noida Test Site',
    tag: '4 pts',
    points: [
      { lat: 28.5104, lon: 77.3726 },
      { lat: 28.5115, lon: 77.3726 },
      { lat: 28.5115, lon: 77.3739 },
      { lat: 28.5104, lon: 77.3739 },
    ],
  },
];

export const JUMP_LOCATIONS = [
  { name: 'Kochi INS Garuda (Offline Tiles)', lat: 9.94585, lon: 76.26435, zoom: 18 },
  { name: 'Kochi Default Sector', lat: 9.9450, lon: 76.2750, zoom: 16 },
  { name: 'Delhi / Noida Site', lat: 28.51095, lon: 77.37325, zoom: 18 },
];

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const phi1 = a.lat * toRad;
  const phi2 = b.lat * toRad;
  const dPhi = (b.lat - a.lat) * toRad;
  const dLambda = (b.lon - a.lon) * toRad;
  const sinDPhi = Math.sin(dPhi / 2);
  const sinDLam = Math.sin(dLambda / 2);
  const h = sinDPhi * sinDPhi + Math.cos(phi1) * Math.cos(phi2) * sinDLam * sinDLam;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const toRad = Math.PI / 180;
  const phi1 = a.lat * toRad;
  const phi2 = b.lat * toRad;
  const dLambda = (b.lon - a.lon) * toRad;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function polylineLengthMeters(pts: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += haversineMeters(pts[i - 1], pts[i]);
  }
  return total;
}

export function polygonCentroid(pts: GeoPoint[]): GeoPoint {
  if (pts.length === 0) return { lat: 9.945, lon: 76.275 };
  let sumLat = 0;
  let sumLon = 0;
  for (const p of pts) {
    sumLat += p.lat;
    sumLon += p.lon;
  }
  return { lat: sumLat / pts.length, lon: sumLon / pts.length };
}

function perpendicularDistanceMeters(p: GeoPoint, a: GeoPoint, b: GeoPoint, refLat: number): number {
  const latScale = 111_139;
  const lonScale = 111_139 * Math.max(0.01, Math.abs(Math.cos((refLat * Math.PI) / 180)));
  const px = (p.lon - a.lon) * lonScale;
  const py = (p.lat - a.lat) * latScale;
  const bx = (b.lon - a.lon) * lonScale;
  const by = (b.lat - a.lat) * latScale;
  const lenSq = bx * bx + by * by;
  if (lenSq < 1e-9) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  return Math.hypot(px - t * bx, py - t * by);
}

function rdpSimplify(pts: GeoPoint[], epsilonM: number, refLat: number): GeoPoint[] {
  if (pts.length <= 2) return pts;
  let maxDist = -1;
  let splitIdx = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDistanceMeters(pts[i], first, last, refLat);
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }
  if (maxDist > epsilonM) {
    const left = rdpSimplify(pts.slice(0, splitIdx + 1), epsilonM, refLat);
    const right = rdpSimplify(pts.slice(splitIdx), epsilonM, refLat);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

export function simplifyFreehandPath(
  pts: GeoPoint[],
  minSpacingM = 1.5,
  rdpEpsilonM = 0.45
): GeoPoint[] {
  if (pts.length <= 2) return pts;
  const spaced: GeoPoint[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    if (haversineMeters(spaced[spaced.length - 1], pts[i]) >= minSpacingM) {
      spaced.push(pts[i]);
    }
  }
  const last = pts[pts.length - 1];
  if (haversineMeters(spaced[spaced.length - 1], last) >= 0.25 || spaced.length === 1) {
    spaced.push(last);
  }
  const refLat = spaced.reduce((acc, p) => acc + p.lat, 0) / spaced.length;
  return rdpSimplify(spaced, rdpEpsilonM, refLat);
}

export function computeArrowMarkers(
  pts: GeoPoint[],
  targetSpacingM: number
): Array<{ lat: number; lon: number; bearing: number }> {
  if (pts.length < 2) return [];
  const total = polylineLengthMeters(pts);
  if (total < 2) return [];

  const spacing = Math.max(8, targetSpacingM);
  const arrows: Array<{ lat: number; lon: number; bearing: number }> = [];

  if (total < spacing * 1.15) {
    // Ensure at least 1 midpoint arrow on every segment >= 2m
    const target = total * 0.5;
    let accum = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const segLen = haversineMeters(pts[i], pts[i + 1]);
      if (accum + segLen >= target && segLen >= 0.2) {
        const t = (target - accum) / segLen;
        arrows.push({
          lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * t,
          lon: pts[i].lon + (pts[i + 1].lon - pts[i].lon) * t,
          bearing: bearingDeg(pts[i], pts[i + 1]),
        });
        break;
      }
      accum += segLen;
    }
    return arrows;
  }

  let nextTarget = spacing * 0.5;
  let accum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = haversineMeters(a, b);
    if (segLen < 0.2) continue;
    const brg = bearingDeg(a, b);
    while (nextTarget <= accum + segLen && arrows.length < 40) {
      const t = (nextTarget - accum) / segLen;
      arrows.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
        bearing: brg,
      });
      nextTarget += spacing;
    }
    accum += segLen;
  }

  return arrows;
}

export function sampleCompiledSegments(
  segments: CompiledSegmentPreview[],
  distanceM: number,
  forward = true
): {
  lat: number;
  lon: number;
  heading: number;
  pathIndex: number | null;
  pathName: string | null;
} {
  if (!segments || segments.length === 0) {
    return { lat: 9.945, lon: 76.275, heading: 0, pathIndex: null, pathName: null };
  }

  const total = segments.reduce((acc, s) => acc + s.length_m, 0);
  const clamped = Math.max(0, Math.min(total, distanceM));
  let accum = 0;

  for (const seg of segments) {
    if (seg.points.length < 2) continue;
    if (accum + seg.length_m >= clamped || seg === segments[segments.length - 1]) {
      const localTarget = Math.max(0, Math.min(seg.length_m, clamped - accum));
      let subAccum = 0;
      for (let i = 0; i < seg.points.length - 1; i++) {
        const a = seg.points[i];
        const b = seg.points[i + 1];
        const subLen = haversineMeters(a, b);
        if (subAccum + subLen >= localTarget || i === seg.points.length - 2) {
          const t = subLen > 1e-4 ? Math.max(0, Math.min(1, (localTarget - subAccum) / subLen)) : 0;
          const rawBrg = subLen > 1e-4 ? bearingDeg(a, b) : 0;
          return {
            lat: a.lat + (b.lat - a.lat) * t,
            lon: a.lon + (b.lon - a.lon) * t,
            heading: forward ? rawBrg : (rawBrg + 180) % 360,
            pathIndex: seg.pathway_index,
            pathName: seg.pathway_name,
          };
        }
        subAccum += subLen;
      }
    }
    accum += seg.length_m;
  }

  const first = segments[0].points[0];
  return {
    lat: first?.lat ?? 9.945,
    lon: first?.lon ?? 76.275,
    heading: 0,
    pathIndex: segments[0].pathway_index,
    pathName: segments[0].pathway_name,
  };
}

export function projectPointOntoRoute(
  pt: GeoPoint,
  segments: CompiledSegmentPreview[]
): {
  snappedPt: GeoPoint;
  distanceM: number;
  progressPct: number;
  distFromRouteM: number;
  heading: number;
} | null {
  if (!segments || segments.length === 0) return null;

  const totalLen = segments.reduce((acc, s) => acc + s.length_m, 0);
  const cosLat = Math.cos((pt.lat * Math.PI) / 180) || 1;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * cosLat;

  let bestDistSq = Infinity;
  let bestSnapped: GeoPoint = pt;
  let bestRouteDist = 0;
  let bestHeading = 0;
  let accum = 0;

  for (const seg of segments) {
    const pts = seg.points;
    if (pts.length < 2) {
      accum += seg.length_m;
      continue;
    }
    let subAccum = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const subLen = haversineMeters(a, b);
      const ax = (a.lon - pt.lon) * mPerDegLon;
      const ay = (a.lat - pt.lat) * mPerDegLat;
      const bx = (b.lon - pt.lon) * mPerDegLon;
      const by = (b.lat - pt.lat) * mPerDegLat;
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq > 1e-6 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq)) : 0;
      const px = ax + dx * t;
      const py = ay + dy * t;
      const dSq = px * px + py * py;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestSnapped = {
          lat: a.lat + (b.lat - a.lat) * t,
          lon: a.lon + (b.lon - a.lon) * t,
        };
        bestRouteDist = accum + subAccum + subLen * t;
        bestHeading = subLen > 1e-4 ? bearingDeg(a, b) : 0;
      }
      subAccum += subLen;
    }
    accum += seg.length_m;
  }

  if (!Number.isFinite(bestDistSq)) return null;
  const clampedDist = Math.max(0, Math.min(totalLen, bestRouteDist));
  const progressPct = totalLen > 0 ? (clampedDist / totalLen) * 100 : 0;

  return {
    snappedPt: bestSnapped,
    distanceM: clampedDist,
    progressPct,
    distFromRouteM: Math.sqrt(bestDistSq),
    heading: bestHeading,
  };
}

export function formatMeters(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return '0 m';
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export function formatArea(m2: number): string {
  if (!Number.isFinite(m2) || m2 <= 0) return '0 m²';
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${Math.round(m2).toLocaleString()} m²`;
}

export function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '0m 00s';
  const total = Math.round(secs);
  const mins = Math.floor(total / 60);
  const s = total % 60;
  return `${mins}m ${s.toString().padStart(2, '0')}s`;
}
