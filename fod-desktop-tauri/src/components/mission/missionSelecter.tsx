import React, { useEffect, useMemo, useState } from "react";
import MissionType from "./missionType";
import PastMission from "./pastMissions";
import axiosClient from "@/utils/axios";
import { useDispatch, useSelector } from "react-redux";
import { start_Mission } from "@/store/slices/missionState-slice";
import zoidBanner1 from "@/assets/images/zoidbanner.png"
import Image from "next/image";
import RestPath from "@/constants/apiPaths";
import { CircleLoader } from "../commen/loader";
import ZoidLogoSvgr from "@/assets/images/svgr/zoid-logo";
import refreshIcon from "@/assets/images/svg/refresh.svg"
import MissionTemplate from "./missionTemplate";
import MissionExplore from "./missionExplore";

// import { useSelector } from "react-redux";

const MissionSelector = () => {
    const [missionTemplateView,setMissionTemplateView]=useState(false);
    const [currentScreen,setCurrentScreen]=useState("");
    const [loading, setLoading] = useState(true);
    const [missions, setMissions] = useState([]);
    const [selectedMission, setSelectedMission] = useState(null);

    const fetchMission = () => {
        try {
            // if(missions.length==0)setLoading(true)
            axiosClient({
                method: "GET",
                url: RestPath.MISSIONWITHSTAT
            }).then((response) => {
                // Guard the shape — an error body here would crash the
                // .filter() calls below. Keep the previous list on failure
                // (this runs on a 1.5s poll, so no toast spam).
                if (Array.isArray(response.data)) {
                    setMissions(response.data);
                }
                setLoading(false);
            }).catch((error) => {
                console.log('Failed to fetch mission list:', error?.data?.error || error);
                setLoading(false);
            })
        } catch (e) {
            setMission([]);
            console.log(e);
            setLoading(false);
        }
    }

    //get mission list
    useEffect(() => {
        fetchMission()
        let interval = setInterval(() => {
            fetchMission()
        }, 1500)
        return () => clearInterval(interval)
    }, [])

    const setMission = (data) => {
        if (!!selectedMission && selectedMission.mission_id == data.mission_id) {
            setSelectedMission(null);
            setCurrentScreen('');
            return;
        }
        setCurrentScreen("MissionExplore");
        setSelectedMission(data)
    }

    const startTemplateView=()=>{
        setCurrentScreen('MissionTemplate')
    }

    const stopTemplateView=()=>{
        setCurrentScreen('');
    }


    //precalculated data
    const activeMission = useMemo(() => {
        return missions?.filter((mission) => mission.status === 'ACTIVE') || [];
    }, [missions]);
    const inActiveMission = useMemo(() => {
        return missions?.filter((mission) => mission.status === 'INACTIVE') || [];
    }, [missions]);

    if (loading) return <CircleLoader />;
    return (
        <>
            <div className=" top-0 left-0 h-full w-full flex justify-center items-center gap-4 z-[100] bg-[#FCFCFC] p-4">
                <div className="h-full w-1/4 flex flex-col gap-3">
                    <MissionType activeMission={activeMission} selectedMission={selectedMission} startTemplateView={startTemplateView}  missionTemplateView={missionTemplateView}/>
                    <div className="flex items-center justify-between px-1 shrink-0">
                        <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Missions</span>
                        <button onClick={fetchMission} title="Refresh missions" className="p-1 rounded hover:bg-gray-200 active:scale-90 transition-transform">
                            <Image src={refreshIcon} width={20} height={20} alt="Refresh" />
                        </button>
                    </div>
                    <PastMission {...{ missions, setMission, selectedMission }} />
                </div>
                <div className="relative h-full w-3/4 bg-[#F5F5F5] border border-[#dfd4d4] rounded-lg overflow-hidden flex items-center justify-around" >
                    {
                        currentScreen == 'MissionTemplate' ?
                            <MissionTemplate {...{ stopTemplateView }} /> :
                            currentScreen == 'MissionExplore' ?
                                <MissionExplore {...{ stopTemplateView,selectedMission }} /> :
                                <div className="flex flex-col items-center gap-4">
                                    <div className="flex space-x-5 scale-150">
                                        <ZoidLogoSvgr /><span className="text-[50px] my-auto">ZOID</span>
                                    </div>
                                    <p className="text-gray-400 text-sm">Select a mission from the list to explore it, or start a new one</p>
                                </div>
                    }
                    {/* <Image src={ZoidLogoSvgr} alt="" layout="fill" fetchPriority="low" /> */}
                </div>
            </div>
        </>
    );
};

export default MissionSelector;
