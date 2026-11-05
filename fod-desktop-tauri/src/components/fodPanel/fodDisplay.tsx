'use client'
import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { AppDispatch } from "@/store";
// Use the Fod interface from fodReducer-slice, where id is number
type FodType = {
  id?: number;
  FodId?: number;
  FodPoint?: string;
  // Other fod properties
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
// react-window v2: FixedSizeGrid was removed — the v2 <Grid> takes
// cellComponent/cellProps and auto-sizes to its container.
import { Grid } from "react-window";

interface FodCellData {
  items: FodType[];
  columnCount: number;
  missionNumber: any;
  onDetailView: (fod: FodType) => void;
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
    <div style={{ ...style, padding: 8, boxSizing: "border-box" }} className="flex justify-center items-center">
      <Fodcard key={fod.id} fod={fod} missionNumber={missionNumber} handleDetailViewRequest={onDetailView} />
    </div>
  );
};

const FodDisplay = () => {
  const dispatch = useDispatch<AppDispatch>();
  const fods = useSelector((state: RootState) => state.FodReducer.fods);
  const filters = useSelector((state: RootState) => state.FodReducer.filters);
  const missionNumber = useSelector((state: RootState) => state.MissionState?.missionNumber);
  const groupStatus = filters.groupStatus || "NEW";
  const isSortingByDistance = filters.sortby === "nearestFirst";

  // Subscribe to car coordinates ONLY when sorting by nearestFirst, rounded to 4 decimals (~11m)
  // so 10Hz telemetry jitter never forces 25,000 FODs to re-sort every 100ms.
  const currentLocation = useSelector((state: RootState) => {
    if (!isSortingByDistance) return null;
    const primary = (state.SystemHealth.carData?.data as any)?.primary_data;
    if (typeof primary?.lat !== "number" || typeof primary?.lon !== "number") return null;
    return {
      lat: Math.round(primary.lat * 10000) / 10000,
      lon: Math.round(primary.lon * 10000) / 10000,
    };
  }, shallowEqual);

  const [columnCount, setColumnCount] = useState(3);

  // Defer massive array updates so UI interactions (clicks, tabs, scrolling) stay immediate
  const deferredFods = useDeferredValue(fods);
  const deferredFilters = useDeferredValue(filters);
  const deferredGroupStatus = deferredFilters.groupStatus || groupStatus;

  const filteredFods = useMemo(() => {
    const byStatus: FodType[] = [];
    for (let i = 0; i < deferredFods.length; i++) {
      const f = deferredFods[i];
      if (f.groupStatus === deferredGroupStatus && FiltersCheck(f, deferredFilters)) {
        byStatus.push(f);
      }
    }
    return sortByFilter(deferredFilters, byStatus, currentLocation);
  }, [deferredFods, deferredGroupStatus, deferredFilters, currentLocation]);

  const itemWidth = 225;
  const itemHeight = 350;
  const rowCount = Math.ceil(filteredFods.length / columnCount);

  const handleDetailViewRequest = React.useCallback(
    (fod: FodType) => {
      dispatch(updateDetailViewFod(fod, false));
    },
    [dispatch]
  );

  useEffect(() => {
    const updateColumnCount = () => {
      const width = window.innerWidth;
      if (width < 800) setColumnCount(2);
      else if (width < 1050) setColumnCount(3);
      else if (width < 1300) setColumnCount(4);
      else if (width < 1600) setColumnCount(5);
      else if (width < 1900) setColumnCount(6);
      else setColumnCount(7);
    };

    updateColumnCount(); // Set initially
    window.addEventListener("resize", updateColumnCount);

    return () => window.removeEventListener("resize", updateColumnCount);
  }, []);

  const cellProps = useMemo<FodCellData>(
    () => ({
      items: filteredFods,
      columnCount,
      missionNumber,
      onDetailView: handleDetailViewRequest,
    }),
    [filteredFods, columnCount, missionNumber, handleDetailViewRequest]
  );

  if (filteredFods.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm font-medium text-slate-400 dark:text-slate-500 select-none">
        No FODs match the selected filter
      </div>
    );
  }

  return (
    <div className="w-full h-full relative overflow-hidden select-none">
      <Grid
        cellComponent={FodGridCell as any}
        cellProps={cellProps}
        columnCount={columnCount}
        rowCount={rowCount}
        columnWidth={itemWidth + 16}
        rowHeight={itemHeight + 16}
        overscanCount={2}
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  );


  // return (
  //   <div className="absolute w-full h-[90%] flex flex-wrap gap-2.5 top-[70px] overflow-y-scroll select-none px-[5px]">
  //     {fodData.map((fod, index) => {
  //       if (fod.groupStatus == (!!groupStatus ? groupStatus : "NEW")) {
  //         return <Fodcard key={fod.id} fod={fod} handleDetailViewRequest={handleDetailViewRequest} />
  //       }
  //     }
  //     )}
  //   </div>
  // );
};

export default FodDisplay;


