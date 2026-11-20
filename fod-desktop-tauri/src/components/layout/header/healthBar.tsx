
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "react-toastify";
import { RootState } from "@/store";
import { useSSE } from "@/hooks/subscribeHealth";
import { update_SystemHealth } from "@/store/slices/system-health-slice";
import { config } from "@/config/clientConfig";
import axiosClient from "@/utils/axios";

interface SerialPortOption {
  portName: string;
  description: string;
  vid: string | null;
  pid: string | null;
  isEsp32Bridge: boolean;
  isUblox: boolean;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const toCardinal = (deg: number) => {
  const norm = ((deg % 360) + 360) % 360;
  return CARDINALS[Math.floor((norm + 22.5) / 45) % 8];
};

const HealthBar = () => {
  useSSE("/api/sse/health-data");
  const dispatch = useDispatch();

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [atcConnected, setAtcConnected] = useState(false);
  const [selectedCam, setSelectedCam] = useState<{
    index: number;
    data: any;
  } | null>(null);
  const [serialPorts, setSerialPorts] = useState<SerialPortOption[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("auto");
  const [offsetDraft, setOffsetDraft] = useState<string>("0");
  const [declDraft, setDeclDraft] = useState<string>("0");
  const [magBusy, setMagBusy] = useState<boolean>(false);

  const { latency, availableCommunication, RtkData, magnetometer, carData, AiHealth } =
    useSelector((state: RootState) => state.SystemHealth);
  const atcHealth = useSelector((state: RootState) => state.BiteState.atcData);

  const refreshMagState = useCallback(() => {
    invoke("get_magnetometer_state")
      .then((mag: any) => {
        if (mag && typeof mag === "object") {
          dispatch(update_SystemHealth({ magnetometer: mag }));
        }
      })
      .catch(() => {});
  }, [dispatch]);

  const refreshSerialPorts = useCallback(() => {
    invoke<SerialPortOption[]>("list_serial_ports")
      .then((ports) => {
        if (Array.isArray(ports)) setSerialPorts(ports);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshMagState();
  }, [refreshMagState]);

  useEffect(() => {
    const checkAtc = () => {
      axiosClient({ method: "GET", url: "/api/health/atc-status" })
        .then((res) => setAtcConnected(Boolean(res?.data?.connected)))
        .catch(() => setAtcConnected(false));
    };
    checkAtc();
    const interval = setInterval(checkAtc, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".healthbar-container")) {
        setActiveTooltip(null);
        setSelectedCam(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveTooltip(null);
        setSelectedCam(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // COMM status: prefer Car link, fall back to ATC when Car is unavailable
  const isCarComm = Boolean(
    latency?.connected ||
      (availableCommunication as any[])?.some(
        (c: any) => c?.type === "car" || c?.type?.startsWith("car"),
      ),
  );
  const isAtcComm = Boolean(
    atcConnected ||
      atcHealth?.connected ||
      (availableCommunication as any[])?.some(
        (c: any) => c?.type === "atc" || c?.type?.startsWith("atc"),
      ),
  );
  const isCommConnected = isCarComm || isAtcComm;
  const commLinkLabel = isCarComm
    ? "Car (Primary)"
    : isAtcComm
      ? "ATC (Fallback)"
      : "Offline";

  const commStatus = isCommConnected ? "ok" : "error";

  // GNSS status
  const gnssStatus = useMemo(() => {
    const fix = (RtkData?.data as any)?.fix;
    if (fix === "RTK") return "ok";
    if (fix === "GPS") return "warning";
    return "error";
  }, [RtkData]);

  // Tablet status
  const tabletStatus = useMemo(() => {
    const fix = (RtkData?.data as any)?.fix;
    if (fix === "RTK") return "ok";
    if (fix === "GPS") return "warning";
    return "error";
  }, [RtkData]);

  // Magnetometer & Compass Heading status
  const magData = (magnetometer?.data as any) || {};
  const isMagLive = Boolean(magData?.connected && typeof magData?.heading === "number");
  const isCalibrating = Boolean(magData?.calibrating);
  const gnssHeading =
    typeof (RtkData?.data as any)?.heading === "number" &&
    (RtkData?.data as any)?.fix &&
    (RtkData?.data as any)?.fix !== "NO_GPS"
      ? (RtkData.data as any).heading
      : null;
  const headingDeg: number | null = isMagLive
    ? magData.heading
    : typeof gnssHeading === "number"
      ? gnssHeading
      : null;
  const headingCardinal = headingDeg !== null ? toCardinal(headingDeg) : "--";
  const compassStatus = isCalibrating
    ? "warning"
    : isMagLive
      ? "ok"
      : headingDeg !== null
        ? "warning"
        : "error";

  // Unwrap compass needle rotation so 359° <-> 0° never spins 358° backwards
  const prevHeadingModRef = useRef<number | null>(null);
  const unwrappedHeadingRef = useRef<number>(0);
  const needleRotationDeg = useMemo(() => {
    if (headingDeg === null || !Number.isFinite(headingDeg)) {
      return unwrappedHeadingRef.current;
    }
    const norm = ((headingDeg % 360) + 360) % 360;
    if (prevHeadingModRef.current === null) {
      prevHeadingModRef.current = norm;
      unwrappedHeadingRef.current = norm;
      return norm;
    }
    const delta = ((norm - prevHeadingModRef.current + 540) % 360) - 180;
    prevHeadingModRef.current = norm;
    unwrappedHeadingRef.current += delta;
    return unwrappedHeadingRef.current;
  }, [headingDeg]);

  useEffect(() => {
    if (activeTooltip === "compass") {
      refreshSerialPorts();
      if (typeof magData?.headingOffsetDeg === "number") {
        setOffsetDraft(String(magData.headingOffsetDeg));
      }
      if (typeof magData?.declinationDeg === "number") {
        setDeclDraft(String(magData.declinationDeg));
      }
    }
  }, [activeTooltip, refreshSerialPorts]);

  const runMagAction = async (
    cmd: string,
    args?: Record<string, any>,
    successMsg?: string,
  ) => {
    setMagBusy(true);
    try {
      await invoke(cmd, args);
      refreshMagState();
      if (successMsg) toast.success(successMsg);
    } catch (err: any) {
      toast.error(typeof err === "string" ? err : err?.message || `Failed: ${cmd}`);
    } finally {
      setMagBusy(false);
    }
  };

  // Car status
  const carStatus = useMemo(() => {
    const primaryFix = (carData?.data as any)?.primary_data?.fix;
    const secondaryFix = (carData?.data as any)?.secondary_data?.fix;

    if (primaryFix === "RTK" || secondaryFix === "RTK") return "ok";
    if (primaryFix === "GPS" || secondaryFix === "GPS") return "warning";
    return "error";
  }, [carData]);

  // Camera & AI status
  const AI_THRESHOLD = 25;
  const rawHealth = AiHealth?.data;

  const healthList = useMemo(
    () =>
      (Array.isArray(rawHealth)
        ? rawHealth
        : Object.values(rawHealth || {})) as Array<any>,
    [rawHealth],
  );

  // 26-camera array mapping
  const fixedHealth = useMemo(() => {
    const fixed = new Array(26).fill(null);

    healthList.forEach((h: any, idx: number) => {
      const camId = h?.CAM_ID || h?.sysid;
      const camNum =
        camId && (config as any)?.cameraMap
          ? (config as any).cameraMap[camId]
          : undefined;

      if (camNum !== undefined && camNum >= 1 && camNum <= 26) {
        fixed[camNum - 1] = h;
      } else if (idx < 26 && !fixed[idx]) {
        fixed[idx] = h;
      }
    });

    return fixed;
  }, [healthList]);

  const onlineCount = useMemo(() => {
    return fixedHealth.filter((c: any) => c && c.CAMERA_CONNECTION).length;
  }, [fixedHealth]);

  const cameraStatus = useMemo(() => {
    if (!healthList || healthList.length === 0) return "error";

    const hasConnectionIssue = healthList.some(
      (ele) => !ele?.CAMERA_CONNECTION,
    );

    const hasLowFPSOrPause = healthList.some(
      (ele) =>
        (ele?.INTR_FPS ?? 100) < AI_THRESHOLD || ele?.pause || ele?.PAUSE,
    );

    if (hasConnectionIssue) return "error";
    if (hasLowFPSOrPause) return "warning";
    return "ok";
  }, [healthList]);

  const handleCameraClick = (
    e: React.MouseEvent,
    camera: any,
    index: number,
  ) => {
    e.stopPropagation();

    if (selectedCam?.index === index) {
      setSelectedCam(null);
    } else {
      setSelectedCam({ index, data: camera });
    }
  };

  const getStatusColor = (status: string) => {
    if (status === "ok") return "text-[#01B656]";
    if (status === "warning") return "text-[#F59E0B]";
    return "text-[#EF4444]";
  };

  const toggleTooltip = (name: string) => {
    setActiveTooltip((prev) => (prev === name ? null : name));
    setSelectedCam(null);
  };

  const tooltipClass =
    "absolute top-full right-0 mt-2 sm:mt-3 p-3 sm:p-4 bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-xl shadow-2xl z-[100] text-xs text-slate-700 dark:text-slate-200 w-64 max-w-[calc(100vw-24px)] animate-in fade-in slide-in-from-top-2 duration-150";

  const tooltipTitleClass =
    "font-bold text-sm text-slate-900 dark:text-white mb-2 pb-2 border-b border-slate-200 dark:border-[#373C43] flex items-center justify-between";

  const dividerClass =
    "h-4 w-px bg-slate-300 dark:bg-[#4A5059] mx-1.5 lg:mx-3 shrink-0";

  const statusButtonClass =
    "rounded-lg px-2 py-1.5 lg:px-2.5 flex items-center gap-1.5 lg:gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#373C43]/50 transition-all cursor-pointer focus:outline-none whitespace-nowrap";

  return (
    <div className="healthbar-container relative flex items-center justify-end gap-0.5 lg:gap-2 h-full min-w-0 select-none">

      {/* COMM */}
      <button
        type="button"
        onClick={() => toggleTooltip("comm")}
        className={statusButtonClass}
        title="Communication Status"
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 ${getStatusColor(commStatus)}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <rect x="2" y="13" width="2.5" height="4" rx="0.5" />
          <rect x="6.5" y="10" width="2.5" height="7" rx="0.5" />
          <rect x="11" y="6" width="2.5" height="11" rx="0.5" />
          <rect x="15.5" y="2" width="2.5" height="15" rx="0.5" />
        </svg>
        <span className="text-[10px] lg:text-[11px] font-bold tracking-wide lg:tracking-wider uppercase">
          COMM
        </span>
      </button>

      <div className={dividerClass} />

      {/* TABLET */}
      <button
        type="button"
        onClick={() => toggleTooltip("tablet")}
        className={statusButtonClass}
        title="Tablet RTK GPS Status"
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 ${getStatusColor(tabletStatus)}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="2" width="16" height="20" rx="3" />
          <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="2.5" />
        </svg>
        <span className="text-[10px] lg:text-[11px] font-bold tracking-wide lg:tracking-wider uppercase">
          TABLET
        </span>
        {typeof (RtkData?.data as any)?.lat === "number" &&
          typeof (RtkData?.data as any)?.lon === "number" && (
            <span className="hidden xl:inline font-mono text-[10px] text-slate-600 dark:text-slate-300">
              {(RtkData.data as any).lat.toFixed(5)}, {(RtkData.data as any).lon.toFixed(5)}
            </span>
          )}
      </button>

      <div className={dividerClass} />

      {/* COMPASS / MAGNETOMETER HEADING */}
      <button
        type="button"
        onClick={() => toggleTooltip("compass")}
        className={statusButtonClass}
        title={
          isMagLive
            ? `ESP32 Magnetometer (${magData.port || "USB"}): ${headingDeg?.toFixed(1)}° ${headingCardinal}`
            : "Compass & ESP32 Magnetometer Heading"
        }
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${getStatusColor(compassStatus)}`}
          style={{ transform: `rotate(${needleRotationDeg.toFixed(1)}deg)` }}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.8" strokeOpacity="0.45" />
          <polygon points="12,3.5 15.2,12 12,10.2 8.8,12" fill="currentColor" />
          <polygon points="12,20.5 14.5,12.5 12,13.8 9.5,12.5" fill="currentColor" fillOpacity="0.32" />
        </svg>
        <span className="font-mono text-[10px] lg:text-[11px] font-bold tracking-wide">
          {headingDeg !== null
            ? `${Math.round(headingDeg)}° ${headingCardinal}`
            : "NO MAG"}
        </span>
      </button>

      <div className={dividerClass} />

      {/* CAR */}
      <button
        type="button"
        onClick={() => toggleTooltip("car")}
        className={statusButtonClass}
        title="Vehicle Health & GNSS"
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 ${getStatusColor(carStatus)}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9C2.1 11 2 11.5 2 12v4c0 .6.4 1 1 1h2" />
          <circle cx="7" cy="17" r="2" />
          <circle cx="17" cy="17" r="2" />
        </svg>
        <span className="text-[10px] lg:text-[11px] font-bold tracking-wide lg:tracking-wider uppercase">
          CAR
        </span>
      </button>

      <div className={dividerClass} />

      {/* CAMERA & AI */}
      <button
        type="button"
        onClick={() => toggleTooltip("camera")}
        className={statusButtonClass}
        title="Camera & AI Vision Status"
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 ${getStatusColor(cameraStatus)}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <span className="text-[10px] lg:text-[11px] font-bold tracking-wide lg:tracking-wider uppercase">
          CAMERA & AI
        </span>
      </button>

      {/* COMM TOOLTIP */}
      {activeTooltip === "comm" && (
        <div className={tooltipClass}>
          <div className={tooltipTitleClass}>
            <span>Communication Status</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isCommConnected
                  ? "bg-emerald-50 dark:bg-[#01B656]/20 text-emerald-700 dark:text-[#01B656] border border-emerald-200 dark:border-[#01B656]/50"
                  : "bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60"
              }`}
            >
              {isCommConnected ? "Connected" : "Offline"}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-[#8C939C]">
                Active Link:
              </span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {commLinkLabel}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-[#8C939C]">
                Ping / Latency:
              </span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {latency?.connected && latency?.ping != null
                  ? `${latency.ping} ms`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-[#8C939C]">
                Available nodes:
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {Math.max(
                  (availableCommunication as any[])?.length || 0,
                  (isCarComm ? 1 : 0) + (isAtcComm ? 1 : 0),
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* GNSS TOOLTIP */}
      {activeTooltip === "gnss" && (
        <div className={tooltipClass}>
          <div className={tooltipTitleClass}>
            <span>GNSS Status</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                gnssStatus === "ok"
                  ? "bg-emerald-50 dark:bg-[#01B656]/20 text-emerald-700 dark:text-[#01B656] border border-emerald-200 dark:border-[#01B656]/50"
                  : gnssStatus === "warning"
                    ? "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
                    : "bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60"
              }`}
            >
              {(RtkData?.data as any)?.fix || "NO FIX"}
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Tablet Fix:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {(RtkData?.data as any)?.fix || "None"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Satellites:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {(RtkData?.data as any)?.satellites ?? "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TABLET TOOLTIP */}
      {activeTooltip === "tablet" && (
        <div className={tooltipClass}>
          <div className={tooltipTitleClass}>
            <span>Tablet RTK Receiver</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                tabletStatus === "ok"
                  ? "bg-emerald-50 dark:bg-[#01B656]/20 text-emerald-700 dark:text-[#01B656] border border-emerald-200 dark:border-[#01B656]/50"
                  : tabletStatus === "warning"
                    ? "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
                    : "bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60"
              }`}
            >
              {(RtkData?.data as any)?.fix || "NO FIX"}
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-[#8C939C]">
                Self GPS:
              </span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {typeof (RtkData?.data as any)?.lat === "number" &&
                typeof (RtkData?.data as any)?.lon === "number"
                  ? `${(RtkData.data as any).lat.toFixed(6)}, ${(RtkData.data as any).lon.toFixed(6)}`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-[#8C939C]">
                Satellites / Heading:
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {(RtkData?.data as any)?.satellites ?? "—"} ·{" "}
                {headingDeg !== null
                  ? `${headingDeg.toFixed(0)}° ${headingCardinal}${isMagLive ? " (Mag)" : ""}`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-[#8C939C]">
                Position Accuracy:
              </span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {(RtkData?.data as any)?.accuracy ?? (RtkData?.data as any)?.sd
                  ? `${(RtkData?.data as any)?.accuracy ?? (RtkData?.data as any)?.sd} m`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">HDOP:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {(RtkData?.data as any)?.hdop ?? "—"}
              </span>
            </div>
            {(RtkData?.data as any)?.source && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 dark:text-[#8C939C]">Source:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[160px]">
                  {(RtkData.data as any).source}
                </span>
              </div>
            )}
            {(RtkData?.data as any)?.error && (
              <div className="pt-1 text-[11px] text-rose-500 dark:text-rose-400 break-words">
                {(RtkData.data as any).error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* COMPASS & MAGNETOMETER TOOLTIP */}
      {activeTooltip === "compass" && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`${tooltipClass} !w-80 cursor-default`}
        >
          <div className={tooltipTitleClass}>
            <span>Compass & Magnetometer</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isCalibrating
                  ? "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
                  : isMagLive
                    ? "bg-emerald-50 dark:bg-[#01B656]/20 text-emerald-700 dark:text-[#01B656] border border-emerald-200 dark:border-[#01B656]/50"
                    : headingDeg !== null
                      ? "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
                      : "bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60"
              }`}
            >
              {isCalibrating
                ? "CALIBRATING"
                : isMagLive
                  ? "LIVE MAG"
                  : headingDeg !== null
                    ? "GNSS"
                    : "OFFLINE"}
            </span>
          </div>

          {/* 72x72 SVG Compass Rose + Primary Heading Readout */}
          <div className="flex items-center gap-3.5 pb-3 mb-3 border-b border-slate-200 dark:border-[#373C43]">
            <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
              <circle
                cx="36"
                cy="36"
                r="31"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.18"
                strokeWidth="1.5"
              />
              <circle
                cx="36"
                cy="36"
                r="23"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.1"
                strokeDasharray="2 3"
                strokeWidth="1"
              />
              <text x="36" y="12" textAnchor="middle" fontSize="8" fontWeight="700" fill="#EF4444">
                N
              </text>
              <text x="63" y="39" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" fillOpacity="0.6">
                E
              </text>
              <text x="36" y="67" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" fillOpacity="0.6">
                S
              </text>
              <text x="9" y="39" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" fillOpacity="0.6">
                W
              </text>
              <g
                style={{
                  transform: `rotate(${needleRotationDeg.toFixed(1)}deg)`,
                  transformOrigin: "36px 36px",
                  transition: "transform 120ms linear",
                }}
              >
                <polygon points="36,14 40.5,36 36,33 31.5,36" fill="#EF4444" />
                <polygon points="36,58 40,36 36,39 32,36" fill="#64748B" fillOpacity="0.65" />
                <circle cx="36" cy="36" r="2.6" fill="#E2E8F0" stroke="#0F172A" strokeWidth="1" />
              </g>
            </svg>

            <div className="min-w-0 flex-1">
              <div className="font-mono text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
                {headingDeg !== null
                  ? `${headingDeg.toFixed(1)}° ${headingCardinal}`
                  : "—°"}
              </div>
              <div className="mt-1.5 text-[11px] text-slate-500 dark:text-[#8C939C] truncate">
                {isMagLive
                  ? `ESP32 HMC5883L · ${magData.port || "USB Serial"}`
                  : headingDeg !== null
                    ? "Fallback: GNSS Course"
                    : "Waiting for ESP32 USB stream"}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono">
                <span
                  className={`px-1.5 py-0.5 rounded border ${
                    magData?.calibrated
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : "bg-slate-100 dark:bg-[#22262B] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#373C43]"
                  }`}
                >
                  {magData?.calibrated ? "Calibrated" : "Uncalibrated"}
                </span>
                {typeof magData?.sampleRateHz === "number" && isMagLive && (
                  <span className="text-slate-500 dark:text-slate-400">
                    {magData.sampleRateHz.toFixed(1)} Hz
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Live Raw Vector Telemetry */}
          <div className="space-y-1.5 mb-3">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-[#8C939C]">Raw X / Y / Z:</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                {typeof magData?.mx === "number"
                  ? `${magData.mx}, ${magData.my}, ${magData.mz}`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-[#8C939C]">Field |B|:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {typeof magData?.fieldStrength === "number" ? magData.fieldStrength.toFixed(1) : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-2 items-center">
              <span className="text-slate-500 dark:text-[#8C939C]">Serial Port:</span>
              <div className="flex items-center gap-1">
                <select
                  value={selectedPort}
                  disabled={magBusy}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedPort(next);
                    runMagAction(
                      "mag_set_port",
                      { port: next === "auto" ? null : next },
                      `Magnetometer port set to ${next === "auto" ? "Auto" : next}`,
                    );
                  }}
                  className="bg-slate-100 dark:bg-[#22262B] border border-slate-300 dark:border-[#373C43] rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-800 dark:text-slate-100 outline-none max-w-[165px]"
                >
                  <option value="auto">Auto (ESP32 USB)</option>
                  {serialPorts.map((p) => (
                    <option key={p.portName} value={p.portName} title={p.description}>
                      {p.portName}
                      {p.isEsp32Bridge ? " [ESP32]" : p.isUblox ? " [GNSS]" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={refreshSerialPorts}
                  title="Rescan serial ports"
                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#22262B] dark:hover:bg-[#373C43] border border-slate-300 dark:border-[#373C43] text-[10px] font-mono cursor-pointer"
                >
                  ↻
                </button>
              </div>
            </div>
          </div>

          {magData?.error && (
            <div className="mb-3 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-[11px] text-rose-600 dark:text-rose-300 break-words">
              {magData.error}
            </div>
          )}

          {/* Calibration & Alignment Controls */}
          <div className="pt-2.5 border-t border-slate-200 dark:border-[#373C43] space-y-2">
            {isCalibrating ? (
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/50 space-y-2">
                <div className="text-[11px] text-amber-800 dark:text-amber-200 font-medium">
                  Rotate device 360° smoothly ({magData?.calSamples ?? 0} samples · span{" "}
                  {magData?.calSpanX ?? 0}×{magData?.calSpanY ?? 0})
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={magBusy}
                    onClick={() =>
                      runMagAction("mag_finish_calibration", undefined, "360° calibration applied")
                    }
                    className="py-1 px-2 rounded-lg bg-[#01B656] hover:bg-[#009E48] text-white font-semibold text-[11px] cursor-pointer disabled:opacity-50"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    disabled={magBusy}
                    onClick={() => runMagAction("mag_cancel_calibration")}
                    className="py-1 px-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-[#353A42] dark:hover:bg-[#41464E] text-slate-800 dark:text-slate-200 font-semibold text-[11px] cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={magBusy || !isMagLive}
                  onClick={() => runMagAction("mag_start_calibration")}
                  className="py-1.5 px-2 rounded-lg bg-[#4C9FE8] hover:bg-[#3a8fd9] text-white font-semibold text-[11px] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  360° Calibrate
                </button>
                <button
                  type="button"
                  disabled={magBusy || !isMagLive}
                  onClick={() =>
                    runMagAction("mag_set_zero_north", undefined, "Aligned current direction to 0° North")
                  }
                  className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#353A42] dark:hover:bg-[#41464E] border border-slate-200 dark:border-[#454B53] text-slate-800 dark:text-slate-100 font-semibold text-[11px] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  Zero North
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5 items-end text-[10px]">
              <label className="flex flex-col gap-0.5">
                <span className="text-slate-500 dark:text-[#8C939C]">Offset (°)</span>
                <input
                  type="number"
                  step="1"
                  value={offsetDraft}
                  onChange={(e) => setOffsetDraft(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(offsetDraft);
                    if (Number.isFinite(v)) {
                      runMagAction("mag_update_settings", { headingOffsetDeg: v });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = parseFloat(offsetDraft);
                      if (Number.isFinite(v)) {
                        runMagAction("mag_update_settings", { headingOffsetDeg: v });
                      }
                    }
                  }}
                  className="w-full bg-slate-100 dark:bg-[#22262B] border border-slate-300 dark:border-[#373C43] rounded px-1.5 py-1 font-mono text-[11px] text-slate-800 dark:text-white outline-none"
                />
              </label>

              <label className="flex flex-col gap-0.5">
                <span className="text-slate-500 dark:text-[#8C939C]">Decl (°)</span>
                <input
                  type="number"
                  step="0.5"
                  value={declDraft}
                  onChange={(e) => setDeclDraft(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(declDraft);
                    if (Number.isFinite(v)) {
                      runMagAction("mag_update_settings", { declinationDeg: v });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = parseFloat(declDraft);
                      if (Number.isFinite(v)) {
                        runMagAction("mag_update_settings", { declinationDeg: v });
                      }
                    }
                  }}
                  className="w-full bg-slate-100 dark:bg-[#22262B] border border-slate-300 dark:border-[#373C43] rounded px-1.5 py-1 font-mono text-[11px] text-slate-800 dark:text-white outline-none"
                />
              </label>

              <div className="flex flex-col gap-1">
                <label className="flex items-center justify-between gap-1 cursor-pointer bg-slate-100 dark:bg-[#22262B] border border-slate-300 dark:border-[#373C43] rounded px-1.5 py-1">
                  <span className="text-slate-700 dark:text-slate-200 font-medium">Invert</span>
                  <input
                    type="checkbox"
                    checked={Boolean(magData?.invertDirection)}
                    onChange={(e) =>
                      runMagAction("mag_update_settings", { invertDirection: e.target.checked })
                    }
                    className="accent-[#4C9FE8] cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={magBusy}
                onClick={() => {
                  setOffsetDraft("0");
                  setDeclDraft("0");
                  runMagAction("mag_reset_calibration", undefined, "Calibration reset");
                }}
                className="text-[10px] text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 underline cursor-pointer"
              >
                Reset Calibration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAR TOOLTIP */}
      {activeTooltip === "car" && (
        <div className={`${tooltipClass} w-72`}>
          <div className={tooltipTitleClass}>
            <span>Vehicle Telemetry</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                carStatus === "ok"
                  ? "bg-emerald-50 dark:bg-[#01B656]/20 text-emerald-700 dark:text-[#01B656] border border-emerald-200 dark:border-[#01B656]/50"
                  : carStatus === "warning"
                    ? "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
                    : "bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60"
              }`}
            >
              {(carData?.data as any)?.primary_data?.fix || "OFFLINE"}
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-[#8C939C]">Primary Fix:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {(carData?.data as any)?.primary_data?.fix || "None"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-[#8C939C]">Secondary Fix:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {(carData?.data as any)?.secondary_data?.fix || "None"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Speed:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {(carData?.data as any)?.speed != null
                  ? `${(carData?.data as any).speed} km/h`
                  : "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CAMERA & AI DROPDOWN */}
      {activeTooltip === "camera" && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full right-0 mt-2 sm:mt-3 w-[min(330px,calc(100vw-24px))] bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-xl sm:rounded-2xl shadow-2xl p-3 sm:p-4 z-[100] cursor-default animate-in fade-in slide-in-from-top-2 duration-150 select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 sm:pb-3 mb-2 sm:mb-3 border-b border-slate-200 dark:border-[#373C43] gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white tracking-tight">
                Camera & Vision BITE
              </h4>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-[#8C939C]">
                26-Camera Array Status
              </p>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold whitespace-nowrap ${
                onlineCount === 26
                  ? "bg-emerald-50 dark:bg-[#01B656]/20 text-emerald-700 dark:text-[#01B656] border border-emerald-200 dark:border-[#01B656]/50"
                  : onlineCount > 0
                    ? "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50"
                    : "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50"
              }`}
            >
              {onlineCount}/26 Online
            </span>
          </div>

          {/* Camera Grid */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {fixedHealth.map((e: any, index: number) => {
              const isPaused = Boolean(e?.pause || e?.PAUSE);
              const fps = e?.INTR_FPS ?? 0;
              const hasLowFPS = (e?.INTR_FPS ?? 100) < AI_THRESHOLD;
              const isConnected = Boolean(e && e.CAMERA_CONNECTION);

              let badgeBg =
                "bg-slate-100 dark:bg-[#22262B] text-slate-500 dark:text-[#8C939C] hover:bg-slate-200 dark:hover:bg-[#373C43]";

              let statusDesc = "No Signal / Unconfigured";

              if (e) {
                if (!isConnected) {
                  badgeBg = "bg-rose-500 text-white hover:bg-rose-600";
                  statusDesc = "Disconnected";
                } else if (isPaused) {
                  badgeBg = "bg-amber-400 text-slate-900 hover:bg-amber-500";
                  statusDesc = "Paused";
                } else if (hasLowFPS) {
                  badgeBg = "bg-amber-400 text-slate-900 hover:bg-amber-500";
                  statusDesc = `Low FPS (${fps})`;
                } else {
                  badgeBg = "bg-[#01B656] text-white hover:bg-[#009E48]";
                  statusDesc = `Normal (${fps} FPS)`;
                }
              }

              const isSelected = selectedCam?.index === index;

              return (
                <button
                  key={index}
                  type="button"
                  onClick={(ev) => handleCameraClick(ev, e, index)}
                  title={`Camera #${index + 1}: ${statusDesc}`}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center font-mono text-[10px] sm:text-xs font-bold transition-all duration-150 active:scale-95 ${badgeBg} ${
                    isSelected
                      ? "ring-2 ring-[#4C9FE8] ring-offset-2 ring-offset-white dark:ring-offset-[#292D33] scale-110 z-10"
                      : ""
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          {/* Selected Camera Details */}
          {selectedCam && (
            <div className="mt-3 p-3 bg-slate-50 dark:bg-[#22262B] border border-slate-200 dark:border-[#373C43] rounded-xl animate-in fade-in duration-150">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="font-bold text-xs text-slate-900 dark:text-white">
                  Camera #{selectedCam.index + 1}
                </span>

                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    selectedCam.data?.CAMERA_CONNECTION
                      ? "bg-emerald-50 dark:bg-[#01B656]/20 text-emerald-700 dark:text-[#01B656] border border-emerald-200 dark:border-[#01B656]/50"
                      : "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50"
                  }`}
                >
                  {selectedCam.data?.CAMERA_CONNECTION
                    ? "CONNECTED"
                    : "DISCONNECTED"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                <div>
                  <span className="text-slate-500 dark:text-[#8C939C]">
                    CAM ID:{" "}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {selectedCam.data?.CAM_ID ||
                      selectedCam.data?.sysid ||
                      `CAM-${selectedCam.index + 1}`}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 dark:text-[#8C939C]">
                    FPS:{" "}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {selectedCam.data?.INTR_FPS ?? "—"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-[#373C43] flex items-center justify-between gap-2 text-[9px] sm:text-[10px] text-slate-500 dark:text-[#8C939C] font-medium">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#01B656]" />
              <span>Normal</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Low FPS / Pause</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Offline</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthBar;
