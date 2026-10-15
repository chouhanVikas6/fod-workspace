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

const MissionType = ({ activeMission, selectedMission,startTemplateView ,missionTemplateView}: any) => {
    const [apiLoading, setApiLoading] = useState(false);
    const dispatch = useDispatch();

    function restartMission(id) {
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

    function loadMission(id) {
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
        startTemplateView()
        // setApiLoading(true);
        // axiosClient({
        //     method: "GET",
        //     url: RestPath.LOADNEWMISSION
        // }).then((response) => {
        //     if (!!response?.data?.id) {
        //         dispatch(start_Mission(response.data));
        //     } else {
        //         toast(response?.data?.message)
        //     }
        // }).catch((error) => {
        //     console.log(error);
        // }).finally(() => {
        //     setApiLoading(false);
        // })
    }
    return (
        <div className="h-1/6 w-full p-2.5 bg-[#F5F5F5] border border-[#dfd4d4] rounded-lg items-center overflow-y-auto relative">

            {
                activeMission?.length ?
                    activeMission.map((mission) => {
                        return <MissionCard active={true} missionData={mission} key={mission.mission_id} />
                    })
                    :
                    <div className=" h-full flex justify-around items-center gap-4">
                        {
                            selectedMission ?
                                <button className={`h-10 w-1/2 rounded-lg text-center text-[#FCFCFC] bg-[#017ED7] ${!!selectedMission ? "" : "bg-gray-400"}`} disabled={apiLoading} onClick={() => restartMission(selectedMission.mission_id)}>Restart Mission</button>
                                :
                                <button
                                    className={`h-10 w-1/2 rounded-lg text-center text-[#FCFCFC]  ${apiLoading || missionTemplateView?"bg-gray-400":"bg-[#002756]"}`}
                                    onClick={newMission}
                                    disabled={apiLoading || missionTemplateView}
                                >
                                    Start Mission
                                </button>
                        }

                    </div>
            }

        </div>
    );
}

export default MissionType;
