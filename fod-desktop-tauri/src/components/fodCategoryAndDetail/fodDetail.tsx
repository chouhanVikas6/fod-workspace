
import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Fod_FodId,
} from "@/utils/FodParser";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { HiOutlineCheck } from "react-icons/hi";
import { RxCross1 } from "react-icons/rx";
import { BsCamera } from "react-icons/bs";
import { GiCardPickup } from "react-icons/gi";
import { acceptFod } from "@/store/actions/FodActions";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
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
  const isRejectedFod = groupStatus === "REJECTED";

  const { isFodFinalReviewOpen } = useSelector(
    (state: RootState) => state.WebCam
  );

  const fodStatusStyle = (val: number) => {
    const isActive = val === FodStatus;

    return isActive
      ? "bg-[#017ED7] text-white border-[#017ED7]"
      : "bg-slate-50 dark:bg-[#202632] text-slate-700 dark:text-[#D9DDE2] border-slate-200 dark:border-[#2B3542] hover:bg-slate-100 dark:hover:bg-[#29313D]";
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
    <div className="h-full w-full min-w-0 px-2 sm:px-3 py-2 sm:py-3 flex flex-col gap-2 bg-white dark:bg-[#181C23] text-slate-700 dark:text-[#D9DDE2] font-semibold overflow-hidden transition-colors">
      {/* Header */}
      <div className="w-full flex justify-between items-center text-base sm:text-xl shrink-0 text-slate-900 dark:text-white">
        <div className="flex items-center gap-2 min-w-0">
          {!isFodFinalReviewOpen && (
            <button
              type="button"
              onClick={() => dispatch(close_SideBarFodDetail())}
              aria-label="Back to list"
              className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] hover:border-[#017ED7]/40 text-slate-700 dark:text-[#D9DDE2] hover:text-[#017ED7] dark:hover:text-[#38BDF8] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <MdKeyboardArrowLeft className="text-lg" />
            </button>
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

      {/* Scrollable top group: Image carousel + metadata directly below */}
      <div className="w-full flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
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

      {/* Bottom actions pinned after remaining space */}
      {!isClearedFod && (
        <div className="w-full min-w-0 pt-1 flex flex-col gap-2.5 shrink-0">
          {/* FOD status buttons (shown in final review step) */}
          {isFodFinalReviewOpen && (
            <div className="w-full grid grid-cols-3 gap-1.5">
              {[
                { label: "FOD Accepted", value: 1 },
                { label: "Not Found", value: 3 },
                { label: "False Found", value: 2 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`h-9 px-1.5 flex justify-center items-center rounded-md border text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${fodStatusStyle(opt.value)}`}
                  onClick={() => dispatch(setFodStatus(opt.value) as any)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Main action buttons */}
          <div className="w-full h-9 sm:h-10 flex justify-center gap-2">
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

                {isRejectedFod ? (
                  <button
                    type="button"
                    className="h-full min-w-0 flex-1 flex justify-center items-center bg-[#017ED7] text-white rounded-md gap-1 px-1 text-[11px] sm:text-sm font-medium hover:bg-[#016ec0] transition-colors cursor-pointer"
                    onClick={() => {
                      dispatch(
                        acceptFod({
                          ...safeFod,
                          missionId: missionState.missionNumber,
                        }) as any
                      );
                      dispatch(close_SideBarFodDetail());
                    }}
                  >
                    <HiOutlineCheck className="h-4 w-4 shrink-0" />
                    <span className="truncate">Confirm FOD</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="h-full min-w-0 flex-1 flex justify-center items-center bg-[#017ED7] text-white rounded-md gap-1 px-1 text-[11px] sm:text-sm font-medium hover:bg-[#016ec0] transition-colors cursor-pointer"
                    onClick={() => dispatch(setFodFinalReview(true))}
                  >
                    <GiCardPickup className="h-3.5 sm:h-4 w-auto shrink-0" />
                    <span className="truncate">Clear FOD</span>
                  </button>
                )}
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
  ) as any;

  const selectedFrame = useSelector(
    (state: RootState) => state.SelectedFod.selectedFrame
  );

  const FodPointArr: any[] =
    fod?.FodPoint && Array.isArray(fod.FodPoint) ? fod.FodPoint : [];

  const [activeIdx, setActiveIdx] = useState(0);
  const swipeStartX = useRef<number | null>(null);
  const dotsRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingDots = useRef(false);

  // Reset to first frame when switching FODs
  useEffect(() => {
    setActiveIdx(0);
  }, [fod?.groupId, fod?.id]);

  // Keep activeIdx in bounds when frames array updates
  useEffect(() => {
    if (FodPointArr.length > 0 && activeIdx >= FodPointArr.length) {
      setActiveIdx(0);
    }
  }, [FodPointArr.length, activeIdx]);

  // Sync activeIdx if selectedFrame was changed externally
  useEffect(() => {
    if (!selectedFrame?.id || FodPointArr.length === 0) return;
    const foundIdx = FodPointArr.findIndex((f) => f?.id === selectedFrame.id);
    if (foundIdx >= 0 && foundIdx !== activeIdx) {
      setActiveIdx(foundIdx);
    }
  }, [selectedFrame?.id, FodPointArr]);

  const goToIndex = (nextIdx: number) => {
    if (FodPointArr.length === 0) return;
    const clamped = Math.max(0, Math.min(FodPointArr.length - 1, nextIdx));
    setActiveIdx(clamped);
    dispatch(selectFrame_SideBar(FodPointArr[clamped]));
  };

  const handleImagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    swipeStartX.current = e.clientX;
  };

  const handleImagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (swipeStartX.current === null) return;
    const dx = e.clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(dx) < 30) return;
    if (dx < 0) {
      goToIndex(activeIdx + 1);
    } else {
      goToIndex(activeIdx - 1);
    }
  };

  const scrubDotsAtClientX = (clientX: number) => {
    const el = dotsRef.current;
    if (!el || FodPointArr.length <= 1) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
    const idx = Math.floor(ratio * FodPointArr.length);
    if (idx !== activeIdx) {
      goToIndex(idx);
    }
  };

  const currentFrame = FodPointArr[activeIdx] ?? FodPointArr[0];

  return (
    <div className="w-full shrink-0 flex flex-col gap-2 select-none">
      {/* Main Frame Viewport with Left/Right Swipe & Direction Buttons */}
      <div
        onPointerDown={handleImagePointerDown}
        onPointerUp={handleImagePointerUp}
        onPointerCancel={() => {
          swipeStartX.current = null;
        }}
        className="relative w-full aspect-square rounded-md overflow-hidden bg-slate-100 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] flex items-center justify-center touch-pan-y cursor-grab active:cursor-grabbing"
      >
        {currentFrame ? (
          <Image
            src={`${config.ImagesBase}/${missionState.missionNumber}/${currentFrame.groupId}/${currentFrame.id}.jpg`}
            className="w-full h-full object-cover object-center pointer-events-none"
            alt={`FOD frame ${activeIdx + 1}`}
            width={320}
            height={240}
            draggable={false}
          />
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            No frames available
          </span>
        )}

        {FodPointArr.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToIndex(activeIdx - 1);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={activeIdx <= 0}
              aria-label="Previous frame"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/45 hover:bg-black/65 disabled:opacity-30 text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-default backdrop-blur-[2px]"
            >
              <FiChevronLeft className="w-4 h-4 stroke-[2.5]" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToIndex(activeIdx + 1);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={activeIdx >= FodPointArr.length - 1}
              aria-label="Next frame"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/45 hover:bg-black/65 disabled:opacity-30 text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-default backdrop-blur-[2px]"
            >
              <FiChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </>
        )}

        {/* Interactive Dots Indicator overlaid cleanly at bottom of image */}
        {FodPointArr.length > 1 && (
          <div
            ref={dotsRef}
            onPointerDown={(e) => {
              e.stopPropagation();
              isScrubbingDots.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              scrubDotsAtClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!isScrubbingDots.current) return;
              e.stopPropagation();
              scrubDotsAtClientX(e.clientX);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              isScrubbingDots.current = false;
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                // ignore
              }
            }}
            onPointerCancel={() => {
              isScrubbingDots.current = false;
            }}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full bg-black/35 backdrop-blur-md border border-white/15 cursor-ew-resize touch-none max-w-[90%] overflow-hidden shadow-sm"
            title="Click or drag across dots to switch frame"
          >
            {FodPointArr.map((f: any, idx: number) => {
              const isCurrent = idx === activeIdx;
              return (
                <button
                  key={f?.id ?? idx}
                  type="button"
                  aria-label={`Frame ${idx + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    goToIndex(idx);
                  }}
                  className={`rounded-full transition-all duration-150 shrink-0 ${
                    isCurrent
                      ? "w-2 h-2 bg-white scale-110"
                      : "w-1.5 h-1.5 bg-white/45 hover:bg-white/75"
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
