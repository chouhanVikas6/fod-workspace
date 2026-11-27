
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { RxCross1 } from "react-icons/rx";
import { HiOutlineCheck } from "react-icons/hi";
import { BsCamera } from "react-icons/bs";
import { GiCardPickup } from "react-icons/gi";

import MapMode from "@/assets/images/svg/MissionControl/MapMode.svg";

import { Fod_Velocity, Fod_Size } from "../../../utils/FodParser";
import { set_Map_view } from "@/store/actions/MapOperations";
import { setFodStatus, updateSelectedFod } from "@/store/actions/SelectedFod";
import { open_webcam } from "@/store/slices/webCam-slice";
import { setFodFinalReview } from "@/store/actions/WebCam";

import BarLoader from "../../../utils/Helper/BarLoader.jsx";
import { config } from "@/config/clientConfig";
import { calculateFodRisk } from "@/config/riskConfig";

import Image from "next/image";

import {
  accept_Fod,
  doubleAccept,
  reject_Fod,
} from "../../../store/slices/fodReducer-slice";

import axiosClient from "@/utils/axios";
import { toast } from "react-toastify";

const Fodcard = ({
  fod,
  missionNumber: propMissionNumber,
  handleDetailViewRequest,
}) => {
  const dispatch = useDispatch();

  const storeMissionNumber = useSelector((store) =>
    propMissionNumber !== undefined
      ? propMissionNumber
      : store.MissionState?.missionNumber
  );

  const missionNumber = propMissionNumber ?? storeMissionNumber;

  const [fade, setFade] = useState(false);
  const [imgModal, setImageModal] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [fod?.id, fod?.groupId, missionNumber]);

  const isFodFound = fod.groupStatus === "ACCEPTED";

  const getStyleByRisk = (riskLevel) => {
    const baseBorderStyle =
      "border border-[#E2E8F0] dark:border-[#2B333E] shadow-[0_4px_16px_-2px_rgba(15,23,42,0.08)] dark:shadow-none";

    if (riskLevel === "HIGH") {
      return {
        badgeStyle: "bg-[#EF4444] text-white",
        borderStyle: baseBorderStyle,
        topAccentStyle: "border-[#EF4444]",
        text: "HIGH RISK",
      };
    } else if (riskLevel === "MEDIUM") {
      return {
        badgeStyle: "bg-[#F59E0B] text-black font-extrabold",
        borderStyle: baseBorderStyle,
        topAccentStyle: "border-[#F59E0B]",
        text: "MEDIUM RISK",
      };
    } else {
      return {
        badgeStyle:
          "bg-[#E2E8F0] text-[#334155] border border-[#CBD5E1] dark:border-transparent dark:bg-[#374151] dark:text-slate-200",
        borderStyle: baseBorderStyle,
        topAccentStyle: "border-[#94A3B8] dark:border-[#64748B]",
        text: "LOW RISK",
      };
    }
  };

  const size = fod?.size ?? 24;
  const riskLevel = calculateFodRisk(fod?.class, size);
  const style = getStyleByRisk(riskLevel);

  const getLocationDisplay = () => {
    if (fod?.grid) return `Grid ${fod.grid}`;

    const loc =
      fod?._loc ??
      (typeof fod?.location === "object" ? fod.location : null);

    if (loc) {
      if (loc.grid) return `Grid ${loc.grid}`;

      if (typeof loc.lat === "number" && typeof loc.lon === "number") {
        return `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`;
      }
    }

    if (typeof fod?.location === "string") {
      try {
        const parsed = JSON.parse(fod.location);

        if (parsed?.grid) return `Grid ${parsed.grid}`;

        if (parsed?.lat && parsed?.lon) {
          return `${parsed.lat.toFixed(4)}, ${parsed.lon.toFixed(4)}`;
        }
      } catch (e) {
        // Ignore invalid location JSON
      }
    }

    const seed = fod?.groupId || fod?.id || 1;
    const row = String.fromCharCode(65 + (seed % 6));
    const col = String(((seed * 3) % 20) + 1).padStart(2, "0");

    return `Grid ${row}-${col}`;
  };

  const openMapAndSelectFod = (e) => {
    if (e) e.stopPropagation();

    dispatch(set_Map_view);
    dispatch(updateSelectedFod(fod));
  };

  const handleOpenCamera = (e) => {
    if (e) e.stopPropagation();

    dispatch(updateSelectedFod(fod));
    dispatch(open_webcam());
  };

  const handleClearFod = (e) => {
    if (e) e.stopPropagation();

    dispatch(updateSelectedFod(fod));
    dispatch(setFodStatus(1));
    dispatch(setFodFinalReview(true));
  };

  const acceptFod = async (fod, e) => {
    if (e) e.stopPropagation();

    if (fod.groupStatus === "ACCEPTED") {
      dispatch(doubleAccept(fod.groupId));
      return;
    }

    const { groupId: FodId } = fod;
    dispatch(accept_Fod(FodId));

    try {
      await axiosClient({
        method: "POST",
        url: "/api/fod-group/update/" + FodId,
        data: {
          status: "ACCEPTED",
          missionId: missionNumber,
        },
      });
    } catch (err) {
      console.error(err);
      toast.error(
        err?.data?.message || err?.data?.error || "Failed to accept FOD"
      );
    }
  };

  const rejectFod = async (fod, e) => {
    if (e) e.stopPropagation();

    try {
      setImageModal(true);

      const { groupId: FodId } = fod;

      const response = await axiosClient({
        method: "POST",
        url: "/api/fod-group/update/" + FodId,
        data: {
          status: "REJECTED",
          missionId: missionNumber,
        },
      });

      if (response) {
        setFade(true);

        setTimeout(() => {
          dispatch(reject_Fod(FodId));
          setFade(false);
          setImageModal(false);
        }, 50);
      }
    } catch (e) {
      console.error(e);
      setImageModal(false);

      toast.error(
        e?.data?.message || e?.data?.error || "Failed to reject FOD"
      );
    }
  };

  const onCardClick = () => {
    if (typeof handleDetailViewRequest === "function") {
      handleDetailViewRequest(fod);
    }
  };

  return (
    <div
      id={fod.id}
      key={fod.id}
      className={`w-full h-full relative rounded-xl p-2.5 flex flex-col justify-between transition-all duration-200 ease-out bg-white dark:bg-[#1C2129] text-[#1E293B] dark:text-white hover:scale-[1.02] active:scale-100 ${style.borderStyle} ${fade ? "fade-out opacity-40" : ""
        }`}
    >
      {/* Top Risk Accent Cap */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-px bottom-auto h-7 rounded-t-xl border-t-[4px] border-x-[3px] ${style.topAccentStyle} [mask-image:linear-gradient(to_bottom,black_40%,transparent_100%)]`}
      />

      {imgModal && (
        <div className="absolute inset-0 rounded-xl bg-slate-900/20 dark:bg-black/60 backdrop-blur-xs z-30 flex flex-col items-center justify-center gap-2 zoid-fade-slide">
          <div className="w-7 h-7 rounded-full border-2 border-[#4C9FE8] border-t-transparent animate-spin" />
          <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 bg-white/90 dark:bg-[#1C2129]/90 px-2.5 py-0.5 rounded-full shadow-xs">
            Updating…
          </span>
        </div>
      )}

      {/* Clickable Card Body */}
      <div
        className="w-full flex-1 min-h-0 flex flex-col cursor-pointer select-none"
        onClick={onCardClick}
      >
        {/* Image Preview with overlaid FOD number (top-left) and Map button (top-right) */}
        <div className="relative flex-1 min-h-[120px] w-full rounded-lg overflow-hidden bg-[#F1F5F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700/50 group mt-0.5 mb-2 flex items-center justify-center">
          <span className="absolute top-1.5 left-1.5 z-10 px-2 py-0.5 rounded bg-black/65 backdrop-blur-xs text-white text-[11px] font-bold tracking-wide shadow-xs pointer-events-none">
            FOD #{fod.groupId || fod.id}
          </span>

          <button
            type="button"
            title="View on map"
            onClick={openMapAndSelectFod}
            className="absolute top-1.5 right-1.5 z-10 p-1 rounded-md bg-black/55 hover:bg-black/75 backdrop-blur-xs text-white shadow-xs transition-colors cursor-pointer"
          >
            <Image
              src={MapMode}
              alt="Map"
              width={18}
              height={18}
              className="brightness-0 invert"
            />
          </button>
          {!imgError ? (
            <Image
              src={`${config.ImagesBase}/${missionNumber}/${fod.groupId}/${fod.id}.jpg`}
              localPath={fod.imagePath}
              draggable={false}
              alt="Fod Image"
              className="h-full w-full object-cover object-center group-hover:scale-105 transition-all duration-300"
              width={220}
              height={130}
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-[#64748B] dark:text-slate-500 text-[11px] gap-1">
              <span>No frame preview</span>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="w-full shrink-0 flex flex-col gap-0.5 text-[11px] mb-2">
          <div className="flex justify-between items-center">
            <span className="text-[#64748B] dark:text-[#7E8691] font-medium">
              Type
            </span>

            <span className="text-[#1E293B] dark:text-slate-100 font-semibold">
              {fod.class || "Metal bolt"}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#64748B] dark:text-[#7E8691] font-medium">
              Size
            </span>

            <span className="text-[#1E293B] dark:text-slate-100 font-semibold">
              {fod.size
                ? `${Math.round(Number(fod.size))} mm`
                : Fod_Size(fod)}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="w-full flex flex-col gap-1.5 mt-auto">
        {isFodFound ? (
          <>
            <button
              type="button"
              disabled={imgModal}
              onClick={handleOpenCamera}
              className="w-full h-[31px] rounded-[5px] border bg-[#002756] hover:bg-[#001F44] active:bg-[#001633] border-[#002756] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <BsCamera className="w-3.5 h-3.5" />
              <span>CAMERA</span>
            </button>

            <button
              type="button"
              disabled={imgModal}
              onClick={handleClearFod}
              className="w-full h-[31px] rounded-[5px] border bg-[#017ED7] hover:bg-[#016EC0] active:bg-[#015EA3] border-[#017ED7] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <GiCardPickup className="w-4 h-4" />
              <span>CLEAR FOD</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={imgModal}
              onClick={(e) => acceptFod(fod, e)}
              className="w-full h-[31px] rounded-[5px] border bg-[#4C9FE8] hover:bg-[#398BD5] active:bg-[#2F7FC5] border-[#4C9FE8] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HiOutlineCheck className="w-4 h-4 stroke-[2.5]" />
              <span>CONFIRM FOD</span>
            </button>

            <button
              type="button"
              disabled={imgModal}
              onClick={(e) => rejectFod(fod, e)}
              className="w-full h-[31px] rounded-[5px] bg-[#F1F5F9] hover:bg-[#E2E8F0] active:bg-[#CBD5E1] dark:bg-[#303640] dark:hover:bg-[#39414C] dark:active:bg-[#252C35] border border-[#E2E8F0] dark:border-[#414B57] text-[#64748B] dark:text-[#A8B0BA] hover:text-[#1E293B] dark:hover:text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RxCross1 className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>NOT FOD</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(Fodcard, (prevProps, nextProps) => {
  return (
    prevProps.fod === nextProps.fod &&
    prevProps.missionNumber === nextProps.missionNumber &&
    prevProps.handleDetailViewRequest === nextProps.handleDetailViewRequest
  );
});
