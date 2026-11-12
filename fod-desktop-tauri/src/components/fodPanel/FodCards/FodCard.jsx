import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RxCross1 } from "react-icons/rx";
import { HiOutlineCheck } from "react-icons/hi";
import MapMode from "@/assets/images/svg/MissionControl/MapMode.svg";
import { Fod_Velocity, Fod_Size } from "../../../utils/FodParser";
import { set_Map_view } from "@/store/actions/MapOperations";
import { updateSelectedFod } from "@/store/actions/SelectedFod";
import BarLoader from "../../../utils/Helper/BarLoader.jsx";
import { config } from "@/config/clientConfig";
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
      : store.MissionState?.missionNumber,
  );

  const missionNumber = propMissionNumber ?? storeMissionNumber;
  const { FodSize } = config.FodCard;

  const [fade, setFade] = useState(false);
  const [imgModal, setImageModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const isFodFound = fod.groupStatus === "ACCEPTED";

  const getStyleBySize = (value) => {
    const medium = FodSize?.medium ?? 30;
    const large = FodSize?.large ?? 90;

    if (value >= large) {
      return {
        badgeStyle: "bg-[#EF4444] text-white",
        borderStyle:
          "border-2 border-[#EF4444] shadow-[0_0_12px_rgba(239,68,68,0.25)]",
        text: "HIGH RISK",
      };
    } else if (value >= medium) {
      return {
        badgeStyle: "bg-[#F59E0B] text-black font-extrabold",
        borderStyle:
          "border-2 border-[#F59E0B] shadow-[0_0_12px_rgba(245,158,11,0.25)]",
        text: "MEDIUM RISK",
      };
    } else {
      return {
        badgeStyle: "bg-[#374151] text-slate-200",
        borderStyle: "border border-[#2B333E]",
        text: "LOW RISK",
      };
    }
  };

  const size = fod?.size ?? 24;
  const style = getStyleBySize(size);

  const getLocationDisplay = () => {
    if (fod?.grid) return `Grid ${fod.grid}`;

    const loc =
      fod?._loc ?? (typeof fod?.location === "object" ? fod.location : null);

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

  const acceptFod = async (fod, e) => {
    if (e) e.stopPropagation();

    try {
      if (fod.groupStatus === "ACCEPTED") {
        dispatch(doubleAccept(fod.groupId));
        return;
      }

      setImageModal(true);

      const { groupId: FodId } = fod;

      const response = await axiosClient({
        method: "POST",
        url: "/api/fod-group/update/" + FodId,
        data: {
          status: "ACCEPTED",
          missionId: missionNumber,
        },
      });

      if (response) {
        setFade(true);

        setTimeout(() => {
          dispatch(accept_Fod(FodId));
          setFade(false);
          setImageModal(false);
        }, 50);
      }
    } catch (e) {
      console.error(e);
      setImageModal(false);
      toast.error(e?.data?.message || e?.data?.error || "Failed to accept FOD");
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
      toast.error(e?.data?.message || e?.data?.error || "Failed to reject FOD");
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
      className={`w-[225px] h-[350px] relative rounded-xl p-3.5 flex flex-col justify-between transition-all duration-200 ease-out bg-[#1C2129] text-white hover:scale-[1.02] active:scale-100 ${style.borderStyle} ${fade ? "fade-out opacity-40" : ""}`}
    >
      {imgModal && (
        <div className="absolute inset-0 rounded-xl bg-black/60 backdrop-blur-xs z-30 flex items-center justify-center">
          <BarLoader />
        </div>
      )}

      {/* Clickable Card Body */}
      <div
        className="w-full flex-1 flex flex-col cursor-pointer select-none"
        onClick={onCardClick}
      >
        {/* Header */}
        <div className="flex justify-between items-center">
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center ${style.badgeStyle}`}
          >
            {style.text}
          </span>

          <button
            type="button"
            title="View on map"
            onClick={openMapAndSelectFod}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <Image
              src={MapMode}
              alt="Map"
              width={18}
              height={18}
              className="brightness-200"
            />
          </button>
        </div>

        {/* FOD Title */}
        <div className="text-[17px] font-bold text-white tracking-tight mt-1 mb-2">
          FOD #{fod.groupId || fod.id}
        </div>

        {/* Image Preview */}
        <div className="relative h-[105px] w-full rounded-lg overflow-hidden bg-slate-900 border border-slate-700/50 group mb-2.5 flex items-center justify-center">
          {!imgError ? (
            <Image
              src={`${config.ImagesBase}/${missionNumber}/${fod.groupId}/${fod.id}.jpg`}
              draggable={false}
              alt="Fod Image"
              className="h-full w-full object-cover object-center group-hover:scale-105 transition-all duration-300"
              width={220}
              height={105}
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500 text-[11px] gap-1">
              <span className="font-mono text-xs">
                FOD #{fod.groupId || fod.id}
              </span>
              <span>No frame preview</span>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="w-full flex flex-col gap-1 text-[11px] mb-3">
          <div className="flex justify-between items-center">
            <span className="text-[#7E8691] font-medium">Type</span>
            <span className="text-slate-100 font-semibold">
              {fod.class || "Metal bolt"}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#7E8691] font-medium">Size</span>
            <span className="text-slate-100 font-semibold">
              {fod.size ? `${Math.round(Number(fod.size))} mm` : Fod_Size(fod)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#7E8691] font-medium">Location</span>
            <span className="text-slate-100 font-semibold">
              {getLocationDisplay()}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="w-full flex flex-col gap-2 mt-auto">
        {/* Confirm FOD */}
        <button
          type="button"
          disabled={imgModal}
          onClick={(e) => acceptFod(fod, e)}
          className={`w-full h-[34px] rounded-[5px] border font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors ${
            isFodFound
              ? " border-[#414B57] text-white cursor-not-allowed"
              : "bg-[#4C9FE8] hover:bg-[#398BD5] active:bg-[#2F7FC5] border-[#4C9FE8] text-white cursor-pointer"
          }`}
        >
          <HiOutlineCheck className="w-4 h-4 stroke-[2.5]" />
          <span>CONFIRM FOD</span>
        </button>

       

        {/* Not FOD */}
        <button
          type="button"
          disabled={imgModal}
          onClick={(e) => rejectFod(fod, e)}
          className="w-full h-[34px] rounded-[5px] bg-[#303640] hover:bg-[#39414C] active:bg-[#252C35] border border-[#414B57] text-[#A8B0BA] hover:text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RxCross1 className="w-3.5 h-3.5 stroke-[1.5]" />
          <span>NOT FOD</span>
        </button>
      </div>
    </div>
  );
};

export default React.memo(Fodcard, (prevProps, nextProps) => {
  return (
    prevProps.fod.id === nextProps.fod.id &&
    prevProps.fod.groupStatus === nextProps.fod.groupStatus
  );
});
