
'use client';

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { AppDispatch } from "@/store";

type FodType = {
  id?: number;
  FodId?: number;
  FodPoint?: string;
  status?: string;
  imgModal?: boolean;
  groupStatus?: string;
  groupId: number;
  sysid?: string;
};

import Fodcard from "./FodCards/FodCard";
import { FiltersCheck, sortByFilter } from "../../utils/FiltersCheck";
import { RootState } from "@/store";
import { updateDetailViewFod } from "@/store/actions/FodDetailedView";
import { Grid } from "react-window";

interface FodCellData {
  items: FodType[];
  columnCount: number;
  missionNumber: any;
  onDetailView: (fod: FodType) => void;
}

const TARGET_MIN_COLUMN_WIDTH = 195;
const ITEM_HEIGHT = 266;
const GPS_SORT_MIN_MOVE_METERS = 3;
const GPS_SORT_THROTTLE_MS = 2500;

function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const FodGridCell = ({
  columnIndex,
  rowIndex,
  style,
  items,
  columnCount,
  missionNumber,
  onDetailView,
}: {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
} & FodCellData) => {
  const idx = rowIndex * columnCount + columnIndex;

  if (!items || idx >= items.length) return null;

  const fod = items[idx];

  return (
    <div
      style={{
        ...style,
        padding: 6,
        boxSizing: "border-box",
      }}
      className="flex items-center justify-center"
    >
      <Fodcard
        key={fod.groupId ?? fod.id}
        fod={fod}
        missionNumber={missionNumber}
        handleDetailViewRequest={onDetailView}
      />
    </div>
  );
};

const FodDisplay = ({
  onGridWidthChange,
}: {
  onGridWidthChange?: (width: number) => void;
}) => {
  const dispatch = useDispatch<AppDispatch>();

  const fods = useSelector(
    (state: RootState) => state.FodReducer.fods
  );

  const filters = useSelector(
    (state: RootState) => state.FodReducer.filters
  );

  const missionNumber = useSelector(
    (state: RootState) => state.MissionState?.missionNumber
  );

  const groupStatus = filters.groupStatus || "NEW";
  const isSortingByDistance = filters.sortby === "nearestFirst";

  const liveLocation = useSelector(
    (state: RootState) => {
      if (!isSortingByDistance) return null;

      const primary = (
        state.SystemHealth.carData?.data as any
      )?.primary_data;

      if (
        typeof primary?.lat !== "number" ||
        typeof primary?.lon !== "number"
      ) {
        return null;
      }

      return {
        lat: primary.lat,
        lon: primary.lon,
      };
    },
    shallowEqual
  );

  // Throttle distance-sorted recomputation on live 10Hz RTK ticks:
  // only update when GPS moves >= 3m and at most once every 2.5s.
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const lastSortLocRef = useRef<{
    lat: number;
    lon: number;
    ts: number;
  } | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSortingByDistance || !liveLocation) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      if (!isSortingByDistance) {
        lastSortLocRef.current = null;
        setCurrentLocation(null);
      }
      return;
    }

    const now = Date.now();
    const prev = lastSortLocRef.current;

    if (!prev) {
      lastSortLocRef.current = { ...liveLocation, ts: now };
      setCurrentLocation(liveLocation);
      return;
    }

    const movedMeters = haversineMeters(prev, liveLocation);
    if (movedMeters < GPS_SORT_MIN_MOVE_METERS) {
      return;
    }

    const elapsed = now - prev.ts;
    if (elapsed >= GPS_SORT_THROTTLE_MS) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      lastSortLocRef.current = { ...liveLocation, ts: now };
      setCurrentLocation(liveLocation);
    } else if (!throttleTimerRef.current) {
      const latest = liveLocation;
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
        lastSortLocRef.current = { ...latest, ts: Date.now() };
        setCurrentLocation(latest);
      }, GPS_SORT_THROTTLE_MS - elapsed);
    }
  }, [isSortingByDistance, liveLocation]);

  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);

  // Measure the actual FOD grid container.
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const filteredFods = useMemo(() => {
    const byStatus: FodType[] = [];

    for (let i = 0; i < fods.length; i++) {
      const fod = fods[i];

      if (
        fod.groupStatus === groupStatus &&
        FiltersCheck(fod, filters)
      ) {
        byStatus.push(fod);
      }
    }

    return sortByFilter(
      filters,
      byStatus,
      currentLocation
    );
  }, [
    fods,
    groupStatus,
    filters,
    currentLocation,
  ]);

  // Calculate columns from the available panel width (reserving space for the 16px vertical scrollbar).
  const availableGridWidth = Math.max(0, containerWidth - 16);
  const columnCount = Math.max(
    1,
    Math.floor(availableGridWidth / TARGET_MIN_COLUMN_WIDTH)
  );
  const columnWidth =
    availableGridWidth > 0
      ? Math.floor(availableGridWidth / columnCount)
      : 225;

  useEffect(() => {
    if (!onGridWidthChange || containerWidth <= 0) return;
    onGridWidthChange(columnCount * columnWidth);
  }, [columnCount, columnWidth, containerWidth, onGridWidthChange]);

  const rowCount = Math.ceil(
    filteredFods.length / columnCount
  );

  const handleDetailViewRequest = React.useCallback(
    (fod: FodType) => {
      dispatch(updateDetailViewFod(fod, false));
    },
    [dispatch]
  );

  // Observe panel resizing.
  useEffect(() => {
    const element = gridContainerRef.current;

    if (!element) return;

    const updateWidth = () => {
      setContainerWidth(element.clientWidth);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;

      if (typeof width === "number") {
        setContainerWidth(width);
      }
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const cellProps = useMemo<FodCellData>(
    () => ({
      items: filteredFods,
      columnCount,
      missionNumber,
      onDetailView: handleDetailViewRequest,
    }),
    [
      filteredFods,
      columnCount,
      missionNumber,
      handleDetailViewRequest,
    ]
  );

  return (
    <div
      ref={gridContainerRef}
      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden select-none"
    >
      {filteredFods.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center text-sm font-medium text-slate-400 dark:text-slate-500 select-none">
          No FODs match the selected filter
        </div>
      ) : (
        <Grid
          cellComponent={FodGridCell as any}
          cellProps={cellProps}
          columnCount={columnCount}
          rowCount={rowCount}
          columnWidth={columnWidth}
          rowHeight={ITEM_HEIGHT + 12}
          overscanCount={2}
          style={{
            height: "100%",
            width: containerWidth > 0 ? Math.min(containerWidth, columnCount * columnWidth + 16) : "100%",
            overflowX: "hidden",
            margin: "0 auto",
          }}
        />
      )}
    </div>
  );
};

export default FodDisplay;
