
import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";
import { BarLoader } from "../commen/loader";
import axiosClient from "@/utils/axios";
import { pause_resumeMission } from "@/store/slices/missionState-slice";
import {
  exitMission,
  terminateMission,
} from "@/store/actions/MissionControls";
import { toggle_Mapview } from "@/store/slices/mapReducer-slice";
import { toast } from "react-toastify";

import {
  RxHome,
  RxGear,
  RxBell,
  RxPause,
  RxPlay,
  RxStop,
  RxExit,
  RxFileText,
} from "react-icons/rx";

import { HiOutlineMap } from "react-icons/hi";

const MissionControlPanel = ({ tab, setTab }: any) => {
  const dispatch = useDispatch<AppDispatch>();

  const mission = useSelector((store: any) => store.MissionState);

  const isMapOpen = useSelector(
    (store: RootState) => store.MapReducer.isMapOpen
  );

  const { isPause, isPauseLoading } = mission;

  const { latency, availableCommunication } = useSelector(
    (store: RootState) => store.SystemHealth
  );

  const isCarLive = Boolean(
    latency?.connected ||
      (availableCommunication as any[])?.some(
        (c: any) =>
          c?.type === "car" || c?.type?.startsWith("car")
      )
  );

  const isMissionActive = Boolean(
    mission?.isActive &&
      !mission?.isExplore &&
      (!mission?.status || mission?.status === "ACTIVE")
  );

  const isPlayPauseDisabled =
    !isMissionActive ||
    !isCarLive ||
    (isPauseLoading && isMissionActive);

  const isStopDisabled = !isMissionActive || !isCarLive;

  // Keyboard shortcut listener
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.keyCode === 120) {
        dispatch(toggle_Mapview());
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dispatch]);

  // Mission scan status toggle API
  async function handlePlayPause() {
    if (!isMissionActive) {
      toast.info("Scan control is disabled in explore mode");
      return;
    }

    if (!isCarLive) {
      toast.error("Vehicle is not in communication");
      return;
    }

    try {
      const result = await axiosClient({
        method: "get",
        url: `/api/mission/toggle-scan?type=${isPause ? "resume" : "pause"}`,
      });

      if (result?.data?.data) {
        dispatch(pause_resumeMission(result.data.data === "PAUSE"));
      } else {
        toast.error(
          result?.data?.error ||
            `Failed to ${isPause ? "resume" : "pause"} scan — no response from vehicle`
        );
      }
    } catch (e: any) {
      toast.error(
        e?.data?.error ||
          `Failed to ${isPause ? "resume" : "pause"} scan`
      );
    }
  }

  async function syncPlayPause() {
    if (!isMissionActive) return;

    try {
      const response = await axiosClient({
        method: "get",
        url: "/api/mission/scan-status",
      });

      const s = response?.data?.scanStatus;
      const scanVal = typeof s === "string" ? s : s?.data;

      if (scanVal) {
        dispatch(pause_resumeMission(scanVal === "PAUSE"));
      }
    } catch (e) {
      console.log("scan-status poll failed", e);
    }
  }

  useEffect(() => {
    if (!isMissionActive) return;

    const interval = setInterval(() => {
      syncPlayPause();
    }, 1500);

    return () => clearInterval(interval);
  }, [isMissionActive, isPause]);

  // Shared navigation button styles
  const navButtonBase =
    "w-12 h-12 sm:w-14 sm:h-14 flex flex-col items-center justify-center rounded-[10px] transition-all duration-150 active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4C9FE8]";

  const navButtonInactive =
    "text-slate-500 dark:text-[#A8B0BA] hover:text-slate-600 dark:hover:text-[#D9DDE2] hover:bg-slate-100 dark:hover:bg-[#353A42]";

  const navButtonActive =
    "bg-[#4C9FE8]/20 dark:bg-[#4C9FE8]/20 text-[#4C9FE8] dark:text-[#4C9FE8]";

  const navLabel =
    "text-[9px] sm:text-[10px] lg:text-[11px] font-semibold tracking-wide mt-0.5";

  const divider =
    "w-7 h-px bg-slate-200 dark:bg-[#454B53] my-0.5";

  return (
    <div className="h-full min-h-0 w-full flex flex-col items-center justify-between py-2 sm:py-3 bg-white dark:bg-[#292D33] border-r border-slate-200 dark:border-[#454B53] transition-colors duration-200">

      {/* TOP NAVIGATION */}
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 lg:gap-4">

        {/* 1. HOME */}
        <button
          type="button"
          onClick={() => {
            setTab("home");

            if (isMapOpen) {
              dispatch(toggle_Mapview());
            }
          }}
          title="Home"
          aria-label="Home"
          className={`${navButtonBase} ${
            tab === "home" && !isMapOpen
              ? navButtonActive
              : navButtonInactive
          }`}
        >
          <RxHome className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
          <span className={navLabel}>Home</span>
        </button>

        {/* 2. SETUP */}
        <button
          type="button"
          onClick={() =>
            setTab(tab === "setting" ? "dashboard" : "setting")
          }
          title="Settings"
          aria-label="Settings"
          className={`${navButtonBase} ${
            tab === "setting"
              ? navButtonActive
              : navButtonInactive
          }`}
        >
          <RxGear className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
          <span className={navLabel}>Setup</span>
        </button>

        <div className={divider} />

        {/* 3. ALERTS */}
        <button
          type="button"
          onClick={() => {
            if (isMapOpen) dispatch(toggle_Mapview());
            setTab("dashboard");
          }}
          title="Live Alerts Dashboard"
          aria-label="Live Alerts Dashboard"
          className={`${navButtonBase} ${
            tab === "dashboard" && !isMapOpen
              ? navButtonActive
              : navButtonInactive
          }`}
        >
          <RxBell className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
          <span className={navLabel}>Alerts</span>
        </button>

        {/* 4. MAP */}
        <button
          type="button"
          onClick={() => dispatch(toggle_Mapview())}
          title="Map Overview"
          aria-label="Map Overview"
          className={`${navButtonBase} ${
            isMapOpen ? navButtonActive : navButtonInactive
          }`}
        >
          <HiOutlineMap className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
          <span className={navLabel}>Map</span>
        </button>

        {/* 5. REPORTS */}
        <button
          type="button"
          onClick={() => {
            if (isMapOpen) dispatch(toggle_Mapview());
            setTab("reports");
          }}
          title="Mission Reports"
          aria-label="Mission Reports"
          className={`${navButtonBase} ${
            tab === "reports" && !isMapOpen
              ? navButtonActive
              : navButtonInactive
          }`}
        >
          <RxFileText className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
          <span className={navLabel}>Reports</span>
        </button>
      </div>

      {/* MISSION CONTROLS */}
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 lg:gap-4">

        <div className={divider} />

        {/* 6. PAUSE / RESUME */}
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={isPlayPauseDisabled}
          title={
            !isMissionActive
              ? "Scan control disabled in explore mode"
              : !isCarLive
                ? "Vehicle not in communication"
                : isPause
                  ? "Resume scan"
                  : "Pause scan"
          }
          aria-label={isPause ? "Resume scan" : "Pause scan"}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-[10px] flex flex-col items-center justify-center transition-all duration-150 relative text-[#B87912] dark:text-[#E5A12B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A12B] ${
            isPlayPauseDisabled
              ? "opacity-40 cursor-not-allowed"
              : "hover:bg-amber-50 dark:hover:bg-[#E5A12B]/10 active:scale-95 cursor-pointer"
          }`}
        >
          {isPauseLoading && isMissionActive && (
            <div className="absolute inset-0 flex items-center justify-center">
              <BarLoader />
            </div>
          )}

          {isPause ? (
            <RxPlay className="w-5 h-5" />
          ) : (
            <RxPause className="w-5 h-5" />
          )}

          <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-bold uppercase tracking-wide mt-0.5">
            {isPause ? "PLAY" : "PAUSE"}
          </span>
        </button>

        {/* 7. STOP */}
        <button
          type="button"
          disabled={isStopDisabled}
          title={
            !isMissionActive
              ? "Cannot stop mission in explore mode"
              : !isCarLive
                ? "Vehicle not in communication"
                : "Stop Mission"
          }
          aria-label="Stop Mission"
          onClick={() => {
            if (!isStopDisabled) {
              dispatch(terminateMission);
            }
          }}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-[10px] flex flex-col items-center justify-center transition-all duration-150 text-[#D51F32] dark:text-[#D51F32] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D51F32] ${
            isStopDisabled
              ? "opacity-40 cursor-not-allowed"
              : "hover:bg-red-50 dark:hover:bg-[#D51F32]/10 active:scale-95 cursor-pointer"
          }`}
        >
          <RxStop className="w-5 h-5" />
          <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-semibold tracking-wide mt-0.5">
            STOP
          </span>
        </button>

        {/* 8. EXIT */}
        <button
          type="button"
          onClick={() => dispatch(exitMission)}
          title="Exit Mission"
          aria-label="Exit Mission"
          className={`${navButtonBase} text-slate-500 dark:text-[#A8B0BA] hover:text-slate-900 dark:hover:text-[#D9DDE2] hover:bg-slate-100 dark:hover:bg-[#353A42]`}
        >
          <RxExit className="w-5 h-5" />
          <span className="text-[9px] sm:text-[10px] lg:text-[11px] font-semibold tracking-wide mt-0.5">
            EXIT
          </span>
        </button>
      </div>
    </div>
  );
};

export default MissionControlPanel;
