
import React, { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Fod_FodId,
} from "@/utils/FodParser";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { HiOutlineCheck } from "react-icons/hi";
import { RxCross1 } from "react-icons/rx";
import { BsCamera } from "react-icons/bs";
import { GiCardPickup } from "react-icons/gi";
import {
  close_SideBarFodDetail,
  selectFrame_SideBar,
} from "@/store/slices/selectedFod-slice";
import { setFodStatus } from "@/store/actions/SelectedFod";
import Image from "next/image";
import { AppDispatch, RootState } from "@/store";
import { open_webcam } from "@/store/slices/webCam-slice";
import { sendFodReport, setFodFinalReview } from "@/store/actions/WebCam";
import Distance from "./fodCategoryDistance";
import Supercluster from "supercluster";
import { config } from "@/config/clientConfig";

const FodDetail = () => {
  const dispatch = useDispatch<AppDispatch>();

  const { fod, FodStatus, selectedFrame, origin } = useSelector(
    (state: RootState) => state.SelectedFod
  );

  const safeFod = fod as any;
  const groupStatus = safeFod?.groupStatus ?? "";
  const isClearedFod = groupStatus === "CLEARED";

  const { isFodFinalReviewOpen } = useSelector(
    (state: RootState) => state.WebCam
  );

  const fodStatusStyle = (val: number) => {
    const isActive = val === FodStatus;

    return isActive
      ? "bg-[#017ED7] text-white border-[#017ED7]"
      : "bg-slate-100 dark:bg-[#202632] text-slate-700 dark:text-[#D9DDE2] border-slate-200 dark:border-[#2B3542] hover:bg-slate-200 dark:hover:bg-[#29313D]";
  };

  const supercluster = useRef<any>(null);

  useEffect(() => {
    supercluster.current = new Supercluster({
      radius: 60,
      maxZoom: 20,
    });

    if (supercluster.current) {
      const points =
        safeFod?.FodPoint?.map((point: any) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [point.longitude, point.latitude],
          },
          properties: point,
        })) || [];

      supercluster.current.load(points);
    }
  }, [safeFod]);

  return (
    <div className="h-full w-full min-w-0 px-2 sm:px-3 py-2 sm:py-3 flex flex-col justify-between bg-white dark:bg-[#181C23] text-slate-700 dark:text-[#D9DDE2] font-semibold overflow-y-auto transition-colors">
      <div className="w-full min-w-0 flex flex-col gap-2">
        {/* Header */}
        <div className="w-full flex justify-between items-center text-base sm:text-xl shrink-0 text-slate-900 dark:text-white">
          <div className="flex items-center gap-1 min-w-0">
            {!isFodFinalReviewOpen && (
              <MdKeyboardArrowLeft
                className="text-2xl shrink-0 cursor-pointer text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors"
                onClick={() => dispatch(close_SideBarFodDetail())}
              />
            )}

            <div className="font-bold truncate">
              {Fod_FodId(fod)}
            </div>
          </div>

          {`${origin}` === "backend" ? (
            <div className="w-12 sm:w-[70px] h-6 sm:h-[26px] bg-emerald-500 rounded shrink-0" />
          ) : (
            <div className="w-12 sm:w-[70px] h-6 sm:h-[26px] bg-amber-500 rounded shrink-0" />
          )}
        </div>

        <FodGrid />

        {/* FOD information */}
        <div className="w-full min-w-0 flex flex-col gap-1.5 text-[11px] sm:text-xs shrink-0">
          <div className="w-full min-w-0 bg-slate-50 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] rounded-md flex justify-between items-center gap-2 px-2 sm:px-2.5 py-1.5">
            <span className="text-slate-500 dark:text-[#7E8691] shrink-0">
              Cam Id
            </span>
            <span className="text-slate-900 dark:text-white font-medium truncate text-right">
              {!!selectedFrame
                ? (selectedFrame as any).sysid
                : !!safeFod?.FodPoint && Array.isArray(safeFod.FodPoint)
                  ? safeFod.FodPoint[0]?.sysid
                  : ""}
            </span>
          </div>

          <div className="w-full min-w-0 bg-slate-50 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] rounded-md flex justify-between items-center gap-2 px-2 sm:px-2.5 py-1.5">
            <span className="text-slate-500 dark:text-[#7E8691] shrink-0">
              Size
            </span>
            <span className="text-slate-900 dark:text-white font-medium truncate text-right">
              {!!selectedFrame
                ? Math.floor((selectedFrame as any).size)
                : !!safeFod?.FodPoint && Array.isArray(safeFod.FodPoint)
                  ? Math.floor(safeFod.FodPoint[0]?.size ?? 0)
                  : ""}
              mm
            </span>
          </div>

          <div className="w-full min-w-0 bg-slate-50 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] rounded-md flex justify-between items-center gap-2 px-2 sm:px-2.5 py-1.5">
            <span className="text-slate-500 dark:text-[#7E8691] shrink-0">
              Class
            </span>
            <span className="text-slate-900 dark:text-white font-medium truncate text-right">
              {!!selectedFrame
                ? (selectedFrame as any).class
                : !!safeFod?.FodPoint && Array.isArray(safeFod.FodPoint)
                  ? safeFod.FodPoint[0]?.class
                  : ""}
            </span>
          </div>

          <div className="w-full min-w-0 bg-slate-50 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] rounded-md flex justify-between items-center gap-2 px-2 sm:px-2.5 py-1.5">
            <span className="text-slate-500 dark:text-[#7E8691] shrink-0">
              Velocity
            </span>
            <span className="text-slate-900 dark:text-white font-medium truncate text-right">
              {!!selectedFrame
                ? Math.floor((selectedFrame as any).velocity)
                : !!safeFod?.FodPoint && Array.isArray(safeFod.FodPoint)
                  ? Math.floor(safeFod.FodPoint[0]?.velocity ?? 0)
                  : ""}
              Km/h
            </span>
          </div>

          <div className="w-full min-w-0 bg-slate-50 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] rounded-md flex justify-between items-center gap-2 px-2 sm:px-2.5 py-1.5">
            <span className="text-slate-500 dark:text-[#7E8691] shrink-0">
              Distance
            </span>
            <span className="text-slate-900 dark:text-white font-medium truncate text-right">
              <Distance />
            </span>
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      {!isClearedFod && (
        <div className="w-full min-w-0 flex flex-col gap-1.5 sm:gap-2 mt-auto pt-2 shrink-0">
          {/* FOD status buttons */}
          <div className="w-full h-[32px] sm:h-[36px] flex justify-between items-stretch gap-1 sm:gap-1.5">
            <button
              type="button"
              className={`min-w-0 flex-1 flex flex-col justify-center items-center rounded border text-[10px] sm:text-xs leading-tight transition-colors ${fodStatusStyle(1)}`}
              onClick={() => dispatch(setFodStatus(1) as any)}
            >
              <span>FOD</span>
              <span>Found</span>
            </button>

            <button
              type="button"
              className={`min-w-0 flex-1 flex flex-col justify-center items-center rounded border text-[10px] sm:text-xs leading-tight transition-colors ${fodStatusStyle(3)}`}
              onClick={() => dispatch(setFodStatus(3) as any)}
            >
              <span>Not</span>
              <span>Found</span>
            </button>

            <button
              type="button"
              className={`min-w-0 flex-1 flex flex-col justify-center items-center rounded border text-[10px] sm:text-xs leading-tight transition-colors ${fodStatusStyle(2)}`}
              onClick={() => dispatch(setFodStatus(2) as any)}
            >
              <span>False</span>
              <span>Found</span>
            </button>
          </div>

          {/* Main action buttons */}
          <div className="w-full h-[34px] sm:h-[38px] flex justify-center gap-1.5 sm:gap-2">
            {isFodFinalReviewOpen ? (
              <>
                <button
                  type="button"
                  className="h-full min-w-0 flex-1 flex justify-center items-center bg-[#017ED7] text-white rounded-md gap-1 text-[11px] sm:text-sm font-medium hover:bg-[#016ec0] transition-colors"
                  onClick={() => dispatch(sendFodReport(true))}
                >
                  <HiOutlineCheck className="text-base sm:text-xl shrink-0" />
                  <span>Send</span>
                </button>

                <button
                  type="button"
                  className="h-full min-w-0 flex-1 flex justify-center items-center border border-slate-300 dark:border-[#696972] text-slate-600 dark:text-[#A8B0BA] rounded-md gap-1 text-[11px] sm:text-sm font-medium hover:bg-slate-100 dark:hover:bg-[#252C36] transition-colors"
                  onClick={() => dispatch(setFodFinalReview(false))}
                >
                  <RxCross1 className="text-base sm:text-xl shrink-0" />
                  <span>Cancel</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="h-full min-w-0 flex-1 flex justify-center items-center bg-[#002756] text-white rounded-md gap-1 px-1 text-[11px] sm:text-sm font-medium hover:bg-[#001f44] transition-colors"
                  onClick={() => dispatch(open_webcam())}
                >
                  <BsCamera className="h-3.5 sm:h-4 w-auto shrink-0" />
                  <span className="truncate">Camera</span>
                </button>

                <button
                  type="button"
                  className="h-full min-w-0 flex-1 flex justify-center items-center bg-[#017ED7] text-white rounded-md gap-1 px-1 text-[11px] sm:text-sm font-medium hover:bg-[#016ec0] transition-colors"
                  onClick={() => dispatch(setFodFinalReview(true))}
                >
                  <GiCardPickup className="h-3.5 sm:h-4 w-auto shrink-0" />
                  <span className="truncate">Clear FOD</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FodDetail;

export const FodGrid = () => {
  const dispatch = useDispatch();

  const missionState = useSelector(
    (store: RootState) => store.MissionState
  );

  const fod = useSelector(
    (state: RootState) => state.SelectedFod.fod
  );

  const selectedFrame = useSelector(
    (state: RootState) => state.SelectedFod.selectedFrame
  );

  const updateSelectedFrame = (frame: any) => {
    dispatch(selectFrame_SideBar(frame));
  };

  const FodPointArr =
    fod?.FodPoint && Array.isArray(fod.FodPoint)
      ? fod.FodPoint
      : [];

  const points = FodPointArr.map((fod: any) => ({
    type: "Feature",
    properties: { ...fod },
    geometry: {
      type: "Point",
      coordinates: [fod.location.lon, fod.location.lat],
    },
  }));

  return (
    <div className="w-full h-[120px] sm:h-[150px] max-h-[160px] bg-slate-100 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] rounded-md p-1.5 overflow-y-auto space-y-1.5 shrink-0 transition-colors">
      {FodPointArr.map((f: any, index: number) => (
        <div
          key={index}
          className={`w-full h-[105px] sm:h-[130px] rounded overflow-hidden cursor-pointer transition-colors ${
            index === 0
              ? "border-2 border-slate-900 dark:border-white"
              : selectedFrame?.id == f.id
                ? "border-2 border-[#00B957]"
                : "border border-slate-300 dark:border-[#454B53]"
          }`}
          onClick={() => updateSelectedFrame(f)}
        >
          <Image
            src={`${config.ImagesBase}/${missionState.missionNumber}/${f.groupId}/${f.id}.jpg`}
            className="w-full h-full object-contain object-center"
            alt="FOD frame"
            width={100}
            height={100}
          />
        </div>
      ))}
    </div>
  );
};
