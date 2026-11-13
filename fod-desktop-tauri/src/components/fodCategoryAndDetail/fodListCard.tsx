
import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { Fod_FodId, Fod_Velocity } from "../../utils/FodParser.js";
import { ImUndo2 } from "react-icons/im";
import Image from "next/image.js";
import { updateSelectedFod } from "@/store/actions/SelectedFod";
import { AppDispatch, RootState } from "@/store/index.js";
import { updateClearedDetailViewFod } from "@/store/actions/ClearedFodDetailView";
import { undoFod } from "@/store/actions/FodActions";
import MapMode from "@/assets/images/svg/MissionControl/MapMode.svg";
import { set_Mapview } from "@/store/slices/mapReducer-slice";
import { config } from "@/config/clientConfig";

const FodListcard = ({ fod }: any) => {
  const dispatch = useDispatch<AppDispatch>();
  const missionState = useSelector(
    (store: RootState) => store.MissionState
  );

  const canUndo = fod.groupStatus !== "CLEARED";

  const openMapAndSelectFod = () => {
    dispatch(updateSelectedFod(fod) as any);
    dispatch(set_Mapview());
  };

  const handleWhichDetailViewToOpen = (
    fod: any,
    notClearedFod: any
  ) => {
    if (notClearedFod) {
      dispatch(updateSelectedFod(fod) as any);
    } else {
      dispatch(updateClearedDetailViewFod(fod));
    }
  };

  const size = Number(fod.size);
  const formattedSize = Number.isFinite(size)
    ? `${size.toFixed(2)} mm`
    : "-";

  return (
    <div className="w-full p-2">
      <div
        className="
          w-full flex h-[100px] overflow-hidden rounded-xl
          bg-white dark:bg-[#1E232B]
          border border-slate-200 dark:border-[#2B3542]
          hover:border-slate-300 dark:hover:border-slate-500
          shadow-sm dark:shadow-none
          transition-all cursor-pointer active:scale-[0.99]
        "
        onDoubleClick={() =>
          handleWhichDetailViewToOpen(fod, canUndo)
        }
      >
        {/* Image Section */}
        <div className="relative h-full w-[45%] bg-slate-100 dark:bg-slate-900 shrink-0">
          <Image
            src={`${config.ImagesBase}/${missionState.missionNumber}/${fod.groupId}/${fod.id}.jpg`}
            className="h-full w-full object-cover object-center"
            draggable={false}
            alt=""
            width={120}
            height={100}
          />

          {/* Image Actions */}
          <div className="absolute top-1.5 left-1.5 right-1.5 flex justify-between items-center">
            <div className="text-white font-bold text-[10px] min-[900px]:text-xs px-2 py-0.5 bg-black/70 rounded-full font-mono backdrop-blur-xs">
              {Fod_FodId(fod)}
            </div>

            {canUndo ? (
              <button
                type="button"
                title="Undo"
                className="p-1 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(undoFod(fod));
                }}
              >
                <ImUndo2 className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                title="View on map"
                className="p-0.5 rounded bg-black/50 hover:bg-black/80 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  openMapAndSelectFod();
                }}
              >
                <Image
                  src={MapMode}
                  className="brightness-200"
                  alt="View on map"
                  width={18}
                  height={18}
                />
              </button>
            )}
          </div>
        </div>

        {/* FOD Information */}
        <div className="h-full min-w-0 flex-1 flex flex-col justify-center px-2 min-[900px]:px-3 py-2 text-[10px] min-[900px]:text-xs">
          {/* CAM ID */}
          <div className="flex justify-between items-center gap-1 py-0.5 min-w-0">
            <span className="text-slate-500 dark:text-[#7E8691] font-medium shrink-0">
              CAM ID
            </span>
            <span className="text-slate-800 dark:text-slate-200 font-semibold truncate text-right min-w-0">
              {fod.sysid || "-"}
            </span>
          </div>

          {/* Size */}
          <div className="flex justify-between items-center gap-1 py-0.5 min-w-0">
            <span className="text-slate-500 dark:text-[#7E8691] font-medium shrink-0">
              Size
            </span>
            <span className="text-slate-800 dark:text-slate-200 font-semibold truncate text-right min-w-0">
              {fod.size !== undefined &&
              fod.size !== null &&
              fod.size !== ""
                ? formattedSize
                : "-"}
            </span>
          </div>

          {/* Velocity */}
          <div className="flex justify-between items-center gap-1 py-0.5 min-w-0">
            <span className="text-slate-500 dark:text-[#7E8691] font-medium shrink-0">
              Vel
            </span>
            <span className="text-slate-800 dark:text-slate-200 font-semibold truncate text-right min-w-0">
              {Fod_Velocity(fod)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FodListcard;
