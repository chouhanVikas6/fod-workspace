import React, { useEffect, useMemo, useState } from "react";
import PastMission from "./pastMissions";
import axiosClient from "@/utils/axios";
import { useDispatch, useSelector } from "react-redux";
import { start_Mission } from "@/store/slices/missionState-slice";
import RestPath from "@/constants/apiPaths";
import { CircleLoader } from "../commen/loader";
import zoidLogo from "@/assets/images/svg/zoid_logo.svg";
import MissionTemplate from "./missionTemplate";
import MissionExplore from "./missionExplore";
import MissionCard from "./missionCard";
import { RootState } from "@/store";
import { toast } from "react-toastify";

const MissionSelector = () => {
    const [currentScreen, setCurrentScreen] = useState("");
    const [loading, setLoading] = useState(true);
    const [missions, setMissions] = useState<any[]>([]);
    const [selectedMission, setSelectedMission] = useState<any>(null);

    const { latency, availableCommunication } = useSelector((store: RootState) => store.SystemHealth);
    const isDark = useSelector((store: RootState) => store.theme.theme === 'dark');
    const isCarLive = Boolean(
        latency?.connected ||
        (availableCommunication as any[])?.some((c: any) => c?.type === 'car' || c?.type?.startsWith('car'))
    );

    const fetchMission = () => {
        try {
            axiosClient({
                method: "GET",
                url: RestPath.MISSIONWITHSTAT
            }).then((response) => {
                if (Array.isArray(response.data)) {
                    setMissions(response.data);
                }
                setLoading(false);
            }).catch((error) => {
                console.log('Failed to fetch mission list:', error?.data?.error || error);
                setLoading(false);
            });
        } catch (e) {
            setMissions([]);
            console.log(e);
            setLoading(false);
        }
    };

    // Poll mission list every 2.5 seconds
    useEffect(() => {
        fetchMission();
        const interval = setInterval(() => {
            fetchMission();
        }, 2500);
        return () => clearInterval(interval);
    }, []);

    const setMission = (data: any) => {
        if (selectedMission && selectedMission.mission_id === data.mission_id) {
            setSelectedMission(null);
            setCurrentScreen('');
            return;
        }
        setCurrentScreen("MissionExplore");
        setSelectedMission(data);
    };

    const startTemplateView = () => {
        if (!isCarLive) {
            toast.error("Vehicle is not in communication");
            return;
        }
        setCurrentScreen('MissionTemplate');
    };

    const stopTemplateView = () => {
        setCurrentScreen('');
        setSelectedMission(null);
    };

    // Assign incremental 1-based displayId chronologically (oldest = 1, newest = N)
    const missionsWithDisplayId = useMemo(() => {
        if (!missions?.length) return [];
        const chronological = [...missions].sort((a, b) => {
            const ta = new Date(a.createdAt || a.created_at || 0).getTime() || Number(a.mission_id ?? a.id ?? 0);
            const tb = new Date(b.createdAt || b.created_at || 0).getTime() || Number(b.mission_id ?? b.id ?? 0);
            return ta - tb;
        });
        const displayIdMap = new Map<string, number>();
        chronological.forEach((m, i) => {
            displayIdMap.set(String(m.mission_id ?? m.id), i + 1);
        });
        return missions.map((m) => ({
            ...m,
            displayId: m.displayId ?? displayIdMap.get(String(m.mission_id ?? m.id)),
        }));
    }, [missions]);

    // Live active mission
    const activeMission = useMemo(() => {
        if (!isCarLive) return [];
        return missionsWithDisplayId?.filter((mission: any) => mission.status === 'ACTIVE') || [];
    }, [missionsWithDisplayId, isCarLive]);

    if (loading) return <CircleLoader />;

    return (
        <div className={`mission-selector-native-theme h-full w-full flex items-center gap-6 p-5 overflow-hidden select-none transition-colors duration-200 ${
            isDark ? "bg-[#22262B] text-slate-100" : "bg-[#F1F5F9] text-slate-900"
        }`}>
            {/* Left Column: Actions & Previous Missions */}
            <div className="h-full w-[270px] shrink-0 flex flex-col">
                {/* + Start New Mission Primary Button */}
                <button
                    onClick={startTemplateView}
                    className="w-full h-10 px-4 rounded-lg bg-[#4C9FE8] hover:bg-[#3B91DC] active:scale-[0.99] transition-all text-white font-bold text-sm flex items-center justify-center space-x-2 shadow cursor-pointer"
                >
                    <span>+ Start New Mission</span>
                </button>

                {/* If an active mission is currently running, show it as a high priority card */}
                {activeMission?.length > 0 && (
                    <div className="mt-3">
                        <MissionCard active={true} missionData={activeMission[0]} isCarLive={isCarLive} />
                    </div>
                )}

                {/* Previous Missions Header */}
                <div className="flex items-center justify-between px-1 mt-4 mb-2.5 shrink-0">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8C939C] uppercase tracking-wider">
                        PREVIOUS MISSIONS
                    </span>
                    <span className="text-xs font-semibold text-[#4C9FE8] font-mono">
                        {missions.length} total
                    </span>
                </div>

                {/* Previous Missions List */}
                <PastMission {...{ missions: missionsWithDisplayId, setMission, selectedMission }} />
            </div>

            {/* Right Main Area */}
            <div className={`relative h-full flex-1 overflow-hidden flex items-center justify-center transition-colors duration-200 ${
                currentScreen
                    ? isDark
                        ? "bg-[#292D33] border border-[#373C43] rounded-2xl"
                        : "bg-white border border-slate-200 shadow-sm rounded-2xl"
                    : ""
            }`}>
                {currentScreen === 'MissionTemplate' ? (
                    <MissionTemplate {...{ stopTemplateView, nextDisplayId: missions.length + 1 }} />
                ) : currentScreen === 'MissionExplore' ? (
                    <MissionExplore {...{ stopTemplateView, selectedMission }} />
                ) : (
                    <div className="relative w-full h-full flex flex-col items-center justify-center select-none">
                        {/* Centered Logo & Brand Info */}
                        <div className="flex flex-col items-center justify-center text-center -mt-6">
                            <img
                                src={zoidLogo}
                                alt="ZOID Logo"
                                className="w-16 h-16 object-contain mb-3"
                            />
                            <h1 className="text-3xl font-serif font-bold tracking-[0.22em] text-slate-800 dark:text-white">
                                ZOID
                            </h1>
                            <p className="text-slate-500 dark:text-[#8C939C] text-xs mt-3 text-center max-w-sm leading-relaxed">
                                Select a mission from the list to review it, or start a new mission.
                            </p>
                        </div>

                        {/* Floating Action Button (+) */}
                        <button
                            onClick={startTemplateView}
                            title="Start New Mission"
                            className="absolute bottom-6 right-6 w-14 h-14 rounded-full border-2 border-[#4C9FE8] bg-transparent hover:bg-[#4C9FE8]/10 active:scale-95 flex items-center justify-center text-[#4C9FE8] shadow-lg transition-all cursor-pointer"
                        >
                            <span className="text-3xl font-light leading-none -mt-0.5">+</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MissionSelector;
