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
            <div className="h-full w-full flex items-center gap-4 bg-slate-100/70 p-4 overflow-hidden select-none">
                <div className="h-full w-[28%] min-w-[280px] max-w-[340px] flex flex-col gap-3">
                    <MissionType activeMission={activeMission} selectedMission={selectedMission} startTemplateView={startTemplateView} missionTemplateView={missionTemplateView} />
                    <div className="flex items-center justify-between px-2 shrink-0">
                        <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Missions</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-200/80 font-bold text-[11px] text-slate-600 font-mono">
                                {missions.length}
                            </span>
                        </div>
                        <button
                            onClick={fetchMission}
                            title="Refresh missions"
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 active:scale-90 transition-all focus:outline-none"
                        >
                            <Image src={refreshIcon} width={18} height={18} alt="Refresh" />
                        </button>
                    </div>
                    <PastMission {...{ missions, setMission, selectedMission }} />
                </div>
                <div className="relative h-full flex-1 bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden flex items-center justify-center">
                    {
                        currentScreen == 'MissionTemplate' ?
                            <MissionTemplate {...{ stopTemplateView }} /> :
                            currentScreen == 'MissionExplore' ?
                                <MissionExplore {...{ stopTemplateView, selectedMission }} /> :
                                <div className="flex flex-col items-center justify-center text-center p-8 max-w-md space-y-6">
                                    <div className="relative flex items-center justify-center">
                                        <div className="absolute w-28 h-28 bg-blue-500/10 rounded-full blur-2xl" />
                                        <div className="relative flex items-center space-x-3 scale-125">
                                            <ZoidLogoSvgr />
                                            <span className="text-3xl font-black text-slate-900 tracking-wider font-sans">ZOID</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <h2 className="text-lg font-bold text-slate-800 tracking-tight">Mission Operations Center</h2>
                                        <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
                                            Select a past mission from the sidebar to review FOD detections and telemetry, or start a new scanning operation.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2.5 w-full pt-2">
                                        <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col items-center text-center space-y-1">
                                            <span className="text-lg">🎯</span>
                                            <span className="text-[11px] font-bold text-slate-700">AI Detection</span>
                                            <span className="text-[9px] text-slate-400">Real-time FODs</span>
                                        </div>
                                        <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col items-center text-center space-y-1">
                                            <span className="text-lg">🛰️</span>
                                            <span className="text-[11px] font-bold text-slate-700">Centimeter RTK</span>
                                            <span className="text-[9px] text-slate-400">High Precision</span>
                                        </div>
                                        <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col items-center text-center space-y-1">
                                            <span className="text-lg">📸</span>
                                            <span className="text-[11px] font-bold text-slate-700">Multi-Camera</span>
                                            <span className="text-[9px] text-slate-400">26 Cam BITE</span>
                                        </div>
                                    </div>
                                </div>
                    }
                </div>
            </div>
        </>
    );
};

export default MissionSelector;
