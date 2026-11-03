import RestPath from "@/constants/apiPaths";
import { start_Mission } from "@/store/slices/missionState-slice";
import axiosClient from "@/utils/axios";
import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import { useTranslations } from "@/hooks/useTranslations";

import { RootState } from "@/store";
import { useSelector } from "react-redux";

const MissionCard = ({ missionData, active, setMission, selectedMission, index, isCarLive }: any) => {
    const dispatch = useDispatch();
    const t = useTranslations('common');
    const health = useSelector((state: RootState) => state.SystemHealth);
    const isDark = useSelector((state: RootState) => state.theme.theme === 'dark');
    const carLive = isCarLive !== undefined
        ? isCarLive
        : Boolean(
            health?.latency?.connected ||
            (health?.availableCommunication as any[])?.some((c: any) => c?.type === 'car' || c?.type?.startsWith('car'))
        );

    const { mission_id, total, cleared, rejected } = missionData || {};
    const isSelected = selectedMission?.mission_id === mission_id;

    function loadMission(id: any) {
        if (!carLive) {
            toast.error('Vehicle is not in communication');
            return;
        }
        axiosClient({
            method: "GET",
            url: RestPath.JOINMISSIONWITHID(id)
        }).then((response) => {
            let data = response.data;
            const mid = data?.missionId || data?.id;
            if (mid) {
                const duration = data?.duration ?? (data?.timer ? data.timer * 1000 : 0);
                dispatch(start_Mission({ id: mid, isActive: true, duration }));
            } else {
                toast.error(data?.error || 'Failed to join mission');
            }
        }).catch((error) => {
            toast.error(error?.data?.error || 'Failed to join mission — is the vehicle connected?');
        });
    }

    // Default thumbnails matching the reference screenshot:
    // First card: aerial overview; subsequent cards: driver-perspective pavement view
    const thumbnailSrc = missionData?.thumbnail || (index === 0 ? '/images/runway_aerial.jpg' : '/images/runway_pavement.jpg');

    if (active) {
        if (!carLive) return null;
        return (
            <div className={`w-full border-2 border-[#01B656] rounded-xl p-3 flex items-center justify-between gap-3 shadow select-none transition-colors ${
                isDark ? "bg-[#182F22]" : "bg-emerald-50"
            }`}>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#01B656] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#01B656]"></span>
                        </span>
                        <span className="font-bold text-[11px] uppercase tracking-wider text-[#01B656]">Live Mission</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                        Mission {mission_id}
                    </h4>
                </div>
                <button
                    onClick={() => loadMission(mission_id)}
                    className="py-1.5 px-3 bg-[#01B656] hover:bg-[#009E48] text-white font-bold text-xs rounded-lg shadow transition-all active:scale-95 shrink-0"
                >
                    Join
                </button>
            </div>
        );
    }

    return (
        <div
            className={`w-full rounded-xl p-3 border transition-all duration-150 cursor-pointer select-none flex items-center justify-between gap-3 active:scale-[0.99] ${
                isSelected
                    ? isDark
                        ? "border-[#4C9FE8] ring-1 ring-[#4C9FE8]/50 bg-[#313740] shadow"
                        : "border-[#4C9FE8] ring-1 ring-[#4C9FE8]/40 bg-blue-50/90 shadow-sm"
                    : isDark
                    ? "bg-[#292D33] hover:bg-[#2F343B] border-[#373C43] hover:border-[#464D56]"
                    : "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-xs"
            }`}
            onClick={() => setMission && setMission(missionData)}
        >
            {/* Left stats info */}
            <div className="flex-1 min-w-0 pr-1">
                <h4 className="text-[13px] font-bold text-slate-800 dark:text-white tracking-tight truncate">
                    Mission {mission_id}
                </h4>

                <div className="flex items-center gap-5 mt-2">
                    <div>
                        <div className="text-[10px] font-medium text-slate-500 dark:text-[#8C939C]">FOD</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                            {String(total ?? 0).padStart(2, '0')}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] font-medium text-slate-500 dark:text-[#8C939C]">Cleared</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                            {String(cleared ?? 0).padStart(2, '0')}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] font-medium text-slate-500 dark:text-[#8C939C]">False</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                            {String(rejected ?? 0).padStart(2, '0')}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right thumbnail photo */}
            <div className="w-[72px] h-[52px] rounded-md overflow-hidden border border-slate-200 dark:border-[#373C43] shrink-0 bg-slate-100 dark:bg-[#22262B]">
                <img
                    src={thumbnailSrc}
                    alt="Runway thumbnail"
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/runway_aerial.jpg';
                    }}
                />
            </div>
        </div>
    );
};

export default MissionCard;