import * as turf from "@turf/turf";
import { config } from "@/config/clientConfig";
import { mapArea } from "@/helper/mapHelper";

export interface MissionWaypoint {
  lat: number;
  lon: number;
}

export interface WaypointStatus {
  currentWaypoint: number | null;
  totalWaypoints: number;
  distanceMeters: number | null;
  progressPercent: number;
  hasCarLocation: boolean;
}

const INVALID_FIXES = new Set(["NOT_CONNECTED", "NO_GPS", "OFFLINE"]);

/**
 * Flattens ordered sweep line segments returned by `mapArea` into an ordered
 * list of mission waypoints, removing consecutive duplicates.
 */
export function extractWaypointsFromPathLines(
  pathLines: number[][][]
): MissionWaypoint[] {
  if (!Array.isArray(pathLines) || pathLines.length === 0) return [];

  const waypoints: MissionWaypoint[] = [];
  for (const segment of pathLines) {
    if (!Array.isArray(segment)) continue;
    for (const coord of segment) {
      if (!Array.isArray(coord) || coord.length < 2) continue;
      const [lon, lat] = coord;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const prev = waypoints[waypoints.length - 1];
      if (!prev || prev.lat !== lat || prev.lon !== lon) {
        waypoints.push({ lat, lon });
      }
    }
  }
  return waypoints;
}

/**
 * Generates mission waypoints from the active map boundary configuration.
 */
export function getConfiguredMissionWaypoints(): MissionWaypoint[] {
  const boundaryPoints = config.map?.boundaryPoints;
  if (!Array.isArray(boundaryPoints) || boundaryPoints.length < 3) {
    return [];
  }

  try {
    const pathLines = mapArea(
      boundaryPoints,
      config.map.lateraldistance || 10,
      2,
      config.map.pathDirection || "LENGTHWISE",
      Boolean(config.map.reversePath)
    );
    return extractWaypointsFromPathLines(pathLines);
  } catch {
    return [];
  }
}

function isValidCoordNode(node: any): node is { lat: number; lon: number } {
  if (!node || typeof node !== "object") return false;
  const { lat, lon, fix } = node;
  if (typeof fix === "string" && INVALID_FIXES.has(fix.toUpperCase())) {
    return false;
  }
  if (typeof lat !== "number" || typeof lon !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  // Default uninitialized GPS packets often carry (0, 0)
  if (lat === 0 && lon === 0) return false;
  return true;
}

/**
 * Extracts the vehicle's current lat/lon from Redux `SystemHealth.carData.data`,
 * preferring `primary_data` and falling back to `secondary_data`.
 */
export function extractCarLocation(carData: any): MissionWaypoint | null {
  if (!carData || typeof carData !== "object") return null;
  if (isValidCoordNode(carData.primary_data)) {
    return { lat: carData.primary_data.lat, lon: carData.primary_data.lon };
  }
  if (isValidCoordNode(carData.secondary_data)) {
    return { lat: carData.secondary_data.lat, lon: carData.secondary_data.lon };
  }
  return null;
}

/**
 * Finds the nearest waypoint to the car's current location using geodesic
 * distance (meters). Returns 1-based `currentWaypoint` index and progress %.
 */
export function computeNearestWaypointStatus(
  carLocation: MissionWaypoint | null,
  waypoints: MissionWaypoint[]
): WaypointStatus {
  const totalWaypoints = waypoints.length;

  if (totalWaypoints === 0) {
    return {
      currentWaypoint: null,
      totalWaypoints: 0,
      distanceMeters: null,
      progressPercent: 0,
      hasCarLocation: Boolean(carLocation),
    };
  }

  if (!carLocation) {
    return {
      currentWaypoint: null,
      totalWaypoints,
      distanceMeters: null,
      progressPercent: 0,
      hasCarLocation: false,
    };
  }

  const carPoint = turf.point([carLocation.lon, carLocation.lat]);
  let nearestIdx = 0;
  let minDist = Infinity;

  for (let i = 0; i < totalWaypoints; i++) {
    const wp = waypoints[i];
    const dist = turf.distance(carPoint, turf.point([wp.lon, wp.lat]), {
      units: "meters",
    });
    if (dist < minDist) {
      minDist = dist;
      nearestIdx = i;
    }
  }

  const currentWaypoint = nearestIdx + 1;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((currentWaypoint / totalWaypoints) * 100))
  );

  return {
    currentWaypoint,
    totalWaypoints,
    distanceMeters: Number.isFinite(minDist) ? minDist : null,
    progressPercent,
    hasCarLocation: true,
  };
}

export function formatWaypointDistance(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}
