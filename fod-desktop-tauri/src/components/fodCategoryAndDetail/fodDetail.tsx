import React, { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Fod_FodId, Fod_CamId, Fod_Size, Fod_Velocity } from "@/utils/FodParser";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { HiOutlineCheck } from "react-icons/hi";
import { RxCross1 } from "react-icons/rx";
import { BsCamera } from "react-icons/bs";
import { GiCardPickup } from "react-icons/gi";
import { close_SideBarFodDetail, selectFrame_SideBar } from "@/store/slices/selectedFod-slice";
import { distanceBwCollectorAndFod } from "@/utils/MapUtils";
import { setFodStatus } from "@/store/actions/SelectedFod";
import Image from "next/image";
import { AppDispatch, RootState } from "@/store";
import { fod } from "@/types/fod";
import { open_webcam } from "@/store/slices/webCam-slice";
import { sendFodReport, setFodFinalReview } from "@/store/actions/WebCam";
import { base64decodedFrame, decodeFods } from "@/utils/DecodeFrames";
import Distance from "./fodCategoryDistance";
import Supercluster from 'supercluster';
import { config } from "@/config/clientConfig";

const FodDetail = ({ }) => {
  const dispatch = useDispatch<AppDispatch>();
  // const [distance, setDistance] = useState<string | null>(null);
  const { fod, FodStatus, selectedFrame, origin } = useSelector((state: RootState) => state.SelectedFod);
  // Type assertion for fod and FodPoint
  const safeFod = fod as any;
  const groupStatus = safeFod?.groupStatus ?? '';
  const isClearedFod = groupStatus === "CLEARED";
  const { isFodFinalReviewOpen } = useSelector((state: RootState) => state.WebCam);

  const fodStatusStyle = (val: number) => {
    let background = 'bg-[#EBEBEB]', textColor = 'text-black';
    if (val === FodStatus) {
      background = 'bg-[#017ED7]';
      textColor = 'text-white';
    }
    return `${background} ${textColor}`;
  };

  const supercluster = useRef(null);

  useEffect(() => {
    supercluster.current = new Supercluster({
      radius: 60, // cluster radius in pixels
      maxZoom: 20
    });
    if (supercluster.current) {
      const points = safeFod?.FodPoint?.map(point => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [point.longitude, point.latitude]
        },
        properties: point
      })) || [];
      supercluster.current.load(points);
    }
  }, [safeFod]);

  return (
    <div className={`h-full w-full px-3 py-3 flex flex-col justify-between bg-[#FCFCFC] text-[#696972] font-semibold overflow-y-auto`}>
      <div className="w-full flex flex-col gap-2">
        <div className="w-full flex justify-between items-center text-xl flex-shrink-0">
          <div className="flex items-center gap-1">
            {!isFodFinalReviewOpen && <MdKeyboardArrowLeft className="text-2xl cursor-pointer" onClick={() => dispatch(close_SideBarFodDetail())} />}
            <div>
              {Fod_FodId(fod)}
            </div>
          </div>
          {`${origin}` == 'backend' ?
            <div className="w-[70px] h-[26px] bg-green-500 rounded"></div> :
            <div className="w-[70px] h-[26px] bg-yellow-500 rounded"></div>
          }
        </div>
        <FodGrid />
        <div className="w-full flex flex-col gap-1.5 text-xs flex-shrink-0">
          <div className="w-full bg-[#F7F7F7] rounded-md flex justify-between items-center px-2 py-1.5">
            <span>Cam Id</span><span>{!!selectedFrame ? (selectedFrame as any).sysid : (!!safeFod?.FodPoint && Array.isArray(safeFod.FodPoint) ? safeFod.FodPoint[0]?.sysid : "")}</span>
          </div>
          <div className="w-full bg-[#F7F7F7] rounded-md flex justify-between items-center px-2 py-1.5">
            <span>Size</span><span>{!!selectedFrame ? Math.floor((selectedFrame as any).size) : (!!safeFod?.FodPoint && Array.isArray(safeFod.FodPoint) ? Math.floor(safeFod.FodPoint[0]?.size ?? 0) : "")}mm</span>
          </div>
          <div className="w-full bg-[#F7F7F7] rounded-md flex justify-between items-center px-2 py-1.5">
            <span>Class</span><span>{!!selectedFrame ? (selectedFrame as any).class : (!!safeFod?.FodPoint && Array.isArray(safeFod.FodPoint) ? safeFod.FodPoint[0]?.class : "")}</span>
          </div>
          <div className="w-full bg-[#F7F7F7] rounded-md flex justify-between items-center px-2 py-1.5">
            <span>Velocity</span><span>{!!selectedFrame ? Math.floor((selectedFrame as any).velocity) : (!!safeFod?.FodPoint && Array.isArray(safeFod.FodPoint) ? Math.floor(safeFod.FodPoint[0]?.velocity ?? 0) : "")}Km/h</span>
          </div>
          <div className="w-full bg-[#F7F7F7] rounded-md flex justify-between items-center px-2 py-1.5">
            <span>Distance</span><span><Distance /></span>
          </div>
        </div>
      </div>

      {!isClearedFod && (
        <div className="w-full flex flex-col gap-2 mt-auto pt-2 flex-shrink-0">
          <div className="w-full h-[36px] flex justify-between items-center gap-1.5">
            <button className={`h-full flex-1 flex flex-col justify-center items-center rounded text-xs ${fodStatusStyle(1)}`} onClick={() => dispatch(setFodStatus(1) as any)}><span>FOD</span><span>Found</span></button>
            <button className={`h-full flex-1 flex flex-col justify-center items-center rounded text-xs ${fodStatusStyle(3)}`} onClick={() => dispatch(setFodStatus(3) as any)}><span>Not</span><span>Found</span></button>
            <button className={`h-full flex-1 flex flex-col justify-center items-center rounded text-xs ${fodStatusStyle(2)}`} onClick={() => dispatch(setFodStatus(2) as any)}><span>False</span><span>Found</span></button>
          </div>
          <div className="w-full h-[36px] flex justify-center gap-2">
            {isFodFinalReviewOpen ?
              <>
                <button className="h-full flex-1 flex justify-center items-center bg-[#017ED7] text-white rounded-md gap-1 font-medium hover:bg-[#016ec0] transition-colors" onClick={() => dispatch(sendFodReport(true))}>
                  <HiOutlineCheck className="text-xl" /><span>Send</span>
                </button>
                <button className="h-full flex-1 flex justify-center items-center border border-[#696972] text-[#696972] rounded-md gap-1 font-medium hover:bg-gray-100 transition-colors" onClick={() => dispatch(setFodFinalReview(false))}>
                  <RxCross1 className="text-xl" /><span>Cancel</span>
                </button>
              </> :
              <>
                <button className="h-full flex-1 flex justify-center items-center bg-[#002756] text-white rounded-md gap-1 font-medium hover:bg-[#001f44] transition-colors" onClick={() => dispatch(open_webcam())}>
                  <BsCamera className="h-4 w-auto" /><span>Camera</span>
                </button>
                <button className="h-full flex-1 flex justify-center items-center bg-[#017ED7] text-white rounded-md gap-1 font-medium hover:bg-[#016ec0] transition-colors" onClick={() => dispatch(setFodFinalReview(true))}>
                  <GiCardPickup className="h-4 w-auto" /><span>Clear FOD</span>
                </button>
              </>
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default FodDetail;

export const FodGrid = () => {
  const dispatch = useDispatch();
  const missionState = useSelector((store: RootState) => store.MissionState);
  const fod = useSelector((state: RootState) => state.SelectedFod.fod);
  const selectedFrame = useSelector((state: RootState) => state.SelectedFod.selectedFrame);
  const updateSelectedFrame = (frame: any) => {
    dispatch(selectFrame_SideBar(frame))
  }
  // Type assertion for FodPoint
  const FodPointArr = (fod?.FodPoint && Array.isArray(fod.FodPoint)) ? fod.FodPoint : [];
  const points = FodPointArr.map(fod => ({
    type: 'Feature',
    properties: { ...fod },
    geometry: {
      type: 'Point',
      coordinates: [fod.location.lon, fod.location.lat]
    }
  }));
  return (
    <div className="w-full h-[150px] max-h-[160px] bg-[#EBEBEB] rounded-md p-1.5 overflow-y-auto space-y-1.5 flex-shrink-0">
      {FodPointArr.map((f: any, index: number) => (
        <div key={index} className={`${index === 0 ? "border-2 border-black" : selectedFrame?.id == f.id ? "border-2 border-green-500 " : ""} w-full h-[130px] rounded overflow-hidden cursor-pointer`} onClick={() => updateSelectedFrame(f)}>
          <Image src={`${config.ImagesBase}/${missionState.missionNumber}/${f.groupId}/${f.id}.jpg`} className="w-full h-full object-contain object-center" alt="FOD frame" width={100} height={100} />
        </div>
      ))}
    </div>
  );
};
