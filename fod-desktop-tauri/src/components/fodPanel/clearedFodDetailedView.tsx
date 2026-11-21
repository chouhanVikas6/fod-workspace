
import React, { useRef, useEffect } from "react";
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

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [dispatch, isOpen]);

  if (!isOpen || !fod) return null;

  return (
    <div
       className="
    fixed inset-x-0 bottom-0 top-[48px] z-[9999]
    flex items-center justify-center
    overflow-y-auto
    bg-slate-900/40
    backdrop-blur-[5px]
    p-2
    sm:p-4
    lg:p-5
  "
    >
      <div
        ref={detailedViewRef}
        className="
          relative
          w-full max-w-[1400px]
          max-h-[90dvh]
          max-[900px]:max-h-[calc(100dvh-4rem)]
          overflow-y-auto
          rounded-xl
          bg-white dark:bg-[#181C23]
          border border-slate-200 dark:border-[#2B3542]
          shadow-2xl
          text-slate-700 dark:text-[#D9DDE2]
          flex flex-col
        "
      >
        {/* Modal Header */}
        <div
          className="
            sticky top-0 z-20
            h-11 sm:h-12
            px-3 sm:px-5
            flex items-center justify-between
            bg-white dark:bg-[#181C23]
            border-b border-slate-200 dark:border-[#2B3542]
            shrink-0
          "
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-[#D9DDE2]">
              {Fod_FodId(fod)}
            </span>

            <span
              className="
                px-2 py-1 rounded
                text-[9px] sm:text-[10px]
                font-bold tracking-wide
                bg-emerald-100 dark:bg-emerald-500/15
                text-emerald-700 dark:text-[#00B957]
              "
            >
              CLEARED
            </span>
          </div>

          <button
            type="button"
            title="Close detail view"
            onClick={() => dispatch(removeClearedDetailedViewFod())}
            className="
              w-7 h-7 rounded-md
              flex items-center justify-center
              text-slate-500 dark:text-[#A8B0BA]
              hover:bg-slate-100 dark:hover:bg-[#353A42]
              hover:text-slate-900 dark:hover:text-white
              transition-colors
            "
          >
            <RxCross1 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Main Content */}
        <div className="p-3 sm:p-4 lg:p-5 flex flex-col gap-3 sm:gap-4">
          {/* Top Section: Frames + FOD Details */}
          <div
            className="
              grid grid-cols-1
              lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]
              gap-3 sm:gap-4
            "
          >
            {/* FOD Frame Gallery */}
            <div
              className="
                min-w-0
                h-[220px] sm:h-[260px] lg:h-[300px]
                rounded-lg overflow-hidden
                bg-slate-100 dark:bg-[#22262B]
                border border-slate-200 dark:border-[#454B53]
              "
            >
              <FodGrid />
            </div>

            {/* FOD Information */}
            <div
              className="
                min-w-0
                rounded-lg
                bg-slate-50 dark:bg-[#22262B]
                border border-slate-200 dark:border-[#454B53]
                p-3 sm:p-4
              "
            >
              <ClearedFodData />
            </div>
          </div>

          {/* Before / After Images */}
          <div className="w-full sm:w-[70%] mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Before Clearing */}
            <div
              className="
                min-w-0
                rounded-lg
                bg-slate-50 dark:bg-[#22262B]
                border border-slate-200 dark:border-[#454B53]
                p-2.5 sm:p-3
              "
            >
              <h3
                className="
                  text-xs sm:text-sm
                  font-semibold
                  text-slate-700 dark:text-[#D9DDE2]
                  mb-2
                "
              >
                Before Clearing
              </h3>

              <ImgSlider
                clearedResponse={fod.collectorResponse}
                beforeImg={true}
              />
            </div>

            {/* After Clearing */}
            <div
              className="
                min-w-0
                rounded-lg
                bg-slate-50 dark:bg-[#22262B]
                border border-slate-200 dark:border-[#454B53]
                p-2.5 sm:p-3
              "
            >
              <h3
                className="
                  text-xs sm:text-sm
                  font-semibold
                  text-slate-700 dark:text-[#D9DDE2]
                  mb-2
                "
              >
                After Clearing
              </h3>

              <ImgSlider
                clearedResponse={fod.collectorResponse}
                beforeImg={false}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClearedFodDetailView;

/* ======================================================
   FOD FRAME GALLERY
====================================================== */

const FodGrid = () => {
  const { fod } = useSelector(
    (state: RootState) => state.ClearedFodDetailView
  );
  const missionNumber = useSelector(
    (state: RootState) => state.MissionState?.missionNumber
  );

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
      return ["${config.ImagesBase}/${missionId}/${fodData.groupId}/${fodData.id}.jpg"];
    }

    return [];
  };

  const frames = getFrames(fod);
  const [failedFrames, setFailedFrames] = React.useState<Record<number, boolean>>({});

  React.useEffect(() => {
    setFailedFrames({});
  }, [fod]);

  const gridColsClass =
    frames.length === 1
      ? "grid-cols-1"
      : frames.length === 2
        ? "grid-cols-1 min-[480px]:grid-cols-2"
        : "grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-3";

  return (
    <div
      className={`
        w-full h-full
        grid ${gridColsClass}
        gap-2 p-2
        overflow-y-auto
        content-start
      `}
    >
      {frames.length > 0 ? (
        frames.map((frame: string, index: number) => (
          <div
            key={index}
            className={`
              relative
              w-full ${frames.length === 1 ? "h-full min-h-[180px]" : "aspect-[4/3] min-h-[100px]"}
              rounded-md overflow-hidden
              bg-slate-200 dark:bg-[#292D33]
              flex items-center justify-center
              border
              ${
                index === 0
                  ? "border-2 border-[#4C9FE8]"
                  : "border-slate-200 dark:border-[#454B53]"
              }
            `}
          >
            {failedFrames[index] ? (
              <div className="flex flex-col items-center justify-center text-slate-500 dark:text-[#A8B0BA] text-xs gap-1">
                <span className="font-mono font-semibold">{Fod_FodId(fod)}</span>
                <span>No frame preview</span>
              </div>
            ) : (
              <Image
                src={frame}
                alt={`FOD frame ${index + 1}`}
                className="w-full h-full rounded-md object-contain"
                onError={() =>
                  setFailedFrames((prev) => ({ ...prev, [index]: true }))
                }
              />
            )}
          </div>
        ))
      ) : (
        <div
          className="
            col-span-full
            w-full h-full min-h-[180px]
            flex items-center justify-center
            text-xs sm:text-sm
            text-slate-500 dark:text-[#A8B0BA]
          "
        >
          No FOD frames available
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
        <Slider
          {...settings}
          className="cleared-slider-container"
        >
          {imageList.map((item: string, index: number) => (
            <div key={index} className="px-1">
              <div
                className="
                  relative w-full
                  aspect-[4/3] max-h-[240px]
                  rounded-md overflow-hidden
                  bg-slate-200 dark:bg-[#292D33]
                "
              >
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
        <div
          className="
            w-full
            aspect-[4/3] max-h-[240px]
            flex items-center justify-center
            rounded-md
            bg-slate-100 dark:bg-[#292D33]
            border border-slate-200 dark:border-[#454B53]
            text-xs text-slate-500 dark:text-[#A8B0BA]
          "
        >
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
    const selectedFodLocation =
      validateSelectedFodLocation(clearedFod);

    const validatedCollectorLocation =
      validateCollectorLocation(clearedFod);

    if (
      !selectedFodLocation ||
      !validatedCollectorLocation
    ) {
      return "—";
    }

    try {
      const point1 = turf.point(
        validatedCollectorLocation.coord
      );

      const point2 = turf.point(selectedFodLocation);

      const options = { units: "meters" as Units };

      const distance = turf.distance(
        point1,
        point2,
        options
      );

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
        ? new Date(
            (fod as any).timestamp
          ).toLocaleString()
        : "—",
    },
    {
      label: "Size",
      value:
        (fod as any)?.size !== undefined && (fod as any)?.size !== null && Number.isFinite(Number((fod as any).size))
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
        (fod as any)?.velocity !== undefined && (fod as any)?.velocity !== null && Number.isFinite(Number((fod as any).velocity))
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
      <div
        className="
          text-base sm:text-lg
          font-bold
          text-slate-900 dark:text-[#D9DDE2]
          mb-3
        "
      >
        FOD Information
      </div>

      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2">
        {dataItems.map((item) => (
          <div
            key={item.label}
            className="
              min-w-0
              min-h-[42px] sm:min-h-[46px]
              flex items-center justify-between
              gap-2
              rounded-md
              px-2.5 sm:px-3
              py-2
              bg-white dark:bg-[#292D33]
              border border-slate-200 dark:border-[#454B53]
            "
          >
            <span
              className="
                shrink-0
                text-[10px] sm:text-[11px]
                font-medium
                text-slate-500 dark:text-[#A8B0BA]
              "
            >
              {item.label}
            </span>

            <span
              className="
                min-w-0
                text-right
                text-[10px] sm:text-[11px]
                font-semibold
                text-slate-800 dark:text-[#D9DDE2]
                break-words
              "
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
