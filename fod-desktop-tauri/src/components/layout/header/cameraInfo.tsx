import React, { useState, useEffect, useMemo } from "react";
import CameraIcon from "@/assets/images/svg/header/Camera.svg";
import Image from "next/image";
import { useSelector } from "react-redux";
import { config } from "@/config/clientConfig";
import { RootState } from "@/store";

const CamerasInfo = ({ isToolTipVisible }) => {
    const AI_THRESHOLD = useMemo(() => Number(process.env.AI_THRESHOLD) || 25, []);
    const [selectedCam, setSelectedCam] = useState<{ index: number; data: any } | null>(null);
    const [showTooltipOnHover, setShowTooltipOnHover] = useState(false);
    const [showTooltipOnClick, setShowTooltipOnClick] = useState(false);
    
    const rawHealth = useSelector((state: RootState) => state.SystemHealth.AiHealth.data);
    // Health may arrive as an array (bite SSE) or a sysid-keyed object from
    // older socket payloads — normalize so a bad shape can't crash the header.
    const health = useMemo(
        () => (Array.isArray(rawHealth) ? rawHealth : Object.values(rawHealth || {})) as Array<{ CAMERA_CONNECTION?: boolean; INTR_FPS?: number }>,
        [rawHealth]
    );

    const camStatus = useMemo(() => {
        if (!health || health.length === 0) return 'health-Status-Error';
        let hasConnectionIssue = health.some(ele => !ele?.CAMERA_CONNECTION);
        let hasLowFPSOrPause = health.some(ele => (ele?.INTR_FPS ?? 100) < AI_THRESHOLD || (ele as any)?.pause || (ele as any)?.PAUSE);
        if (hasConnectionIssue) return 'health-Status-Error';
        if (hasLowFPSOrPause) return 'health-Status-Problem';
        return 'health-Status-Ok';
    }, [health, AI_THRESHOLD]);

    useEffect(() => {
        if (!isToolTipVisible) {
            setShowTooltipOnClick(false);
            setSelectedCam(null);
        }
    }, [isToolTipVisible]);

    const fixedHealth = useMemo(() => {
        const fixed = new Array(26).fill(null);
        health.forEach((h, idx) => {
            const camId = (h as any)?.CAM_ID || (h as any)?.sysid;
            const camNum = camId && (config as any)?.cameraMap ? (config as any).cameraMap[camId] : undefined;
            if (camNum !== undefined && camNum >= 1 && camNum <= 26) {
                fixed[camNum - 1] = h;
            } else if (idx < 26 && !fixed[idx]) {
                fixed[idx] = h;
            }
        });
        return fixed;
    }, [health]);

    const onlineCount = useMemo(() => {
        return fixedHealth.filter(c => c && c.CAMERA_CONNECTION).length;
    }, [fixedHealth]);

    const handleCameraClick = (e: React.MouseEvent, camera: any, index: number) => {
        e.stopPropagation();
        if (selectedCam?.index === index) {
            setSelectedCam(null);
        } else {
            setSelectedCam({ index, data: camera });
        }
    };

    return (
        <div 
            className="healthbar-component relative" 
            onMouseEnter={() => setShowTooltipOnHover(true)} 
            onMouseLeave={() => setShowTooltipOnHover(false)} 
            onClick={() => setShowTooltipOnClick(prev => !prev)}
        >
            <span className="text-sm font-semibold text-slate-700">Camera & AI</span>
            <div className='healthbar-icon active:scale-95'>
                <Image src={CameraIcon} alt="Camera Icon" />
                <div className={`health-Status ${camStatus}`}></div>
            </div>
            {(showTooltipOnHover || showTooltipOnClick) && (
                <div 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-full mt-2.5 right-0 w-[320px] bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-4 z-[100] cursor-default animate-in fade-in slide-in-from-top-2 duration-150 select-none"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                        <div>
                            <h4 className="text-xs font-bold text-slate-800 tracking-tight">Camera & Vision BITE</h4>
                            <p className="text-[11px] text-slate-400">26-Camera Array Status</p>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            onlineCount === 26 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                : onlineCount > 0 
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                        }`}>
                            {onlineCount}/26 Online
                        </span>
                    </div>

                    {/* Camera Grid */}
                    <div className="grid grid-cols-7 gap-2">
                        {fixedHealth.map((e, index) => {
                            const isPaused = Boolean((e as any)?.pause || (e as any)?.PAUSE);
                            const fps = e?.INTR_FPS ?? 0;
                            const hasLowFPS = (e?.INTR_FPS ?? 100) < AI_THRESHOLD;
                            const isConnected = Boolean(e && e.CAMERA_CONNECTION);

                            let badgeBg = 'bg-slate-200 text-slate-500 hover:bg-slate-300';
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
                                    badgeBg = 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/30';
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
                                        isSelected ? 'ring-2 ring-blue-600 ring-offset-2 scale-110 z-10' : ''
                                    }`}
                                >
                                    {index + 1}
                                </button>
                            );
                        })}
                    </div>

                    {/* Selected Camera Details */}
                    {selectedCam && (
                        <div className="mt-3 p-3 bg-slate-50 border border-slate-200/90 rounded-xl animate-in fade-in duration-150">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="font-bold text-xs text-slate-800">
                                    Camera #{selectedCam.index + 1}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    selectedCam.data?.CAMERA_CONNECTION 
                                        ? 'bg-emerald-100 text-emerald-800' 
                                        : 'bg-rose-100 text-rose-800'
                                }`}>
                                    {selectedCam.data?.CAMERA_CONNECTION ? 'CONNECTED' : 'DISCONNECTED'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600">
                                <div>
                                    <span className="text-slate-400">CAM ID: </span>
                                    <span className="font-mono font-semibold text-slate-700">
                                        {(selectedCam.data as any)?.CAM_ID || (selectedCam.data as any)?.sysid || `CAM-${selectedCam.index + 1}`}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-400">FPS: </span>
                                    <span className="font-mono font-semibold text-slate-700">
                                        {selectedCam.data?.INTR_FPS ?? '—'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Legend */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                        <div className="flex items-center space-x-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
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

export default CamerasInfo;
