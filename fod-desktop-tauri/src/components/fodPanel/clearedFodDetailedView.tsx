import React, { useRef, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  Fod_FodId,
  Fod_Riskfactor,
  Fod_ClearenceTime,
  Fod_Confidence,
} from "@/utils/FodParser";

import Slider, { LazyLoadTypes } from "react-slick";
import * as turf from "@turf/turf";
import type { Units } from "@turf/helpers";

import { removeClearedDetailedViewFod } from "@/store/actions/ClearedFodDetailView";
import Image from "next/image";

import { RootState, AppDispatch } from "@/store";
import {
  validateSelectedFodLocation,
  validateCollectorLocation,
} from "@/utils/MapUtils";

import { RxCross1 } from "react-icons/rx";
import { config } from "@/config/clientConfig";

/* ======================================================
   MAIN CLEARED FOD DETAIL VIEW
====================================================== */

const ClearedFodDetailView = () => {
  const dispatch = useDispatch<AppDispatch>();
  const detailedViewRef = useRef<HTMLDivElement>(null);

  const { isOpen, fod } = useSelector(
    (state: RootState) => state.ClearedFodDetailView
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        detailedViewRef.current &&
        !detailedViewRef.current.contains(event.target as Node)
      ) {
        dispatch(removeClearedDetailedViewFod());
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch(removeClearedDetailedViewFod());
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dispatch, isOpen]);

  if (!isOpen || !fod) return null;

  return (
    <div className="fixed inset-y-0 right-0 left-0 sm:left-[78px] top-[48px] z-[9999] flex items-center justify-center bg-slate-900/35 dark:bg-black/60 backdrop-blur-sm p-3 sm:p-5 select-none">
      <div
        ref={detailedViewRef}
        className="relative w-[90%] max-w-[1140px] h-[92%] max-h-[740px] rounded-xl bg-white dark:bg-[#181C23] border border-slate-200 dark:border-[#2B3542] shadow-2xl text-slate-700 dark:text-[#D9DDE2] flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="h-11 sm:h-12 px-4 sm:px-5 flex items-center justify-between bg-white dark:bg-[#181C23] border-b border-slate-200 dark:border-[#2B3542] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              {Fod_FodId(fod)}
            </span>

            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-[#00B957]">
              CLEARED
            </span>
          </div>

          <button
            type="button"
            title="Close detail view (Esc)"
            onClick={() => dispatch(removeClearedDetailedViewFod())}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#202632] hover:bg-slate-200 dark:hover:bg-[#2C3340] border border-slate-200 dark:border-[#323B48] flex items-center justify-center text-slate-500 dark:text-[#A8B0BA] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <RxCross1 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Main Content: Left Imagery + Right Details */}
        <div className="flex-1 min-h-0 p-3 sm:p-4 flex flex-col md:flex-row gap-3 sm:gap-4 overflow-y-auto md:overflow-hidden">
          {/* Left: Frame Gallery + Before/After */}
          <div className="w-full md:w-[58%] md:h-full min-h-0 flex flex-col gap-3">
            <div className="flex-1 min-h-[180px] md:min-h-0 overflow-hidden flex flex-col">
              <FodGrid />
            </div>

            {/* Before / After Images */}
            <div className="shrink-0 grid grid-cols-2 gap-2.5 sm:gap-3">
              <div className="min-w-0 rounded-lg bg-slate-50 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] p-2 sm:p-2.5">
                <h3 className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-[#D9DDE2] mb-1.5">
                  Before Clearing
                </h3>
                <ImgSlider
                  clearedResponse={fod.collectorResponse}
                  beforeImg={true}
                />
              </div>

              <div className="min-w-0 rounded-lg bg-slate-50 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] p-2 sm:p-2.5">
                <h3 className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-[#D9DDE2] mb-1.5">
                  After Clearing
                </h3>
                <ImgSlider
                  clearedResponse={fod.collectorResponse}
                  beforeImg={false}
                />
              </div>
            </div>
          </div>

          {/* Right: FOD Information */}
          <div className="w-full md:w-[42%] md:h-full min-h-0 rounded-lg bg-slate-50 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] p-3 sm:p-4 overflow-y-auto">
            <ClearedFodData />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClearedFodDetailView;

/* ======================================================
   FOD FRAME VIEWER + THUMBNAILS
====================================================== */

const FodGrid = () => {
  const { fod } = useSelector(
    (state: RootState) => state.ClearedFodDetailView
  );
  const missionNumber = useSelector(
    (state: RootState) => state.MissionState?.missionNumber
  );

  const [activeIdx, setActiveIdx] = useState(0);
  const [failedFrames, setFailedFrames] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setActiveIdx(0);
    setFailedFrames({});
  }, [fod]);

  const getFrames = (fodData: any) => {
    const { FodPoints } = fodData || {};
    const missionId = fodData?.missionId ?? missionNumber;

    const pointFrames = Array.isArray(FodPoints)
      ? FodPoints.map((point: any) => {
          if (typeof point?.frame === "string" && point.frame.length > 0) {
            return point.frame;
          }
          const gid = point?.groupId ?? fodData?.groupId;
          const pid = point?.id ?? fodData?.id;
          if (missionId != null && gid != null && pid != null) {
            return `${config.ImagesBase}/${missionId}/${gid}/${pid}.jpg`;
          }
          return null;
        }).filter((frame: any): frame is string => typeof frame === "string" && frame.length > 0)
      : [];

    if (pointFrames.length > 0) return pointFrames;

    if (typeof fodData?.frame === "string" && fodData.frame.length > 0) {
      return [fodData.frame];
    }

    if (missionId != null && fodData?.groupId != null && fodData?.id != null) {
      return [`${config.ImagesBase}/${missionId}/${fodData.groupId}/${fodData.id}.jpg`];
    }

    return [];
  };

  const frames = getFrames(fod);
  const safeIdx = activeIdx < frames.length ? activeIdx : 0;
  const activeFrame = frames[safeIdx];

  return (
    <div className="w-full h-full flex flex-row gap-2 min-h-0">
      {/* Main Frame Preview */}
      <div className="relative flex-1 min-w-0 h-full rounded-lg overflow-hidden bg-slate-100 dark:bg-[#12161B] border border-slate-200 dark:border-[#2B3542] flex items-center justify-center">
        {frames.length === 0 || failedFrames[safeIdx] ? (
          <div className="flex flex-col items-center justify-center text-slate-400 dark:text-[#A8B0BA] text-xs gap-1">
            <span className="font-mono font-semibold">{Fod_FodId(fod)}</span>
            <span>{frames.length === 0 ? "No FOD frames available" : "No frame preview"}</span>
          </div>
        ) : (
          <Image
            src={activeFrame}
            alt={`FOD frame ${safeIdx + 1}`}
            draggable={false}
            className="w-full h-full object-contain"
            onError={() =>
              setFailedFrames((prev) => ({ ...prev, [safeIdx]: true }))
            }
          />
        )}

        {frames.length > 1 && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-mono font-semibold backdrop-blur-xs">
            {safeIdx + 1} / {frames.length}
          </span>
        )}
      </div>

      {/* Vertical Thumbnail Strip */}
      {frames.length > 1 && (
        <div className="w-[72px] sm:w-[84px] h-full shrink-0 flex flex-col gap-2 overflow-y-auto pr-0.5">
          {frames.map((frame: string, index: number) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveIdx(index)}
              className={`relative w-full aspect-[4/3] shrink-0 rounded-md overflow-hidden bg-slate-200 dark:bg-[#202632] cursor-pointer transition-all ${
                index === safeIdx
                  ? "border-2 border-[#017ED7] ring-1 ring-[#017ED7]/30 opacity-100"
                  : "border border-slate-200 dark:border-[#2B3542] opacity-70 hover:opacity-100"
              }`}
            >
              {failedFrames[index] ? (
                <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-400">
                  #{index + 1}
                </div>
              ) : (
                <Image
                  src={frame}
                  alt={`Thumbnail ${index + 1}`}
                  draggable={false}
                  className="w-full h-full object-cover"
                  onError={() =>
                    setFailedFrames((prev) => ({ ...prev, [index]: true }))
                  }
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ======================================================
   BEFORE / AFTER IMAGE SLIDER
====================================================== */

const ImgSlider = ({
  clearedResponse,
  beforeImg,
}: {
  clearedResponse: any;
  beforeImg: boolean;
}) => {
  const settings = {
    infinite: false,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    lazyLoad: "ondemand" as LazyLoadTypes,
    arrows: false,
    dots: true,
    adaptiveHeight: true,
  };

  const imageList = beforeImg
    ? clearedResponse?.beforeClearImg || []
    : clearedResponse?.afterClearImg || [];

  return (
    <div className="w-full min-w-0">
      {imageList.length > 0 ? (
        <Slider {...settings} className="cleared-slider-container">
          {imageList.map((item: string, index: number) => (
            <div key={index}>
              <div className="relative w-full h-[90px] sm:h-[112px] rounded-md overflow-hidden bg-slate-200 dark:bg-[#12161B]">
                <Image
                  src={item}
                  alt={`${beforeImg ? "Before" : "After"} clearing image ${index + 1}`}
                  draggable={false}
                  className="w-full h-full object-contain block"
                />
              </div>
            </div>
          ))}
        </Slider>
      ) : (
        <div className="w-full h-[90px] sm:h-[112px] flex items-center justify-center rounded-md bg-slate-100 dark:bg-[#181C23] border border-dashed border-slate-200 dark:border-[#323B48] text-[11px] text-slate-400 dark:text-slate-500">
          No images available
        </div>
      )}
    </div>
  );
};

/* ======================================================
   CLEARED FOD INFORMATION
====================================================== */

const ClearedFodData = () => {
  const { fod } = useSelector(
    (state: RootState) => state.ClearedFodDetailView
  );

  const distanceBwCollectorAndFod = (clearedFod: any) => {
    const selectedFodLocation = validateSelectedFodLocation(clearedFod);
    const validatedCollectorLocation = validateCollectorLocation(clearedFod);

    if (!selectedFodLocation || !validatedCollectorLocation) {
      return "—";
    }

    try {
      const point1 = turf.point(validatedCollectorLocation.coord);
      const point2 = turf.point(selectedFodLocation);
      const options = { units: "meters" as Units };
      const distance = turf.distance(point1, point2, options);

      if (distance > 999) {
        return `${(distance / 1000).toFixed(2)} Km`;
      }

      return `${distance.toFixed(2)} m`;
    } catch {
      return "—";
    }
  };

  const dataItems = [
    {
      label: "CAM ID",
      value: (fod as any)?.sysid ?? "—",
    },
    {
      label: "FOD Status",
      value: (fod as any)?.groupStatus ?? "—",
    },
    {
      label: "Class",
      value: (fod as any)?.class ?? "—",
    },
    {
      label: "Detection Time",
      value: (fod as any)?.timestamp
        ? new Date((fod as any).timestamp).toLocaleString()
        : "—",
    },
    {
      label: "Size",
      value:
        (fod as any)?.size !== undefined &&
        (fod as any)?.size !== null &&
        Number.isFinite(Number((fod as any).size))
          ? `${Math.round(Number((fod as any).size))} mm`
          : "—",
    },
    {
      label: "Clearance Time",
      value: Fod_ClearenceTime(fod),
    },
    {
      label: "Velocity",
      value:
        (fod as any)?.velocity !== undefined &&
        (fod as any)?.velocity !== null &&
        Number.isFinite(Number((fod as any).velocity))
          ? `${Math.round(Number((fod as any).velocity))} Km/h`
          : "—",
    },
    {
      label: "Distance",
      value: distanceBwCollectorAndFod(fod),
    },
    {
      label: "Risk Factor",
      value: Fod_Riskfactor(fod),
    },
    {
      label: "Confidence",
      value: Fod_Confidence(fod),
    },
  ];

  return (
    <div className="w-full flex flex-col">
      <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-2">
        FOD Information
      </div>

      <div className="flex flex-col divide-y divide-slate-200 dark:divide-[#2B3542]">
        {dataItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 py-2 text-xs"
          >
            <span className="shrink-0 font-medium text-slate-500 dark:text-[#8A94A6]">
              {item.label}
            </span>
            <span className="min-w-0 text-right font-semibold text-slate-800 dark:text-slate-100 break-words">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
