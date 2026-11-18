import React, { useEffect, useMemo, useState } from "react";
import PastMission from "./pastMissions";
import axiosClient from "@/utils/axios";
import { useDispatch, useSelector } from "react-redux";
import { start_Mission } from "@/store/slices/missionState-slice";
import RestPath from "@/constants/apiPaths";
import { MissionSelectorSkeleton } from "../commen/Skeleton";
import zoidLogo from "@/assets/images/svg/zoid_logo.svg";
import MissionTemplate from "./missionTemplate";
import MissionExplore from "./missionExplore";
import MissionCard from "./missionCard";
import { RootState } from "@/store";
import { useTranslations } from "@/hooks/useTranslations";
import { Calendar, ArrowUpDown, X } from "lucide-react";
import { toast } from "react-toastify";
import { DatePickerPopover } from "./DatePickerPopover";

const MissionSelector = () => {
    const t = useTranslations("missions");
    const [currentScreen, setCurrentScreen] = useState("");
    const [loading, setLoading] = useState(true);
    const [missions, setMissions] = useState<any[]>([]);
    const [showDateControls, setShowDateControls] = useState(false);
    const [dateFilterMode, setDateFilterMode] = useState<"all" | "date" | "month" | "range">("all");
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
    const [visibleLimit, setVisibleLimit] = useState(25);
    const [selectedMission, setSelectedMission] = useState<any>(null);

    useEffect(() => {
        setVisibleLimit(25);
    }, [dateFilterMode, selectedDate, selectedMonth, fromDate, toDate, sortOrder]);

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
        if (activeMission?.length > 0) {
            toast.info("A live mission is already running. Join or terminate it first.");
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

    // Filter and sort missions by date/month/range and sortOrder
    const filteredMissions = useMemo(() => {
        const list = missionsWithDisplayId.filter((m) => {
            if (dateFilterMode === "all") return true;
            const raw = m.createdAt || m.created_at;
            if (!raw) return false;
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) return false;

            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const localDateStr = `${yyyy}-${mm}-${dd}`;
            const localMonthStr = `${yyyy}-${mm}`;

            if (dateFilterMode === "date") {
                return !selectedDate || localDateStr === selectedDate;
            }
            if (dateFilterMode === "month") {
                return !selectedMonth || localMonthStr === selectedMonth;
            }
            if (dateFilterMode === "range") {
                if (fromDate && localDateStr < fromDate) return false;
                if (toDate && localDateStr > toDate) return false;
                return true;
            }
            return true;
        });

        return [...list].sort((a, b) => {
            const ta = new Date(a.createdAt || a.created_at || 0).getTime() || Number(a.mission_id ?? a.id ?? 0);
            const tb = new Date(b.createdAt || b.created_at || 0).getTime() || Number(b.mission_id ?? b.id ?? 0);
            return sortOrder === "newest" ? tb - ta : ta - tb;
        });
    }, [missionsWithDisplayId, dateFilterMode, selectedDate, selectedMonth, fromDate, toDate, sortOrder]);

    const isDateFiltered =
        (dateFilterMode === "date" && !!selectedDate) ||
        (dateFilterMode === "month" && !!selectedMonth) ||
        (dateFilterMode === "range" && (!!fromDate || !!toDate));

    const clearDateFilter = () => {
        setDateFilterMode("all");
        setSelectedDate("");
        setSelectedMonth("");
        setFromDate("");
        setToDate("");
    };

    // Live active mission
    const activeMission = useMemo(() => {
        if (!isCarLive) return [];
        return missionsWithDisplayId?.filter((mission: any) => mission.status === 'ACTIVE') || [];
    }, [missionsWithDisplayId, isCarLive]);

    if (loading) return <MissionSelectorSkeleton />;

    const viewKey = `${currentScreen || "welcome"}-${selectedMission?.id ?? "none"}`;

    const isTemplateFullscreen = currentScreen === "MissionTemplate";

    return (
        <div className={`mission-selector-native-theme h-full w-full flex items-center overflow-hidden select-none transition-colors duration-200 ${
            isTemplateFullscreen ? "p-0 gap-0" : "gap-6 p-5"
        } ${
            isDark ? "bg-[#22262B] text-slate-100" : "bg-[#F1F5F9] text-slate-900"
        }`}>
           
            {/* Left Column: Actions & Previous Missions */}
            {!isTemplateFullscreen && (
                <div className={`h-full w-[286px] shrink-0 flex flex-col rounded-2xl p-3.5 border transition-colors duration-200 ${
                    isDark
                        ? "bg-[#1A1E24] border-[#2E343D] shadow-lg"
                        : "bg-white border-slate-200/90 shadow-sm"
                }`}>
                    {/* Show active mission OR allow starting a new mission */}
                    {activeMission?.length > 0 ? (
                        <MissionCard
                            active={true}
                            missionData={activeMission[0]}
                            isCarLive={isCarLive}
                        />
                    ) : (
                        <button
                            onClick={startTemplateView}
                            className="w-full h-10 px-4 rounded-lg bg-[#4C9FE8] hover:bg-[#3B91DC] active:scale-[0.99] transition-all text-white font-bold text-sm flex items-center justify-center space-x-2 shadow cursor-pointer"
                        >
                            <span>{t("start-new-mission")}</span>
                        </button>
                    )}



                {/* Previous Missions Header */}
                <div className="flex items-center justify-between px-1 mt-4 mb-2 shrink-0 gap-1">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8C939C] uppercase tracking-wider truncate">
                        {t("previous-missions")}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-semibold text-[#4C9FE8] font-mono">
                            {isDateFiltered ? `${filteredMissions.length}/${missions.length}` : missions.length} {t("total")}
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowDateControls((prev) => !prev)}
                            title="Filter & Sort by Date / Month"
                            className={`p-1 rounded-md border transition-colors cursor-pointer ${
                                showDateControls || isDateFiltered
                                    ? "bg-[#4C9FE8]/15 border-[#4C9FE8]/50 text-[#4C9FE8]"
                                    : isDark
                                    ? "border-[#2E343D] text-slate-400 hover:text-slate-200 hover:bg-[#242932]"
                                    : "border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                            }`}
                        >
                            <Calendar size={13} />
                        </button>
                    </div>
                </div>

                {/* Compact Date / Month Filter & Sort Controls */}
                {showDateControls && (
                    <div
                        className={`mb-2.5 p-2 rounded-xl border text-[11px] space-y-2 shrink-0 ${
                            isDark
                                ? "bg-[#22262D] border-[#323842] text-slate-200"
                                : "bg-slate-50 border-slate-200 text-slate-700"
                        }`}
                    >
                        <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1 flex-wrap">
                                {(["all", "date", "month", "range"] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setDateFilterMode(mode)}
                                        className={`px-2 py-0.5 rounded-md font-semibold capitalize transition-colors cursor-pointer ${
                                            dateFilterMode === mode
                                                ? "bg-[#4C9FE8] text-white"
                                                : isDark
                                                ? "bg-[#2B3038] text-slate-300 hover:bg-[#353B45]"
                                                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                                        }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => setSortOrder((prev) => (prev === "newest" ? "oldest" : "newest"))}
                                title="Toggle Sort Order"
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-medium cursor-pointer shrink-0 ${
                                    isDark
                                        ? "bg-[#2B3038] border-[#39404B] text-slate-200 hover:bg-[#353B45]"
                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                                }`}
                            >
                                <ArrowUpDown size={11} />
                                <span>{sortOrder === "newest" ? "New" : "Old"}</span>
                            </button>
                        </div>

                        {dateFilterMode === "date" && (
                            <DatePickerPopover
                                mode="date"
                                value={selectedDate}
                                onChange={setSelectedDate}
                                placeholder="Select date"
                                isDark={isDark}
                            />
                        )}

                        {dateFilterMode === "month" && (
                            <DatePickerPopover
                                mode="month"
                                value={selectedMonth}
                                onChange={setSelectedMonth}
                                placeholder="Select month"
                                isDark={isDark}
                            />
                        )}

                        {dateFilterMode === "range" && (
                            <div className="grid grid-cols-2 gap-1.5">
                                <DatePickerPopover
                                    mode="date"
                                    value={fromDate}
                                    onChange={setFromDate}
                                    placeholder="From"
                                    isDark={isDark}
                                    compact
                                />
                                <DatePickerPopover
                                    mode="date"
                                    value={toDate}
                                    onChange={setToDate}
                                    placeholder="To"
                                    isDark={isDark}
                                    compact
                                />
                            </div>
                        )}

                        {isDateFiltered && (
                            <button
                                type="button"
                                onClick={clearDateFilter}
                                className="w-full flex items-center justify-center gap-1 py-0.5 rounded-md text-[10px] font-semibold text-[#4C9FE8] hover:bg-[#4C9FE8]/10 transition-colors cursor-pointer"
                            >
                                <X size={11} />
                                <span>Clear filter</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Previous Missions List */}
                <PastMission
                    missions={filteredMissions}
                    visibleLimit={visibleLimit}
                    onLoadMore={() => setVisibleLimit((prev) => prev + 25)}
                    setMission={setMission}
                    selectedMission={selectedMission}
                />
            </div>
            )}

            {/* Right Main Area */}
            <div className={`relative h-full flex-1 overflow-hidden flex items-center justify-center transition-colors duration-200 ${
                isTemplateFullscreen
                    ? ""
                    : currentScreen
                    ? isDark
                        ? "bg-[#292D33] border border-[#373C43] rounded-2xl"
                        : "bg-white border border-slate-200 shadow-sm rounded-2xl"
                    : ""
            }`}>
                <div key={viewKey} className="w-full h-full flex items-center justify-center zoid-fade-slide">
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
                                {t("select-prompt")}
                            </p>
                        </div>

                        {/* Floating Action Button (+) — hidden while a live mission is running */}
                        {activeMission?.length === 0 && (
                            <button
                                onClick={startTemplateView}
                                title="Start New Mission"
                                className="absolute bottom-6 right-6 w-14 h-14 rounded-full border-2 border-[#4C9FE8] bg-transparent hover:bg-[#4C9FE8]/10 active:scale-95 flex items-center justify-center text-[#4C9FE8] shadow-lg transition-all cursor-pointer"
                            >
                                <span className="text-3xl font-light leading-none -mt-0.5">+</span>
                            </button>
                        )}
                    </div>
                )}
                </div>
            </div>
        </div>
    );
};

export default MissionSelector;
