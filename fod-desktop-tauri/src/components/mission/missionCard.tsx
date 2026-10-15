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

    if(active){
        return  <div className={` w-full space-y-2  bg-[#FCFCFC] text-black rounded-lg p-4 flex flex-col justify-evenly user-select-none relative  active:shadow border active:border-gray-400 ${selectedMission?.mission_id==mission_id?"border-blue-500 border-2":"border-gray-300"}` }
        >
            {active?<div className="w-3 h-3 bg-green-600 absolute rounded-full font-bold text-lg top-[4px] right-2 animate-pulse"></div>:<></>}
            <div className="w-full text-center">Mission {mission_id} is Active</div>
            {active?<div className="mx-auto text-green-500 border border-gray-400 p-1 px-2 font-semibold rounded hover:bg-slate-100 active:scale-95 hover:text-green-400"
            onClick={()=>{loadMission(mission_id)}}>Join Mission</div>:<></>}
        </div>
    }
    return (
        <div className={`w-full flex-shrink-0 bg-[#FCFCFC] text-black rounded-lg p-3 space-y-1.5 cursor-pointer user-select-none relative transition-colors active:scale-[0.98] active:shadow border ${selectedMission?.mission_id==mission_id?"border-[#017ED7] border-2 shadow-sm":"border-gray-300 hover:border-gray-400"}` }
        onClick={()=>setMission(missionData)}
        >
            <div className="font-semibold text-[#002756]">{t('mission-number')} {mission_id}</div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">{t('fod-detected')}</span><span className="font-medium">{total}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">{t('fod-cleared')}</span><span className="font-medium">{cleared}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">{t('false-fods')}</span><span className="font-medium">{rejected}</span></div>
        </div>
    );
}

export default MissionCard;