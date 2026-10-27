import RestPath from "@/constants/apiPaths";
import { start_Mission } from "@/store/slices/missionState-slice";
import axiosClient from "@/utils/axios";
import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import { useTranslations } from "@/hooks/useTranslations";

const MissionCard = ({ missionData,active,setMission,selectedMission }:any) => {
    const dispatch=useDispatch()
    const t = useTranslations('common');
    // console.log(missionData)
    const { mission_id, total, cleared, rejected } = missionData;
    function loadMission(id){
            axiosClient({
                method:"GET",
                url:RestPath.JOINMISSIONWITHID(id)
            }).then((response)=>{
                let data=response.data;
                const mid = data?.missionId || data?.id;
                if (mid) {
                  const duration = data?.duration ?? (data?.timer ? data.timer * 1000 : 0);
                  dispatch(start_Mission({id:mid,isActive:true,duration}));
                } else {
                  toast.error(data?.error || 'Failed to join mission');
                }
            }).catch((error)=>{
                toast.error(error?.data?.error || 'Failed to join mission — is the vehicle connected?');
            })
    }

    const isSelected = selectedMission?.mission_id === mission_id;

    if (active) {
        return (
            <div className={`w-full bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-400/80 text-emerald-900 rounded-xl p-3.5 flex flex-col space-y-2.5 select-none relative shadow-sm`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                        <span className="font-bold text-xs uppercase tracking-wider text-emerald-800">Mission Active</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-emerald-900">#{mission_id}</span>
                </div>
                <button
                    onClick={() => loadMission(mission_id)}
                    className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors active:scale-95"
                >
                    Join Mission
                </button>
            </div>
        );
    }

    return (
        <div
            className={`w-full flex-shrink-0 bg-white rounded-xl p-3 space-y-2 cursor-pointer select-none relative transition-all duration-200 border ${
                isSelected
                    ? "border-blue-500 ring-2 ring-blue-500/20 shadow-md shadow-blue-500/10"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
            } active:scale-[0.99]`}
            onClick={() => setMission(missionData)}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${isSelected ? "bg-blue-600 ring-4 ring-blue-100" : "bg-slate-300"}`} />
                    <span className="font-bold text-sm text-slate-800 tracking-tight font-mono">
                        #{mission_id}
                    </span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {t('mission-number')}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100">
                <div className="flex flex-col items-center p-1.5 bg-amber-50/70 border border-amber-100/60 rounded-lg">
                    <span className="text-[9px] font-semibold text-amber-700/80 uppercase tracking-tight truncate max-w-full">Detected</span>
                    <span className="font-bold text-xs text-amber-900 font-mono mt-0.5">{total ?? 0}</span>
                </div>
                <div className="flex flex-col items-center p-1.5 bg-emerald-50/70 border border-emerald-100/60 rounded-lg">
                    <span className="text-[9px] font-semibold text-emerald-700/80 uppercase tracking-tight truncate max-w-full">Cleared</span>
                    <span className="font-bold text-xs text-emerald-900 font-mono mt-0.5">{cleared ?? 0}</span>
                </div>
                <div className="flex flex-col items-center p-1.5 bg-slate-50 border border-slate-100 rounded-lg">
                    <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-tight truncate max-w-full">False</span>
                    <span className="font-bold text-xs text-slate-700 font-mono mt-0.5">{rejected ?? 0}</span>
                </div>
            </div>
        </div>
    );
}

export default MissionCard;