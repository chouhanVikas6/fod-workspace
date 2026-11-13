import React, { useRef, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RxCross1 } from "react-icons/rx";
import { HiOutlineCheck } from "react-icons/hi";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { FiltersCheck, sortByFilter } from "@/utils/FiltersCheck";
import { removeDetailedViewFod } from "@/store/actions/FodDetailedView";
import {
  update_DetailViewFod,
  reset_DetailedViewFod,
} from "@/store/slices/fodDetailesView-slice";
import { acceptFod, rejectFod } from "@/store/actions/FodActions";
import Image from "next/image";
import { RootState, AppDispatch } from "@/store";
import { getAllFrames, getAllFramesFromServer } from "@/ApiCalls/FodOperations";
import { CircleLoader } from "../commen/loader";
import Distance from "../commen/distance";
import { doubleAccept } from "@/store/slices/fodReducer-slice";
import { toast } from "react-toastify";
import { config } from "@/config/clientConfig";

const EMPTY_FODS: any[] = [];
const EMPTY_DOUBLE_ACCEPTED: Record<string, any> = {};

const DetailedView = () => {
  const dispatch = useDispatch<AppDispatch>();
  const missionState = useSelector((store: RootState) => store.MissionState);

  const [selectedFrameIdx, setSelectedFrameIdx] = useState(0);
  const [selectedFrame, setselectedFrame] = useState<any>(null);
  const [zoom, setZoom] = useState(1);
  const [fade, setfade] = useState(false);

  const detailedViewRef = useRef<HTMLDivElement | null>(null);

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

  const getRiskBadge = (value: number) => {
    const { FodSize } = config.FodCard;
    const medium = FodSize?.medium ?? 30;
    const large = FodSize?.large ?? 90;

    if (value >= large) {
      return {
        badgeStyle: "bg-[#DC2626] text-white",
        text: "HIGH RISK",
      };
    } else if (value >= medium) {
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
    setAcceptButtonStatus(true);
    setAcceptButtonStatus(false);
    setfade(true);

    if ((fod as any).groupStatus == "ACCEPTED") {
      dispatch(doubleAccept((fod as any).groupId));
    } else {
      dispatch(
        acceptFod({ ...(fod as any), missionId: missionState.missionNumber }),
      );
    }

    setTimeout(async () => {
      try {
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
      } catch (e) {
        toast.error("Failed to load next FOD frames");
      } finally {
        setfade(false);
      }
    }, 200);
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

  const stepFrame = (delta: number) => {
    if (!frames.length) return;

    setSelectedFrameIdx((prevIdx) => {
      const nextIdx = Math.max(0, Math.min(frames.length - 1, prevIdx + delta));

      setselectedFrame(frames[nextIdx]);
      setZoom(1);

      const ele = document.getElementById(`selectedFrame${nextIdx}`);

      if (ele) {
        ele.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }

      return nextIdx;
    });
  };

  useEffect(() => {
    setSelectedFrameIdx(0);
    setselectedFrame(null);
    setZoom(1);
  }, [fod?.id, (fod as any)?.groupId]);

  const handleAcceptRejectKeyDown = async (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.keyCode === 27) {
      dispatch(removeDetailedViewFod());
      return;
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        detailedViewRef.current &&
        !detailedViewRef.current.contains(event.target as Node)
      ) {
        dispatch(removeDetailedViewFod());
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [dispatch]);

  const currentSize = Number(activeFrame?.size ?? (fod as any)?.size ?? 24);
  const risk = getRiskBadge(currentSize);
  const fodNumber = (fod as any)?.groupId ?? fod?.id ?? "";

  return (
    <>
      {isOpen && (
        <div className="fixed top-[8%] left-[78px] right-0 bottom-0 bg-slate-900/25 dark:bg-[#181C23]/95 backdrop-blur-xs flex justify-center items-center z-40 select-none animate-fadeIn">
          {fade && (
            <div className="absolute inset-0 flex items-center justify-center z-[999]">
              <CircleLoader />
            </div>
          )}

          <div
            ref={detailedViewRef}
            onClick={handleButtonClick}
            className={`w-[86%] max-w-[1140px] h-[88%] max-h-[680px] min-w-0 rounded-2xl p-3.5 max-[1100px]:p-2.5 bg-slate-100 dark:bg-[#262B33] border border-slate-300 dark:border-[#353D49] shadow-2xl flex gap-3.5 max-[1100px]:gap-2 relative transition-all duration-200 ${
              fade ? "opacity-50 scale-[0.99]" : "opacity-100 scale-100"
            }`}
          >
            {/* Previous FOD */}
            <button
              type="button"
              onClick={fetchPreviousFodDetailedView}
              title="Previous FOD (A)"
              className="absolute -left-14 max-[1100px]:left-1 top-1/2 -translate-y-1/2 z-30 w-11 h-11 max-[1100px]:w-8 max-[1100px]:h-8 rounded-full bg-white dark:bg-[#161A21] hover:bg-slate-100 dark:hover:bg-[#222832] border border-slate-300 dark:border-[#343C48] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white shadow-xl transition-all active:scale-90 cursor-pointer"
            >
              <FiChevronLeft className="w-6 h-6 max-[1100px]:w-4 max-[1100px]:h-4 stroke-[2]" />
            </button>

            {/* Left: Frame Viewer */}
            <div className="w-[63%] min-w-0 h-full relative rounded-xl overflow-hidden bg-slate-200 dark:bg-[#12161B] border border-slate-300 dark:border-[#333B46] flex items-center justify-center">
              {/* Camera Timestamp */}
              <div className="absolute top-3.5 left-3.5 max-[1100px]:top-2 max-[1100px]:left-2 z-20 px-4 py-2 max-[1100px]:px-2.5 max-[1100px]:py-1.5 rounded-lg bg-white/90 dark:bg-[#1A1F26]/85 backdrop-blur-md border border-slate-300 dark:border-[#3B4452] text-slate-700 dark:text-slate-100 text-xs max-[1100px]:text-[10px] font-medium tracking-wide shadow-md">
                Camera ·{" "}
                {formatTimestamp(
                  activeFrame?.timestamp || (fod as any)?.timestamp,
                )}
              </div>

              {/* Zoom Controls */}
              <div className="absolute top-3.5 right-3.5 max-[1100px]:top-2 max-[1100px]:right-2 z-20 flex items-center gap-2 max-[1100px]:gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))
                  }
                  className="px-3.5 py-2 max-[1100px]:px-2 max-[1100px]:py-1.5 rounded-lg bg-white/90 dark:bg-[#1A1F26]/85 hover:bg-slate-100 dark:hover:bg-[#262D37] backdrop-blur-md border border-slate-300 dark:border-[#3B4452] text-slate-800 dark:text-white text-xs max-[1100px]:text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer active:scale-95 shadow-md"
                >
                  + ZOOM IN
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))
                  }
                  className="px-3.5 py-2 max-[1100px]:px-2 max-[1100px]:py-1.5 rounded-lg bg-white/90 dark:bg-[#1A1F26]/85 hover:bg-slate-100 dark:hover:bg-[#262D37] backdrop-blur-md border border-slate-300 dark:border-[#3B4452] text-slate-800 dark:text-white text-xs max-[1100px]:text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer active:scale-95 shadow-md"
                >
                  − ZOOM OUT
                </button>
              </div>

              {/* Main Image */}
              <div className="w-full h-full flex items-center justify-center overflow-hidden relative">
                {activeFrame && (
                  <div
                    className="w-full h-full flex items-center justify-center transition-transform duration-200 ease-out"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <Image
                      src={`${config.ImagesBase}/${missionState.missionNumber}/${activeFrame.groupId ?? (fod as any)?.groupId}/${activeFrame.id ?? fod?.id}.jpg`}
                      className="w-full h-full object-cover object-center"
                      alt={`FOD #${fodNumber}`}
                      width={800}
                      height={600}
                      draggable={false}
                    />

                    <div className="absolute top-[37%] left-1/2 -translate-x-1/2 -translate-y-full mb-1 pointer-events-none">
                      <span className="px-3 py-0.5 rounded bg-[#DC2626] text-white text-xs font-bold tracking-wide shadow-md">
                        FOD #{fodNumber}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Thumbnail Carousel */}
              {frames.length > 0 && (
                <div className="absolute bottom-3 max-[1100px]:bottom-2 left-3 max-[1100px]:left-2 right-3 max-[1100px]:right-2 z-20 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepFrame(-1)}
                    disabled={selectedFrameIdx <= 0}
                    className="w-8 h-8 max-[1100px]:w-7 max-[1100px]:h-7 rounded-full bg-white/90 dark:bg-[#161A21]/90 hover:bg-slate-100 dark:hover:bg-[#252C37] disabled:opacity-40 border border-slate-300 dark:border-[#3B4452] flex items-center justify-center text-slate-800 dark:text-white shrink-0 cursor-pointer transition-all active:scale-90 shadow-lg"
                  >
                    <FiChevronLeft className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  <div className="flex items-center gap-2.5 max-[1100px]:gap-1.5 overflow-x-auto py-1 px-1 max-w-full">
                    {frames.map((frame: any, index: number) => {
                      const isSelected = selectedFrame
                        ? frame?.id === selectedFrame?.id
                        : index === selectedFrameIdx;

                      return (
                        <div
                          id={`selectedFrame${index}`}
                          key={frame?.id ?? index}
                          onClick={() => {
                            setSelectedFrameIdx(index);
                            setselectedFrame(frame);
                            setZoom(1);
                          }}
                          className={`w-[96px] h-[72px] max-[1100px]:w-[72px] max-[1100px]:h-[54px] rounded-md overflow-hidden shrink-0 cursor-pointer transition-all duration-150 bg-slate-200 dark:bg-slate-900 ${
                            isSelected
                              ? "border-2 border-[#4C9FE8] dark:border-white shadow-lg scale-[1.03] opacity-100"
                              : "border border-slate-300 dark:border-[#495362] opacity-75 hover:opacity-100"
                          }`}
                        >
                          <Image
                            src={`${config.ImagesBase}/${missionState.missionNumber}/${frame.groupId ?? (fod as any)?.groupId}/${frame.id}.jpg`}
                            className="w-full h-full object-cover object-center"
                            alt="FOD frame thumbnail"
                            width={96}
                            height={72}
                            draggable={false}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => stepFrame(1)}
                    disabled={selectedFrameIdx >= frames.length - 1}
                    className="w-8 h-8 max-[1100px]:w-7 max-[1100px]:h-7 rounded-full bg-white/90 dark:bg-[#161A21]/90 hover:bg-slate-100 dark:hover:bg-[#252C37] disabled:opacity-40 border border-slate-300 dark:border-[#3B4452] flex items-center justify-center text-slate-800 dark:text-white shrink-0 cursor-pointer transition-all active:scale-90 shadow-lg"
                  >
                    <FiChevronRight className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>
              )}
            </div>

            {/* Right: Details & Decision Panel */}
            <div className="w-[37%] min-w-0 h-full rounded-xl bg-white dark:bg-[#1D2229] border border-slate-300 dark:border-[#2E3642] p-6 max-[1100px]:p-3 flex flex-col justify-between text-slate-800 dark:text-white">
              <div className="min-w-0">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <span
                    className={`px-4 py-1.5 max-[1100px]:px-2.5 max-[1100px]:py-1 rounded-md text-xs max-[1100px]:text-[10px] font-extrabold uppercase tracking-wider ${risk.badgeStyle}`}
                  >
                    {risk.text}
                  </span>

                  <button
                    type="button"
                    onClick={() => dispatch(removeDetailedViewFod())}
                    title="Close (Esc)"
                    className="w-9 h-9 max-[1100px]:w-7 max-[1100px]:h-7 rounded-full bg-slate-100 dark:bg-[#14181E] hover:bg-slate-200 dark:hover:bg-[#252C37] border border-slate-300 dark:border-[#323B48] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <RxCross1 className="w-4 h-4 max-[1100px]:w-3 max-[1100px]:h-3 stroke-[1.5]" />
                  </button>
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

                <p className="text-center text-[#7E8691] text-xs max-[900px]:text-[9px] font-medium mt-0.5 leading-tight">
                  If unsure, press YES. The crew will check the spot.
                </p>
              </div>
            </div>

            {/* Next FOD */}
            <button
              type="button"
              onClick={fetchNextFodDetailedView}
              title="Next FOD (D)"
              className="absolute -right-14 max-[1100px]:right-1 top-1/2 -translate-y-1/2 z-30 w-11 h-11 max-[1100px]:w-8 max-[1100px]:h-8 rounded-full bg-white dark:bg-[#161A21] hover:bg-slate-100 dark:hover:bg-[#222832] border border-slate-300 dark:border-[#343C48] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white shadow-xl transition-all active:scale-90 cursor-pointer"
            >
              <FiChevronRight className="w-6 h-6 max-[1100px]:w-4 max-[1100px]:h-4 stroke-[2]" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default DetailedView;
