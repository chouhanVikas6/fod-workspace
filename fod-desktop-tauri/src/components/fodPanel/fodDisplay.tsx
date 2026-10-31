'use client'
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { AppDispatch } from "@/store";
// import Fodcard from "./FodCards/FodCard";
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
// const Fodcard = dynamic(() => import("./FodCards/FodCard.jsx") as unknown as Promise<{ default: React.ComponentType<{ fod: FodType; handleDetailViewRequest: (fod: FodType) => void }> }>, {
//   loading: () => <div className={`h-[210px] w-[180px] min-w-[180px] relative text-[#E2E2E2] mt-4 mb-2 transition-transform duration-200 transform hover:scale-[103%] active:scale-100  bg-gray-300 rounded`}><CircleLoader /></div>,
// })
import Fodcard from "./FodCards/FodCard";
import { FiltersCheck, sortByFilter } from "../../utils/FiltersCheck";
import dynamic from "next/dynamic";
import { RootState } from "@/store";
import { updateDetailViewFod } from "@/store/actions/FodDetailedView";
import Loader, { CircleLoader } from "../commen/loader";
// react-window v2: FixedSizeGrid was removed — the v2 <Grid> takes
// cellComponent/cellProps and auto-sizes to its container.
import { Grid } from "react-window";
// import { updateDetailViewFod } from "../../redux/actions/FodDetailedView";
// import FodWorker from '../../workers/fodWorker.worker';



interface FodCellData {
  items: FodType[];
  columnCount: number;
  onDetailView: (fod: FodType) => void;
}

const FodGridCell = ({
  columnIndex,
  rowIndex,
  style,
  items,
  columnCount,
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
    <div style={{ ...style, padding: 10, boxSizing: "border-box" }} className="flex justify-center items-center">
      <Fodcard key={fod.id} fod={fod} handleDetailViewRequest={onDetailView} />
    </div>
  );
};

const FodDisplay = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { fods } = useSelector((state: RootState) => state.FodReducer);
  const filters = useSelector((state: RootState) => state.FodReducer.filters);
  const { groupStatus } = useSelector((state: RootState) => state.FodReducer.filters);
  const carPrimary = useSelector((state: RootState) => (state.SystemHealth.carData?.data as any)?.primary_data);
  const [columnCount, setColumnCount] = useState(3); // Default

  // Only subscribe to location changes if actually sorting by distance
  const isSortingByDistance = filters.sortby === 'nearestFirst';
  const currentLocation = useMemo(
    () => (isSortingByDistance && carPrimary?.lat ? { lat: carPrimary.lat, lon: carPrimary.lon } : null),
    [isSortingByDistance, carPrimary?.lat, carPrimary?.lon]
  );

  const filteredFods = useMemo(() => {
    const byStatus = fods.filter((f) => f.groupStatus === groupStatus && FiltersCheck(f, filters));
    return sortByFilter(filters, byStatus, currentLocation);
  }, [fods, groupStatus, filters, currentLocation]);

  const itemWidth = 180;
  const itemHeight = 210;
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
      if (width < 768) setColumnCount(2); // Tablet
      else if (width < 1000) setColumnCount(3);
      else if (width < 1260) setColumnCount(4);
      else if (width < 1501) setColumnCount(5); // Laptop
      else if (width < 1750) setColumnCount(6);
      else setColumnCount(7); // Desktop
    };

    updateColumnCount(); // Set initially
    window.addEventListener("resize", updateColumnCount);

    return () => window.removeEventListener("resize", updateColumnCount);
  }, []);

  const cellProps = useMemo<FodCellData>(
    () => ({
      items: filteredFods,
      columnCount,
      onDetailView: handleDetailViewRequest,
    }),
    [filteredFods, columnCount, handleDetailViewRequest]
  );

  return (
    <div className="absolute w-full h-[90%] top-[70px] overflow-hidden select-none px-[5px]">
      <Grid
        cellComponent={FodGridCell as any}
        cellProps={cellProps}
        columnCount={columnCount}
        rowCount={rowCount}
        columnWidth={itemWidth + 20}
        rowHeight={itemHeight + 20}
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


