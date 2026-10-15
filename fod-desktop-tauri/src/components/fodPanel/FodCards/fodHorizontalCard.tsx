import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { ImUndo2 } from "react-icons/im";
import Image from "next/image.js";
import { updateSelectedFod } from "@/store/actions/SelectedFod";
import { AppDispatch } from "@/store/index.js";
import { updateClearedDetailViewFod } from "@/store/actions/ClearedFodDetailView";
import { undoFod } from "@/store/actions/FodActions";
import MapMode from '@/assets/images/svg/MissionControl/MapMode.svg';
import { config } from "@/config/clientConfig";

const FodHorizontalcard = ({ fod,selectedMission,openMapAndSelectFod,actionOnCard }:any) => {
  const dispatch = useDispatch<AppDispatch>();
  const canUndo = fod.groupStatus !== "CLEARED";
  const { frame } = fod;
  const base64String = frame

  return (
    <div className="h-40 w-full p-2.5">
      <div className="h-full w-full flex overflow-hidden rounded-lg bg-[#FBFBFC] active:scale-95" onClick={() => actionOnCard(fod)}>
        <div className="relative h-full w-1/2">
          <Image src={`${config.ImagesBase}/${selectedMission.id}/${fod.groupId}/${fod.id}.jpg`} className="h-full w-full object-cover object-center" draggable={false} alt={""} width={100} height={100}/>
          <div className="absolute top-1.5 w-full h-7 px-1.5 flex justify-between items-center">
            <div className="text-white font-bold text-xl px-2 bg-gray-600 rounded-full bg-opacity-30">{fod.groupId}</div>
            {canUndo ? 
              <ImUndo2 className="cursor-pointer h-5 w-5 mr-1" onClick={() => dispatch(undoFod(fod))} /> : 
              <Image src={MapMode} onClick={() => openMapAndSelectFod()} className="cursor-pointer" alt={""} width={35} height={35} />
            }
          </div>
        </div>
        <div className="h-full w-1/2 flex flex-col justify-between items-center p-2.5">
          <div className="w-full h-1/5 flex justify-between text-[#696972]">
            <span>CAM ID</span>
            <span>{fod.sysid}</span>
          </div>
          <div className="w-full h-1/5 flex justify-between text-[#696972]">
            <span>Size</span>
            <span>{fod.size}</span>
          </div>
          {/* <div className="w-full h-1/5 flex justify-between text-[#696972]">
            <span>Risk</span>
            <span>{Fod_Riskfactor(fod)}</span>
          </div> */}
          <div className="w-full h-1/5 flex justify-between text-[#696972]">
            <span>Vel</span>
            <span>{(fod.velocity)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FodHorizontalcard;
