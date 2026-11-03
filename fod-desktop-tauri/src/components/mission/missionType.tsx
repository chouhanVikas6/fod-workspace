import RestPath from "@/constants/apiPaths";
import { start_Mission } from "@/store/slices/missionState-slice";
import axiosClient from "@/utils/axios";
import React, { useState } from "react";
import { useDispatch } from "react-redux";
import MissionCard from "./missionCard";
import Image from "next/image";
import { toast } from "react-toastify";
import MissionTemplate from "./missionTemplate";
// import { useDispatch } from "react-redux";
// import { startNewMission } from "../../redux/actions/MissionSelector";

import { RootState } from "@/store";
import { useSelector } from "react-redux";

const MissionType = ({ activeMission, selectedMission, startTemplateView, missionTemplateView, isCarLive }: any) => {
    const [apiLoading, setApiLoading] = useState(false);
    const dispatch = useDispatch();

    const health = useSelector((state: RootState) => state.SystemHealth);
    const carLive = isCarLive !== undefined
        ? isCarLive
        : Boolean(
            health?.latency?.connected ||
            (health?.availableCommunication as any[])?.some((c: any) => c?.type === 'car' || c?.type?.startsWith('car'))
        );

    function restartMission(id: any) {
        if (!carLive) {
            toast.error('Vehicle is not in communication');
            return;
        }
        setApiLoading(true);
        axiosClient({
            method: "GET",
            url: RestPath.RESTARTMISSIONWITHID(id)
        }).then((response) => {
            if (response?.data?.id) {
                dispatch(start_Mission({ ...response.data, isActive: true, duration: response.data.timer ?? 0 }));
            } else {
                toast.error(response?.data?.error || 'Failed to restart mission');
            }
        }).catch((error) => {
            toast.error(error?.data?.error || 'Failed to restart mission — is the vehicle connected?');
        }).finally(()=>{
            setApiLoading(false);
        })
    }

    function loadMission(id: any) {
        if (!carLive) {
            toast.error('Vehicle is not in communication');
            return;
        }
        axiosClient({
            method: "GET",
            url: RestPath.LOADMISSIONWITHID(id)
        }).then((response) => {
            if (response?.data?.id) {
                dispatch(start_Mission({ ...response.data, isActive: true, duration: response.data.timer ?? 0 }));
            } else {
                toast.error(response?.data?.error || 'Failed to load mission');
            }
        }).catch((error) => {
            toast.error(error?.data?.error || 'Failed to load mission');
        })
    }

    function newMission() {
        if (!carLive) {
            toast.error('Vehicle is not in communication');
            return;
        }
        startTemplateView()
    }
    return (
        <div className="w-full p-2.5 bg-white border border-slate-200/90 rounded-2xl shadow-sm flex items-center justify-center flex-shrink-0 min-h-[72px]">
            {
                (carLive && activeMission?.length) ?
                    activeMission.map((mission: any) => {
                        return <MissionCard active={true} missionData={mission} key={mission.mission_id} isCarLive={carLive} />
                    })
                    :
                    <div className="w-full flex justify-center items-center">
                        {
                            selectedMission ?
                                <button
                                    className={`w-full py-2.5 px-4 rounded-xl text-center text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] ${
                                        apiLoading || !carLive
                                            ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none active:scale-100"
                                            : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20"
                                    }`}
                                    disabled={apiLoading || !carLive}
                                    title={!carLive ? "Vehicle not in communication" : undefined}
                                    onClick={() => restartMission(selectedMission.mission_id)}
                                >
                                    Restart Mission #{selectedMission.mission_id}
                                </button>
                                :
                                <button
                                    className={`w-full py-2.5 px-4 rounded-xl text-center text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-center space-x-2 ${
                                        apiLoading || missionTemplateView || !carLive
                                            ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none active:scale-100"
                                            : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20"
                                    }`}
                                    onClick={newMission}
                                    disabled={apiLoading || missionTemplateView || !carLive}
                                    title={!carLive ? "Vehicle not in communication" : undefined}
                                >
                                    <span>Start Mission</span>
                                </button>
                        }
                    </div>
            }
        </div>
    );
}

export default MissionType;
