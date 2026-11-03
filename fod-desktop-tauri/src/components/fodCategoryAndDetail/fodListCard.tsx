import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { Fod_FodId, Fod_Velocity } from "../../utils/FodParser.js";
import { ImUndo2 } from "react-icons/im";
import Image from "next/image.js";
import { updateSelectedFod } from "@/store/actions/SelectedFod";
import { AppDispatch, RootState } from "@/store/index.js";
import { updateClearedDetailViewFod } from "@/store/actions/ClearedFodDetailView";
import { undoFod } from "@/store/actions/FodActions";
import MapMode from '@/assets/images/svg/MissionControl/MapMode.svg';
import { set_Mapview } from "@/store/slices/mapReducer-slice";
import { config } from "@/config/clientConfig";

const FodListcard = ({ fod }: any) => {
  const dispatch = useDispatch<AppDispatch>();
  const missionState = useSelector((store: RootState) => store.MissionState);
  const canUndo = fod.groupStatus !== "CLEARED";

  const openMapAndSelectFod = () => {
    dispatch(updateSelectedFod(fod) as any);
    dispatch(set_Mapview());
  };

  const handleWhichDetailViewToOpen = (fod: any, notClearedFod: any) => {
    if (notClearedFod) {
      dispatch(updateSelectedFod(fod) as any);
    } else {
      dispatch(updateClearedDetailViewFod(fod));
    }
  };

  return (
    <div className="w-full p-2">
      <div
        className="w-full flex h-[100px] overflow-hidden rounded-xl bg-[#1E232B] border border-[#2B3542] hover:border-slate-500 transition-all cursor-pointer active:scale-[0.99]"
        onDoubleClick={() => handleWhichDetailViewToOpen(fod, canUndo)}
      >
        <div className="relative h-full w-[45%] bg-slate-900 shrink-0">
          <Image
            src={`${config.ImagesBase}/${missionState.missionNumber}/${fod.groupId}/${fod.id}.jpg`}
            className="h-full w-full object-cover object-center"
            draggable={false}
            alt=""
            width={120}
            height={100}
          />
          <div className="absolute top-1.5 left-1.5 right-1.5 flex justify-between items-center">
            <div className="text-white font-bold text-xs px-2 py-0.5 bg-black/70 rounded-full font-mono backdrop-blur-xs">
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
              <Image
                src={MapMode}
                onClick={(e) => {
                  e.stopPropagation();
                  openMapAndSelectFod();
                }}
                className="cursor-pointer brightness-200"
                alt=""
                width={20}
                height={20}
              />
            )}
          </div>
        </div>
        <div className="h-full flex-1 flex flex-col justify-center px-3 py-2 text-xs">
          <div className="flex justify-between items-center py-0.5">
            <span className="text-[#7E8691] font-medium">CAM ID</span>
            <span className="text-slate-200 font-semibold">{fod.sysid || '-'}</span>
          </div>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-[#7E8691] font-medium">Size</span>
            <span className="text-slate-200 font-semibold">{fod.size ? `${fod.size} mm` : '-'}</span>
          </div>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-[#7E8691] font-medium">Vel</span>
            <span className="text-slate-200 font-semibold">{Fod_Velocity(fod)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FodListcard;
