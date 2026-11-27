import React, { useRef, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RxCross1 } from "react-icons/rx";
import { HiOutlineCheck } from "react-icons/hi";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { BsCamera } from "react-icons/bs";
import { GiCardPickup } from "react-icons/gi";
import { MdUndo } from "react-icons/md";
import { FiltersCheck, sortByFilter } from "@/utils/FiltersCheck";
import { removeDetailedViewFod } from "@/store/actions/FodDetailedView";
import {
  update_DetailViewFod,
  reset_DetailedViewFod,
} from "@/store/slices/fodDetailesView-slice";
import { acceptFod, rejectFod } from "@/store/actions/FodActions";
import { setFodStatus, updateSelectedFod } from "@/store/actions/SelectedFod";
import { open_webcam } from "@/store/slices/webCam-slice";
import { setFodFinalReview } from "@/store/actions/WebCam";
import axiosClient from "@/utils/axios";
import Image from "next/image";
import { RootState, AppDispatch } from "@/store";
import { getAllFrames, getAllFramesFromServer } from "@/ApiCalls/FodOperations";
import { CircleLoader } from "../commen/loader";
import Distance from "../commen/distance";
import { doubleAccept, undo_fod } from "@/store/slices/fodReducer-slice";
import { toast } from "react-toastify";
import { config } from "@/config/clientConfig";
import { calculateFodRisk, RiskLevel } from "@/config/riskConfig";
import { MAX_ZOOM, MIN_ZOOM, useImageZoomPan } from "./useImageZoomPan";
import { AnimatePresence, motion } from "framer-motion";
import { preloadFodImage } from "@/mocks/next-image";

const FRAME_SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction === 0 ? 0 : direction > 0 ? "18%" : "-18%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction === 0 ? 0 : direction > 0 ? "-18%" : "18%",
    opacity: 0,
  }),
};

const EMPTY_FODS: any[] = [];
const EMPTY_DOUBLE_ACCEPTED: Record<string, any> = {};

const DetailedView = () => {
  const dispatch = useDispatch<AppDispatch>();
  const missionState = useSelector((store: RootState) => store.MissionState);

  const [selectedFrameIdx, setSelectedFrameIdx] = useState(0);
  const [selectedFrame, setselectedFrame] = useState<any>(null);
  const [slideDirection, setSlideDirection] = useState(0);
  const [fade, setfade] = useState(false);

  const detailedViewRef = useRef<HTMLDivElement | null>(null);
  const panelSwipeStartX = useRef<number | null>(null);
  const stepFrameRef = useRef<(delta: number) => void>(() => {});
  const dotsRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingDots = useRef(false);

  const [isAcceptDisabled, setAcceptButtonStatus] = useState(false);
  const [isRejectDisabled, setRejectButtonStatus] = useState(false);

  const { isOpen, isFilteredFod, fod } = useSelector(
    (state: RootState) => state.FodDetailedView,
  );

  const alertQueue = useSelector((state: RootState) =>
    isOpen ? state.FodReducer.fods : EMPTY_FODS,
  );

  const doubleAccepted = useSelector((state: RootState) =>
    isOpen ? state.FodReducer.doubleAccepted : EMPTY_DOUBLE_ACCEPTED,
  );

  const filters = useSelector((state: RootState) => state.FodReducer.filters);

  const {
    viewportRef: imageViewportRef,
    zoom,
    pan,
    swipeOffsetX,
    isDragging: isPanning,
    animateTransition,
    zoomIn,
    zoomOut,
    resetZoom,
    pointerHandlers: imagePointerHandlers,
  } = useImageZoomPan({
    isOpen,
    onSwipeFrame: (delta) => stepFrameRef.current(delta),
  });

  const getFrames = (fodItem: any) => {
    if (!fodItem) return [];

    const { FodPoints } = fodItem;

    if (Array.isArray(FodPoints) && FodPoints.length > 0) {
      return FodPoints;
    }

    return [fodItem];
  };

  const frames = getFrames(fod);
  const activeFrame = selectedFrame || frames[selectedFrameIdx] || (fod as any);

  function handleButtonClick(event: React.MouseEvent) {
    event.stopPropagation();
  }

  const getRiskBadge = (riskLevel: RiskLevel) => {
    if (riskLevel === "HIGH") {
      return {
        badgeStyle: "bg-[#DC2626] text-white",
        text: "HIGH RISK",
      };
    } else if (riskLevel === "MEDIUM") {
      return {
        badgeStyle: "bg-[#F59E0B] text-black font-extrabold",
        text: "MEDIUM RISK",
      };
    } else {
      return {
        badgeStyle:
          "bg-slate-200 text-slate-700 dark:bg-[#374151] dark:text-slate-200",
        text: "LOW RISK",
      };
    }
  };

  const formatTimestamp = (ts: any) => {
    try {
      const date = ts ? new Date(ts) : new Date();

      if (isNaN(date.getTime())) {
        return new Date().toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      }

      return date.toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "13:35:12";
    }
  };

  const getNextFod = (idx?: number) => {
    const providedFodId = (fod as any).groupId;

    let queue = alertQueue.filter(
      (fod) => fod.groupStatus == filters.groupStatus,
    );

    const initFilteredArray = queue.filter((fod) =>
      isFilteredFod ? !FiltersCheck(fod, filters) : FiltersCheck(fod, filters),
    );

    const sortedArray = sortByFilter(filters, initFilteredArray);

    const filteredArray = sortedArray.filter(
      (fod) => !doubleAccepted.hasOwnProperty(fod.groupId),
    );

    if (filteredArray.length <= 1) return null;

    const filteredIndex = filteredArray.findIndex(
      (item) => item.groupId === providedFodId,
    );

    let result =
      typeof idx == "number"
        ? filteredArray[idx]
        : filteredArray[filteredIndex + 1] || filteredArray[0];

    if (result && result.groupId == (fod as any).groupId) {
      result =
        typeof idx == "number"
          ? filteredArray[idx + 1]
          : filteredArray[filteredIndex + 1] || filteredArray[1];
    }

    return result;
  };

  const fetchNextFodDetailedView = async () => {
    setfade(true);

    const nextFod = getNextFod();
    const listFod = await getAllFrames(nextFod);

    if (nextFod) {
      const updatedFod = { ...nextFod, FodPoints: listFod.data };

      dispatch(
        update_DetailViewFod({
          fod: updatedFod,
          isFilteredFod,
          origin: listFod.origin,
        }),
      );

      getAllFramesFromServer(nextFod, missionState.missionNumber).then(
        (res: any) => {
          const serverFod = { ...nextFod, FodPoints: res.data };

          dispatch(
            update_DetailViewFod({
              fod: serverFod,
              isFilteredFod,
              origin: res.origin,
              onlyIfOpen: true,
            }),
          );
        },
      );
    } else {
      dispatch(reset_DetailedViewFod());
    }

    setTimeout(() => {
      setfade(false);
    }, 200);
  };

  const getPreviousFod = () => {
    const providedFodId = (fod as any).groupId;

    let queue = alertQueue.filter(
      (fod) => fod.groupStatus == filters.groupStatus,
    );

    const initFilteredArray = queue.filter((fod) =>
      isFilteredFod ? !FiltersCheck(fod, filters) : FiltersCheck(fod, filters),
    );

    const filteredArray = sortByFilter(filters, initFilteredArray);

    if (filteredArray.length <= 1) return null;

    const filteredIndex = filteredArray.findIndex(
      (item) => item.groupId === providedFodId,
    );

    return (
      filteredArray[filteredIndex - 1] ||
      filteredArray[filteredArray.length - 1]
    );
  };

  const fetchPreviousFodDetailedView = async () => {
    setfade(true);

    const prevFod = getPreviousFod();
    const listFod = await getAllFrames(prevFod);

    if (prevFod) {
      const updatedFod = { ...prevFod, FodPoints: listFod.data };

      dispatch(
        update_DetailViewFod({
          fod: updatedFod,
          isFilteredFod,
          origin: listFod.origin,
        }),
      );

      getAllFramesFromServer(prevFod, missionState.missionNumber).then(
        (res: any) => {
          const serverFod = { ...prevFod, FodPoints: res.data };

          dispatch(
            update_DetailViewFod({
              fod: serverFod,
              isFilteredFod,
              origin: res.origin,
              onlyIfOpen: true,
            }),
          );
        },
      );
    } else {
      dispatch(reset_DetailedViewFod());
    }

    setTimeout(() => {
      setfade(false);
    }, 200);
  };

  const handleAccept = async () => {
    const targetGroupId = (fod as any)?.groupId ?? fod?.id;
    if ((fod as any)?.groupStatus == "ACCEPTED") {
      dispatch(doubleAccept(targetGroupId));
    } else {
      dispatch(
        acceptFod({
          ...(fod as any),
          groupId: targetGroupId,
          missionId: missionState.missionNumber,
        }) as any,
      );
    }

    const nextFod = getNextFod();
    if (nextFod) {
      const nextFodWithMission = {
        ...nextFod,
        missionId: nextFod.missionId ?? missionState.missionNumber,
      };
      const initialPoints =
        Array.isArray(nextFodWithMission.FodPoints) && nextFodWithMission.FodPoints.length > 0
          ? nextFodWithMission.FodPoints
          : [nextFodWithMission];
      dispatch(
        update_DetailViewFod({
          fod: { ...nextFodWithMission, FodPoints: initialPoints },
          isFilteredFod,
          origin: "initial",
        }),
      );
      setfade(false);

      try {
        const listFod = await getAllFrames(nextFodWithMission);
        if (Array.isArray(listFod?.data) && listFod.data.length > 0) {
          dispatch(
            update_DetailViewFod({
              fod: { ...nextFodWithMission, FodPoints: listFod.data },
              isFilteredFod,
              origin: listFod.origin,
              onlyIfOpen: true,
            }),
          );
        }
      } catch (e) {
        console.error("Failed to load next FOD frames:", e);
      }
    } else {
      dispatch(reset_DetailedViewFod());
      setfade(false);
    }
  };

  const handleReject = async () => {
    setRejectButtonStatus(true);
    setRejectButtonStatus(false);
    setfade(true);

    setTimeout(async () => {
      try {
        dispatch(
          rejectFod({ ...(fod as any), missionId: missionState.missionNumber }),
        );

        const nextFod = getNextFod(0);
        const listFod = await getAllFrames(nextFod);

        if (nextFod) {
          const updatedFod = { ...nextFod, FodPoints: listFod.data };

          dispatch(
            update_DetailViewFod({
              fod: updatedFod,
              isFilteredFod,
              origin: listFod.origin,
            }),
          );
        } else {
          dispatch(reset_DetailedViewFod());
        }

        setfade(false);
      } catch (e) {
        toast.error("Failed to load next FOD frames");
      } finally {
        setfade(false);
      }
    }, 200);
  };

  const goToFrameIndex = (targetIdx: number) => {
    if (!frames.length) return;
    const clamped = Math.max(0, Math.min(frames.length - 1, targetIdx));
    if (clamped === selectedFrameIdx && selectedFrame) return;
    setSlideDirection(clamped > selectedFrameIdx ? 1 : clamped < selectedFrameIdx ? -1 : 0);
    setSelectedFrameIdx(clamped);
    setselectedFrame(frames[clamped]);
    resetZoom(false);
  };

  const stepFrame = (delta: number) => {
    if (!frames.length) return;

    setSelectedFrameIdx((prevIdx) => {
      const nextIdx = Math.max(0, Math.min(frames.length - 1, prevIdx + delta));
      if (nextIdx === prevIdx) return prevIdx;

      setSlideDirection(nextIdx > prevIdx ? 1 : -1);
      setselectedFrame(frames[nextIdx]);
      resetZoom(false);

      return nextIdx;
    });
  };

  const scrubDotsAtClientX = (clientX: number) => {
    const el = dotsRef.current;
    if (!el || frames.length <= 1) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
    const idx = Math.floor(ratio * frames.length);
    if (idx !== selectedFrameIdx) {
      goToFrameIndex(idx);
    }
  };

  stepFrameRef.current = stepFrame;

  useEffect(() => {
    setSlideDirection(0);
    setSelectedFrameIdx(0);
    setselectedFrame(null);
    resetZoom(false);
  }, [fod?.id, (fod as any)?.groupId, isOpen, resetZoom]);

  // Preload adjacent frames into memory cache so swiping left/right never flickers
  useEffect(() => {
    if (!isOpen || !frames.length || !missionState.missionNumber) return;
    const groupFallback = (fod as any)?.groupId;
    const offsets = [-1, 1, 2];
    for (const offset of offsets) {
      const candidate = frames[selectedFrameIdx + offset];
      if (!candidate) continue;
      const gid = candidate.groupId ?? groupFallback;
      const fid = candidate.id ?? fod?.id;
      if (gid != null && fid != null) {
        preloadFodImage(`${config.ImagesBase}/${missionState.missionNumber}/${gid}/${fid}.jpg`);
      }
    }
  }, [isOpen, frames, selectedFrameIdx, missionState.missionNumber, fod]);

  const handleAcceptRejectKeyDown = async (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.keyCode === 27) {
      dispatch(removeDetailedViewFod());
      return;
    }

    if (isOpen) {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomOut();
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetZoom(true);
        return;
      }
    }

    switch (event.keyCode) {
      case 87:
      case 37:
        stepFrame(-1);
        break;
      case 83:
      case 39:
        stepFrame(1);
        break;
      case 65:
        fetchPreviousFodDetailedView();
        break;
      case 68:
        fetchNextFodDetailedView();
        break;
    }

    if (!isOpen || isAcceptDisabled || isRejectDisabled) {
      return;
    }

    if (event.keyCode === 255 || event.keyCode === 81) {
      await handleAccept();
    } else if (event.keyCode === 115 || event.keyCode === 69) {
      await handleReject();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleAcceptRejectKeyDown);

    return () => {
      window.removeEventListener("keydown", handleAcceptRejectKeyDown);
    };
  }, [isOpen, fod, isAcceptDisabled, isRejectDisabled, frames.length]);

  const currentSize = Number(activeFrame?.size ?? (fod as any)?.size ?? 24);
  const currentClass = activeFrame?.class ?? (fod as any)?.class;
  const risk = getRiskBadge(calculateFodRisk(currentClass, currentSize));
  const fodNumber = (fod as any)?.groupId ?? fod?.id ?? "";
  const groupStatus = (fod as any)?.groupStatus;
  const isAcceptedFod = groupStatus === "ACCEPTED";
  const canRevertToNew = Boolean(groupStatus && groupStatus !== "NEW" && groupStatus !== "CLEARED");
  const [isReverting, setIsReverting] = useState(false);

  const handleRevertToNew = async () => {
    const groupId = (fod as any)?.groupId;
    if (!groupId || isReverting) return;
    setIsReverting(true);
    try {
      await axiosClient({
        method: "POST",
        url: `/api/fod-group/update/${groupId}`,
        data: {
          status: "NEW",
          missionId: missionState.missionNumber,
        },
      });
      dispatch(undo_fod(groupId));
      toast.success(`FOD #${fodNumber} reverted to Pending`);
      getNextFod();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.data?.error || "Failed to revert FOD status");
    } finally {
      setIsReverting(false);
    }
  };

  const handleOpenCamera = () => {
    dispatch(updateSelectedFod(fod));
    dispatch(removeDetailedViewFod());
    dispatch(open_webcam());
  };

  const handleClearFod = () => {
    dispatch(updateSelectedFod(fod));
    dispatch(setFodStatus(1));
    dispatch(removeDetailedViewFod());
    dispatch(setFodFinalReview(true) as any);
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed top-[8%] left-[78px] right-0 bottom-0 bg-slate-900/25 dark:bg-[#181C23]/95 backdrop-blur-xs flex justify-center items-center z-40 select-none animate-fadeIn"
        >
          {fade && (
            <div className="absolute inset-0 flex items-center justify-center z-[999]">
              <CircleLoader />
            </div>
          )}

          <div
            ref={detailedViewRef}
            className="w-[96%] max-w-[1240px] h-[88%] max-h-[680px] min-w-0 flex items-center justify-center gap-2 sm:gap-3.5 relative"
          >
            {/* Previous FOD */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fetchPreviousFodDetailedView();
              }}
              title="Previous FOD (A)"
              className="shrink-0 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white dark:bg-[#161A21] hover:bg-slate-100 dark:hover:bg-[#222832] border border-slate-300 dark:border-[#343C48] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white shadow-xl transition-all active:scale-90 cursor-pointer"
            >
              <FiChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
            </button>

            <div
              onClick={handleButtonClick}
              className={`flex-1 h-full min-w-0 rounded-xl p-3.5 max-[1100px]:p-2.5 bg-slate-100 dark:bg-[#262B33] border border-slate-300 dark:border-[#353D49] shadow-2xl flex gap-3.5 max-[1100px]:gap-2 relative transition-all duration-200 ${
                fade ? "opacity-50 scale-[0.99]" : "opacity-100 scale-100"
              }`}
            >
            {/* Left: Frame Viewer */}
            <div className="w-[63%] min-w-0 h-full relative rounded-lg overflow-hidden bg-slate-200 dark:bg-[#12161B] border border-slate-300 dark:border-[#333B46] flex items-center justify-center">
              {/* Top-left: Red FOD badge + CCTV-style timestamp directly without bg card */}
              <div className="absolute top-3.5 left-3.5 max-[1100px]:top-2 max-[1100px]:left-2 z-20 flex flex-col items-start gap-1 pointer-events-none select-none">
                <span className="px-2.5 py-0.5 rounded bg-[#DC2626] text-white text-xs max-[1100px]:text-[10px] font-bold tracking-wide shadow-md">
                  FOD #{fodNumber}
                </span>
                <span className="text-white text-xs max-[1100px]:text-[10px] font-mono font-semibold tracking-wider drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                  Camera ·{" "}
                  {formatTimestamp(
                    activeFrame?.timestamp || (fod as any)?.timestamp,
                  )}
                </span>
              </div>

              {/* Zoom Controls */}
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-3.5 right-3.5 max-[1100px]:top-2 max-[1100px]:right-2 z-20 flex items-center gap-2 max-[1100px]:gap-1"
              >
                {zoom > 1.01 && (
                  <button
                    type="button"
                    onClick={() => resetZoom(true)}
                    title="Reset zoom & pan (0)"
                    className="px-3 py-2 max-[1100px]:px-2 max-[1100px]:py-1.5 rounded-lg bg-[#017ED7]/90 hover:bg-[#016EC0] backdrop-blur-md border border-[#38A3F1]/60 text-white text-xs max-[1100px]:text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer active:scale-95 shadow-md"
                  >
                    {Math.round(zoom * 100)}% ↺
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => zoomIn()}
                  disabled={zoom >= MAX_ZOOM}
                  title="Zoom in (+ or pinch/scroll)"
                  className="px-3.5 py-2 max-[1100px]:px-2 max-[1100px]:py-1.5 rounded-lg bg-white/90 dark:bg-[#1A1F26]/85 hover:bg-slate-100 dark:hover:bg-[#262D37] disabled:opacity-45 disabled:cursor-not-allowed backdrop-blur-md border border-slate-300 dark:border-[#3B4452] text-slate-800 dark:text-white text-xs max-[1100px]:text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer active:scale-95 shadow-md"
                >
                  + ZOOM IN
                </button>

                <button
                  type="button"
                  onClick={() => zoomOut()}
                  disabled={zoom <= MIN_ZOOM}
                  title="Zoom out (- or pinch/scroll)"
                  className="px-3.5 py-2 max-[1100px]:px-2 max-[1100px]:py-1.5 rounded-lg bg-white/90 dark:bg-[#1A1F26]/85 hover:bg-slate-100 dark:hover:bg-[#262D37] disabled:opacity-45 disabled:cursor-not-allowed backdrop-blur-md border border-slate-300 dark:border-[#3B4452] text-slate-800 dark:text-white text-xs max-[1100px]:text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer active:scale-95 shadow-md"
                >
                  − ZOOM OUT
                </button>
              </div>

              {/* Main Image (supports pinch-to-zoom, wheel zoom, drag-to-pan, double-tap/click zoom, and 1x frame swipe) */}
              <div
                ref={imageViewportRef}
                {...imagePointerHandlers}
                className={`w-full h-full flex items-center justify-center overflow-hidden relative touch-none select-none ${
                  zoom > 1
                    ? isPanning
                      ? "cursor-grabbing"
                      : "cursor-grab"
                    : "cursor-grab active:cursor-grabbing"
                }`}
              >
                {activeFrame && (
                  <div
                    className={`w-full h-full flex items-center justify-center relative ${
                      animateTransition
                        ? "transition-transform duration-200 ease-out"
                        : ""
                    }`}
                    style={{
                      transform: `translate3d(${pan.x + swipeOffsetX}px, ${pan.y}px, 0) scale(${zoom})`,
                      transformOrigin: "center center",
                      willChange: "transform",
                    }}
                  >
                    <AnimatePresence initial={false} custom={slideDirection}>
                      <motion.div
                        key={`${fodNumber}-${activeFrame.id ?? selectedFrameIdx}`}
                        custom={slideDirection}
                        variants={FRAME_SLIDE_VARIANTS}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.34, ease: [0.42, 0, 0.58, 1] }}
                        className="absolute inset-0 w-full h-full flex items-center justify-center"
                      >
                        <Image
                          src={`${config.ImagesBase}/${missionState.missionNumber}/${activeFrame.groupId ?? (fod as any)?.groupId}/${activeFrame.id ?? fod?.id}.jpg`}
                          className="w-full h-full object-cover object-center pointer-events-none"
                          alt={`FOD #${fodNumber}`}
                          width={800}
                          height={600}
                          draggable={false}
                        />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Left / Right Frame Navigation Arrows */}
              {frames.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      stepFrame(-1);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    disabled={selectedFrameIdx <= 0}
                    aria-label="Previous frame"
                    className="absolute left-3 max-[1100px]:left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 max-[1100px]:w-7 max-[1100px]:h-7 rounded-full bg-black/45 hover:bg-black/65 disabled:opacity-30 text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-default backdrop-blur-[2px] shadow-md"
                  >
                    <FiChevronLeft className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      stepFrame(1);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    disabled={selectedFrameIdx >= frames.length - 1}
                    aria-label="Next frame"
                    className="absolute right-3 max-[1100px]:right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 max-[1100px]:w-7 max-[1100px]:h-7 rounded-full bg-black/45 hover:bg-black/65 disabled:opacity-30 text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-default backdrop-blur-[2px] shadow-md"
                  >
                    <FiChevronRight className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </>
              )}

              {/* Interactive Dot Slider Bar (click or drag across dots to scrub frames) */}
              {frames.length > 1 && (
                <div
                  ref={dotsRef}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    isScrubbingDots.current = true;
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // ignore
                    }
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
                  className="absolute bottom-3.5 max-[1100px]:bottom-2.5 left-1/2 -translate-x-1/2 z-20 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-black/35 backdrop-blur-xs cursor-ew-resize touch-none max-w-[90%] overflow-hidden"
                  title="Click or drag across dots to switch frame"
                >
                  {frames.map((frame: any, index: number) => {
                    const isSelected = index === selectedFrameIdx;
                    return (
                      <button
                        key={frame?.id ?? index}
                        type="button"
                        aria-label={`Frame ${index + 1}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          goToFrameIndex(index);
                        }}
                        className={`rounded-full transition-all duration-150 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] cursor-pointer ${
                          isSelected
                            ? "w-2.5 h-2.5 bg-white scale-110"
                            : "w-1.5 h-1.5 bg-white/45 hover:bg-white/80"
                        }`}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Details & Decision Panel (supports left/right swipe to switch FODs) */}
            <div
              onPointerDown={(e) => {
                if ((e.target as HTMLElement)?.closest("button")) return;
                panelSwipeStartX.current = e.clientX;
              }}
              onPointerUp={(e) => {
                if (panelSwipeStartX.current === null) return;
                const dx = e.clientX - panelSwipeStartX.current;
                panelSwipeStartX.current = null;
                if (Math.abs(dx) < 45) return;
                if (dx < 0) fetchNextFodDetailedView();
                else fetchPreviousFodDetailedView();
              }}
              onPointerCancel={() => {
                panelSwipeStartX.current = null;
              }}
              className="w-[37%] min-w-0 h-full rounded-xl bg-white dark:bg-[#1D2229] border border-slate-300 dark:border-[#2E3642] p-6 max-[1100px]:p-3 flex flex-col justify-between text-slate-800 dark:text-white touch-pan-y"
            >
              <div className="min-w-0">
                {/* Header */}
                <div className="flex justify-between items-center gap-2">
                  <span
                    className={`px-4 py-1.5 max-[1100px]:px-2.5 max-[1100px]:py-1 rounded-md text-xs max-[1100px]:text-[10px] font-extrabold uppercase tracking-wider ${risk.badgeStyle}`}
                  >
                    {risk.text}
                  </span>

                  <div className="flex items-center gap-2">
                    {canRevertToNew && (
                      <button
                        type="button"
                        onClick={handleRevertToNew}
                        disabled={isReverting}
                        title="Revert status to New"
                        className="w-9 h-9 max-[1100px]:w-7 max-[1100px]:h-7 rounded-full bg-slate-100 dark:bg-[#14181E] hover:bg-amber-50 dark:hover:bg-amber-500/15 border border-slate-300 dark:border-[#323B48] hover:border-amber-400/60 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <MdUndo className="w-4 h-4 max-[1100px]:w-3.5 max-[1100px]:h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => dispatch(removeDetailedViewFod())}
                      title="Close (Esc)"
                      className="w-9 h-9 max-[1100px]:w-7 max-[1100px]:h-7 rounded-full bg-slate-100 dark:bg-[#14181E] hover:bg-slate-200 dark:hover:bg-[#252C37] border border-slate-300 dark:border-[#323B48] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <RxCross1 className="w-4 h-4 max-[1100px]:w-3 max-[1100px]:h-3 stroke-[1.5]" />
                    </button>
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-[22px] max-[1100px]:text-base font-bold text-slate-900 dark:text-white tracking-tight mt-3 mb-4 max-[1100px]:mt-2 max-[1100px]:mb-2">
                  Is this real debris?
                </h2>

                {/* Metadata */}
                <div className="flex flex-col text-sm max-[1100px]:text-[11px]">
                  <div className="flex justify-between items-center gap-2 py-3 max-[1100px]:py-2 border-b border-slate-200 dark:border-[#2B323D]">
                    <span className="text-slate-500 dark:text-[#8A94A6] font-medium shrink-0">
                      CAM ID
                    </span>
                    <span className="text-slate-900 dark:text-white font-bold text-right break-all">
                      {activeFrame?.sysid || (fod as any)?.sysid || "-"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-2 py-3 max-[1100px]:py-2 border-b border-slate-200 dark:border-[#2B323D]">
                    <span className="text-slate-500 dark:text-[#8A94A6] font-medium shrink-0">
                      Type
                    </span>
                    <span className="text-slate-900 dark:text-white font-bold text-right">
                      {activeFrame?.class ||
                        (fod as any)?.class ||
                        "Metal bolt"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-2 py-3 max-[1100px]:py-2 border-b border-slate-200 dark:border-[#2B323D]">
                    <span className="text-slate-500 dark:text-[#8A94A6] font-medium shrink-0">
                      Size
                    </span>
                    <span className="text-slate-900 dark:text-white font-bold text-right">
                      {Math.round(currentSize)} mm
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-2 py-3 max-[1100px]:py-2 border-b border-slate-200 dark:border-[#2B323D]">
                    <span className="text-slate-500 dark:text-[#8A94A6] font-medium shrink-0">
                      Velocity
                    </span>
                    <span className="text-slate-900 dark:text-white font-bold text-right">
                      {Math.floor(
                        Number(
                          activeFrame?.velocity ?? (fod as any)?.velocity ?? 0,
                        ),
                      )}
                      Km/h
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-2 py-3 max-[1100px]:py-2">
                    <span className="text-slate-500 dark:text-[#8A94A6] font-medium shrink-0">
                      Distance
                    </span>
                    <span className="text-slate-900 dark:text-white font-bold text-right">
                      <Distance {...{ selectedFrame: activeFrame }} />
                    </span>
                  </div>
                </div>
              </div>

              {/* Decision Buttons */}
              {isAcceptedFod ? (
                <div className="w-full min-w-0 flex flex-col gap-3 max-[900px]:gap-2 mt-4 max-[900px]:mt-2">
                  <button
                    type="button"
                    onClick={handleOpenCamera}
                    className="w-full min-w-0 min-h-[44px] py-3 px-3 max-[900px]:min-h-[38px] max-[900px]:py-2 max-[900px]:px-2 rounded-lg bg-[#002756] hover:bg-[#001F44] active:scale-[0.99] text-white font-semibold text-sm max-[900px]:text-[11px] tracking-wide leading-tight flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <BsCamera className="w-4 h-4 shrink-0" />
                    <span>Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearFod}
                    className="w-full min-w-0 min-h-[44px] py-3 px-3 max-[900px]:min-h-[38px] max-[900px]:py-2 max-[900px]:px-2 rounded-lg bg-[#017ED7] hover:bg-[#016EC0] active:scale-[0.99] text-white font-semibold text-sm max-[900px]:text-[11px] tracking-wide leading-tight flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <GiCardPickup className="w-4 h-4 shrink-0" />
                    <span>Clear FOD</span>
                  </button>
                </div>
              ) : (
                <div className="w-full min-w-0 flex flex-col gap-3 max-[900px]:gap-2 mt-4 max-[900px]:mt-2">
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={isAcceptDisabled}
                    className="w-full min-w-0 min-h-[44px] py-3 px-3 max-[900px]:min-h-[38px] max-[900px]:py-2 max-[900px]:px-2 rounded-lg bg-[#4C9FE8] hover:bg-[#3B91DC] active:scale-[0.99] text-white font-semibold text-sm max-[900px]:text-[11px] tracking-wide max-[900px]:tracking-normal leading-tight flex items-center justify-center gap-2 max-[900px]:gap-1.5 transition-all cursor-pointer shadow-md"
                  >
                    <HiOutlineCheck className="w-5 h-5 max-[900px]:w-3.5 max-[900px]:h-3.5 shrink-0 stroke-[2.5]" />
                    <span className="min-w-0 text-center whitespace-normal break-words">
                      YES – Send to Crew
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={isRejectDisabled}
                    className="w-full min-w-0 min-h-[44px] py-3 px-3 max-[900px]:min-h-[38px] max-[900px]:py-2 max-[900px]:px-2 rounded-lg  bg-[#F1F5F9] hover:bg-[#E2E8F0] active:bg-[#CBD5E1] dark:bg-[#303640] dark:hover:bg-[#39414C] dark:active:bg-[#252C35] border border-[#E2E8F0] dark:border-[#414B57] text-[#64748B] dark:text-[#A8B0BA] hover:text-[#1E293B] dark:hover:text-white active:scale-[0.99] font-semibold text-sm max-[900px]:text-[11px] tracking-wide max-[900px]:tracking-normal leading-tight flex items-center justify-center gap-2 max-[900px]:gap-1.5 transition-all cursor-pointer"
                  >
                    <RxCross1 className="w-4 h-4 max-[900px]:w-3 max-[900px]:h-3 shrink-0 stroke-[1]" />
                    <span className="min-w-0 text-center whitespace-normal break-words">
                      NO – Not Debris
                    </span>
                  </button>

                </div>
              )}
            </div>

            </div>

            {/* Next FOD */}
            <button
              type="button"
              onClick={fetchNextFodDetailedView}
              title="Next FOD (D)"
              className="shrink-0 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white dark:bg-[#161A21] hover:bg-slate-100 dark:hover:bg-[#222832] border border-slate-300 dark:border-[#343C48] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white shadow-xl transition-all active:scale-90 cursor-pointer"
            >
              <FiChevronRight className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default DetailedView;
