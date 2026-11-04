import React, { useEffect, useState, useMemo } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { useSSE } from "@/hooks/subscribeHealth";
import { config } from "@/config/clientConfig";

const HealthBar = () => {
  useSSE('/api/sse/health-data');
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [selectedCam, setSelectedCam] = useState<{ index: number; data: any } | null>(null);

  const { latency, availableCommunication, RtkData, carData, AiHealth } = useSelector(
    (state: RootState) => state.SystemHealth
  );

  // Close tooltips on outside click or escape
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

  // COMM status
  const isCommConnected = Boolean(
    latency?.connected ||
    (availableCommunication as any[])?.some((c: any) => c?.type === 'car' || c?.type?.startsWith('car'))
  );
  const commStatus = isCommConnected ? 'ok' : 'error';

  // GNSS status
  const gnssStatus = useMemo(() => {
    const fix = (RtkData?.data as any)?.fix;
    if (fix === 'RTK') return 'ok';
    if (fix === 'GPS') return 'warning';
    return 'error';
  }, [RtkData]);

  // Tablet status
  const tabletStatus = useMemo(() => {
    const fix = (RtkData?.data as any)?.fix;
    if (fix === 'RTK') return 'ok';
    if (fix === 'GPS') return 'warning';
    return 'error';
  }, [RtkData]);

  // Car status
  const carStatus = useMemo(() => {
    const primaryFix = (carData?.data as any)?.primary_data?.fix;
    const secondaryFix = (carData?.data as any)?.secondary_data?.fix;
    if (primaryFix === 'RTK' || secondaryFix === 'RTK') return 'ok';
    if (primaryFix === 'GPS' || secondaryFix === 'GPS') return 'warning';
    return 'error';
  }, [carData]);

  // Camera & AI status
  const AI_THRESHOLD = 25;
  const rawHealth = AiHealth?.data;
  const healthList = useMemo(
    () => (Array.isArray(rawHealth) ? rawHealth : Object.values(rawHealth || {})) as Array<any>,
    [rawHealth]
  );

  // 26-Camera Array Mapping (from last used Camera & AI BITE dropdown)
  const fixedHealth = useMemo(() => {
    const fixed = new Array(26).fill(null);
    healthList.forEach((h: any, idx: number) => {
      const camId = h?.CAM_ID || h?.sysid;
      const camNum = camId && (config as any)?.cameraMap ? (config as any).cameraMap[camId] : undefined;
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
    if (!healthList || healthList.length === 0) return 'error';
    const hasConnectionIssue = healthList.some(ele => !ele?.CAMERA_CONNECTION);
    const hasLowFPSOrPause = healthList.some(ele => (ele?.INTR_FPS ?? 100) < AI_THRESHOLD || ele?.pause || ele?.PAUSE);
    if (hasConnectionIssue) return 'error';
    if (hasLowFPSOrPause) return 'warning';
    return 'ok';
  }, [healthList]);

  const handleCameraClick = (e: React.MouseEvent, camera: any, index: number) => {
    e.stopPropagation();
    if (selectedCam?.index === index) {
      setSelectedCam(null);
    } else {
      setSelectedCam({ index, data: camera });
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'ok') return 'text-[#01B656]';
    if (status === 'warning') return 'text-[#F59E0B]';
    return 'text-[#EF4444]';
  };

  return (
    <div className="healthbar-container relative flex items-center space-x-2 h-full">
      {/* 1. COMM */}
      <button
        type="button"
        onClick={() => setActiveTooltip(activeTooltip === 'comm' ? null : 'comm')}
        className="bg-slate-100 hover:bg-slate-200/70 border border-slate-300/80 dark:bg-[#1E242B] dark:border-[#2A313C] dark:hover:border-[#3E4756] rounded-lg px-2.5 py-1.5 flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer focus:outline-none"
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
        <span className="text-[11px] font-bold tracking-wider uppercase text-slate-700 dark:text-slate-200">COMM</span>
      </button>

      {/* 2. GNSS */}
      <button
        type="button"
        onClick={() => setActiveTooltip(activeTooltip === 'gnss' ? null : 'gnss')}
        className="bg-slate-100 hover:bg-slate-200/70 border border-slate-300/80 dark:bg-[#1E242B] dark:border-[#2A313C] dark:hover:border-[#3E4756] rounded-lg px-2.5 py-1.5 flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer focus:outline-none"
        title="GNSS Satellites & Fix"
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 ${getStatusColor(gnssStatus)}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="text-[11px] font-bold tracking-wider uppercase text-slate-700 dark:text-slate-200">GNSS</span>
      </button>

      {/* 3. TABLET */}
      <button
        type="button"
        onClick={() => setActiveTooltip(activeTooltip === 'tablet' ? null : 'tablet')}
        className="bg-slate-100 hover:bg-slate-200/70 border border-slate-300/80 dark:bg-[#1E242B] dark:border-[#2A313C] dark:hover:border-[#3E4756] rounded-lg px-2.5 py-1.5 flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer focus:outline-none"
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
        <span className="text-[11px] font-bold tracking-wider uppercase text-slate-700 dark:text-slate-200">TABLET</span>
      </button>

      {/* 4. CAR */}
      <button
        type="button"
        onClick={() => setActiveTooltip(activeTooltip === 'car' ? null : 'car')}
        className="bg-slate-100 hover:bg-slate-200/70 border border-slate-300/80 dark:bg-[#1E242B] dark:border-[#2A313C] dark:hover:border-[#3E4756] rounded-lg px-2.5 py-1.5 flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer focus:outline-none"
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
        <span className="text-[11px] font-bold tracking-wider uppercase text-slate-700 dark:text-slate-200">CAR</span>
      </button>

      {/* 5. CAMERA & AI */}
      <button
        type="button"
        onClick={() => setActiveTooltip(activeTooltip === 'camera' ? null : 'camera')}
        className="bg-slate-100 hover:bg-slate-200/70 border border-slate-300/80 dark:bg-[#1E242B] dark:border-[#2A313C] dark:hover:border-[#3E4756] rounded-lg px-2.5 py-1.5 flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer focus:outline-none"
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
        <span className="text-[11px] font-bold tracking-wider uppercase text-slate-700 dark:text-slate-200">CAMERA & AI</span>
      </button>

      {/* Tooltip Popovers */}
      {/* COMM tooltip */}
      {activeTooltip === 'comm' && (
        <div className="absolute top-full right-0 mt-3 p-4 bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-xl shadow-2xl z-[100] text-xs text-slate-700 dark:text-slate-200 w-64 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="font-bold text-sm text-slate-900 dark:text-white mb-2 pb-1 border-b border-slate-200 dark:border-[#373C43] flex items-center justify-between">
            <span>Communication Status</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isCommConnected ? 'bg-[#01B656]/20 text-[#01B656] border border-[#01B656]/50' : 'bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'}`}>
              {isCommConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Ping / Latency:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{latency?.ping != null ? `${latency.ping} ms` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Available nodes:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{(availableCommunication as any[])?.length || 0}</span>
            </div>
          </div>
        </div>
      )}

      {/* GNSS tooltip */}
      {activeTooltip === 'gnss' && (
        <div className="absolute top-full right-0 mt-3 p-4 bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-xl shadow-2xl z-[100] text-xs text-slate-700 dark:text-slate-200 w-64 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="font-bold text-sm text-slate-900 dark:text-white mb-2 pb-1 border-b border-slate-200 dark:border-[#373C43] flex items-center justify-between">
            <span>GNSS Status</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${gnssStatus === 'ok' ? 'bg-[#01B656]/20 text-[#01B656] border border-[#01B656]/50' : gnssStatus === 'warning' ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60' : 'bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'}`}>
              {(RtkData?.data as any)?.fix || 'NO FIX'}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Tablet Fix:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{(RtkData?.data as any)?.fix || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Satellites:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{(RtkData?.data as any)?.satellites ?? '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* TABLET tooltip */}
      {activeTooltip === 'tablet' && (
        <div className="absolute top-full right-0 mt-3 p-4 bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-xl shadow-2xl z-[100] text-xs text-slate-700 dark:text-slate-200 w-64 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="font-bold text-sm text-slate-900 dark:text-white mb-2 pb-1 border-b border-slate-200 dark:border-[#373C43] flex items-center justify-between">
            <span>Tablet RTK Receiver</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tabletStatus === 'ok' ? 'bg-[#01B656]/20 text-[#01B656] border border-[#01B656]/50' : tabletStatus === 'warning' ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60' : 'bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'}`}>
              {(RtkData?.data as any)?.fix || 'NO FIX'}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Position Accuracy:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{(RtkData?.data as any)?.accuracy ? `${(RtkData?.data as any)?.accuracy} m` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">HDOP:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{(RtkData?.data as any)?.hdop ?? '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* CAR tooltip */}
      {activeTooltip === 'car' && (
        <div className="absolute top-full right-0 mt-3 p-4 bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-xl shadow-2xl z-[100] text-xs text-slate-700 dark:text-slate-200 w-72 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="font-bold text-sm text-slate-900 dark:text-white mb-2 pb-1 border-b border-slate-200 dark:border-[#373C43] flex items-center justify-between">
            <span>Vehicle Telemetry</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${carStatus === 'ok' ? 'bg-[#01B656]/20 text-[#01B656] border border-[#01B656]/50' : carStatus === 'warning' ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60' : 'bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'}`}>
              {(carData?.data as any)?.primary_data?.fix || 'OFFLINE'}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Primary Fix:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{(carData?.data as any)?.primary_data?.fix || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Secondary Fix:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{(carData?.data as any)?.secondary_data?.fix || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-[#8C939C]">Speed:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{(carData?.data as any)?.speed != null ? `${(carData?.data as any).speed} km/h` : '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. CAMERA & AI Dropdown (Last Used 26-Camera Array Grid from CamerasInfo) */}
      {activeTooltip === 'camera' && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full right-0 mt-3 w-[330px] bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-2xl shadow-2xl p-4 z-[100] cursor-default animate-in fade-in slide-in-from-top-2 duration-150 select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-[#373C43]">
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white tracking-tight">Camera & Vision BITE</h4>
              <p className="text-[11px] text-slate-500 dark:text-[#8C939C]">26-Camera Array Status</p>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              onlineCount === 26 
                ? 'bg-[#01B656]/20 text-[#01B656] border border-[#01B656]/50'
                : onlineCount > 0 
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50'
            }`}>
              {onlineCount}/26 Online
            </span>
          </div>

          {/* Camera Grid (7 columns matching original design) */}
          <div className="grid grid-cols-7 gap-2">
            {fixedHealth.map((e: any, index: number) => {
              const isPaused = Boolean(e?.pause || e?.PAUSE);
              const fps = e?.INTR_FPS ?? 0;
              const hasLowFPS = (e?.INTR_FPS ?? 100) < AI_THRESHOLD;
              const isConnected = Boolean(e && e.CAMERA_CONNECTION);

              let badgeBg = 'bg-slate-100 dark:bg-[#22262B] text-slate-500 dark:text-[#8C939C] hover:bg-slate-200 dark:hover:bg-[#373C43]';
              let statusDesc = 'No Signal / Unconfigured';
              if (e) {
                if (!isConnected) {
                  badgeBg = 'bg-rose-500 text-white hover:bg-rose-600 shadow-sm shadow-rose-500/30';
                  statusDesc = 'Disconnected';
                } else if (isPaused) {
                  badgeBg = 'bg-amber-400 text-slate-900 hover:bg-amber-500 shadow-sm shadow-amber-400/30';
                  statusDesc = 'Paused';
                } else if (hasLowFPS) {
                  badgeBg = 'bg-amber-400 text-slate-900 hover:bg-amber-500 shadow-sm shadow-amber-400/30';
                  statusDesc = `Low FPS (${fps})`;
                } else {
                  badgeBg = 'bg-[#01B656] text-white hover:bg-[#009E48] shadow-sm shadow-[#01B656]/30';
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
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold transition-all duration-150 active:scale-95 ${badgeBg} ${
                    isSelected ? 'ring-2 ring-[#4C9FE8] ring-offset-2 ring-offset-white dark:ring-offset-[#292D33] scale-110 z-10' : ''
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          {/* Selected Camera Details Box */}
          {selectedCam && (
            <div className="mt-3 p-3 bg-slate-50 dark:bg-[#22262B] border border-slate-200 dark:border-[#373C43] rounded-xl animate-in fade-in duration-150">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-xs text-slate-900 dark:text-white">
                  Camera #{selectedCam.index + 1}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  selectedCam.data?.CAMERA_CONNECTION 
                    ? 'bg-[#01B656]/20 text-[#01B656] border border-[#01B656]/50' 
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50'
                }`}>
                  {selectedCam.data?.CAMERA_CONNECTION ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                <div>
                  <span className="text-slate-500 dark:text-[#8C939C]">CAM ID: </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {selectedCam.data?.CAM_ID || selectedCam.data?.sysid || `CAM-${selectedCam.index + 1}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-[#8C939C]">FPS: </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {selectedCam.data?.INTR_FPS ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-[#373C43] flex items-center justify-between text-[10px] text-slate-500 dark:text-[#8C939C] font-medium">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-[#01B656]" />
              <span>Normal</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Low FPS / Pause</span>
            </div>
            <div className="flex items-center space-x-1.5">
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