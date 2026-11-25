import { useMemo } from "react";
import { shallowEqual, useSelector } from "react-redux";
import { RootState } from "@/store";
import {
  computeNearestWaypointStatus,
  extractCarLocation,
  getConfiguredMissionWaypoints,
  WaypointStatus,
} from "@/utils/waypointProgress";

export function useWaypointProgress(): WaypointStatus {
  const missionNumber = useSelector(
    (state: RootState) => state.MissionState?.missionNumber
  );
  const missionWaypoints = useSelector(
    (state: RootState) => state.MissionState?.waypoints
  );
  const isFreeRun = useSelector(
    (state: RootState) => state.MissionState?.isFreeRun
  );

  const carLocation = useSelector((state: RootState) => {
    const loc = extractCarLocation(state.SystemHealth?.carData?.data);
    if (!loc) return null;
    // Quantize slightly (~1 m) to avoid unnecessary recomputation on sub-mm GPS jitter
    return {
      lat: Math.round(loc.lat * 100000) / 100000,
      lon: Math.round(loc.lon * 100000) / 100000,
    };
  }, shallowEqual);

  const waypoints = useMemo(() => {
    if (!missionNumber || isFreeRun) return [];
    if (Array.isArray(missionWaypoints) && missionWaypoints.length > 0) {
      return missionWaypoints;
    }
    return getConfiguredMissionWaypoints();
  }, [missionNumber, missionWaypoints, isFreeRun]);

  return useMemo(
    () => computeNearestWaypointStatus(carLocation, waypoints),
    [carLocation, waypoints]
  );
}
