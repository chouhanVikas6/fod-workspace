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

const PAGE_SIZE = 40;

const MissionSelector = () => {
    const t = useTranslations("missions");
    const [currentScreen, setCurrentScreen] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [missions, setMissions] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [totalUnfiltered, setTotalUnfiltered] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [activeMissionData, setActiveMissionData] = useState<any>(null);
    const [showDateControls, setShowDateControls] = useState(false);
    const [dateFilterMode, setDateFilterMode] = useState<"all" | "date" | "month">("all");
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedDateEnd, setSelectedDateEnd] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("");
    const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
    const [loadedLimit, setLoadedLimit] = useState(PAGE_SIZE);
    const [selectedMission, setSelectedMission] = useState<any>(null);

    useEffect(() => {
        setLoadedLimit(PAGE_SIZE);
    }, [dateFilterMode, selectedDate, selectedDateEnd, selectedMonth, sortOrder]);

    const { latency, availableCommunication } = useSelector((store: RootState) => store.SystemHealth);
    const isDark = useSelector((store: RootState) => store.theme.theme === 'dark');
    const isCarLive = Boolean(
        latency?.connected ||
        (availableCommunication as any[])?.some((c: any) => c?.type === 'car' || c?.type?.startsWith('car'))
    );

    const buildQueryParams = React.useCallback((limit: number, offset: number) => {
        const params: Record<string, string | number> = {
            limit,
            offset,
            sort: sortOrder,
            excludeEvicted: 1,
        };
        if (dateFilterMode === "date" && selectedDate) {
            params.dateFrom = selectedDate;
            params.dateTo = selectedDateEnd && selectedDateEnd !== selectedDate ? selectedDateEnd : selectedDate;
        } else if (dateFilterMode === "month" && selectedMonth) {
            // selectedMonth is YYYY-MM
            params.dateFrom = `${selectedMonth}-01`;
            params.dateTo = `${selectedMonth}-31`;
        }
        return params;
    }, [dateFilterMode, selectedDate, selectedDateEnd, selectedMonth, sortOrder]);

    const fetchMissionPage = React.useCallback((limit: number, offset = 0, append = false) => {
        if (append) {
            setLoadingMore(true);
        }
        axiosClient({
            method: "GET",
            url: RestPath.MISSIONWITHSTAT,
            params: buildQueryParams(limit, offset),
        }).then((response) => {
            const payload = response.data;
            if (payload && Array.isArray(payload.items)) {
                if (append) {
                    setMissions((prev) => {
                        const seen = new Set(prev.map((m) => m.mission_id ?? m.id));
                        const next = [...prev];
                        for (const item of payload.items) {
                            const key = item.mission_id ?? item.id;
                            if (!seen.has(key)) {
                                seen.add(key);
                                next.push(item);
                            }
                        }
                        return next;
                    });
                } else {
                    setMissions(payload.items);
                }
                setTotalCount(Number(payload.total ?? payload.items.length));
                setTotalUnfiltered(Number(payload.totalUnfiltered ?? payload.total ?? payload.items.length));
                setHasMore(Boolean(payload.hasMore));
                setActiveMissionData(payload.activeMission ?? null);
            } else if (Array.isArray(payload)) {
                setMissions(payload);
                setTotalCount(payload.length);
                setTotalUnfiltered(payload.length);
                setHasMore(false);
                setActiveMissionData(payload.find((m: any) => m.status === 'ACTIVE') ?? null);
            }
            setLoading(false);
            setLoadingMore(false);
        }).catch((error) => {
            console.log('Failed to fetch mission list:', error?.data?.error || error);
            setLoading(false);
            setLoadingMore(false);
        });
    }, [buildQueryParams]);

    // Fetch immediately on filter/sort/limit changes and poll currently loaded window every 2.5s
    useEffect(() => {
        fetchMissionPage(loadedLimit, 0, false);
        const interval = setInterval(() => {
            fetchMissionPage(loadedLimit, 0, false);
        }, 2500);
        return () => clearInterval(interval);
    }, [fetchMissionPage, loadedLimit]);

    const handleLoadMore = React.useCallback(() => {
        if (loadingMore || !hasMore) return;
        const nextOffset = missions.length;
        setLoadedLimit((prev) => prev + PAGE_SIZE);
        fetchMissionPage(PAGE_SIZE, nextOffset, true);
    }, [loadingMore, hasMore, missions.length, fetchMissionPage]);

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

    // Guard against stale items if any
    const filteredMissions = useMemo(() => {
        return (missions || []).filter(
            (m) => (m.storageTier || 'HOT') !== 'COLD_STORED' && !m.localEvicted
        );
    }, [missions]);

    useEffect(() => {
        if (!selectedMission) return;
        const selectedId = selectedMission.mission_id ?? selectedMission.id;
        const stillPresent = filteredMissions.some(
            (m) => (m.mission_id ?? m.id) === selectedId
        );
        if (!stillPresent && !hasMore) {
            setSelectedMission(null);
            setCurrentScreen('');
        }
    }, [filteredMissions, selectedMission, hasMore]);

    const isDateFiltered =
        (dateFilterMode === "date" && !!selectedDate) ||
        (dateFilterMode === "month" && !!selectedMonth);

    const clearDateFilter = () => {
        setDateFilterMode("all");
        setSelectedDate("");
        setSelectedDateEnd("");
        setSelectedMonth("");
    };

    // Live active mission
    const activeMission = useMemo(() => {
        if (!isCarLive) return [];
        if (activeMissionData && activeMissionData.status === 'ACTIVE') {
            return [activeMissionData];
        }
        return missions?.filter((mission: any) => mission.status === 'ACTIVE') || [];
    }, [missions, activeMissionData, isCarLive]);

    if (loading) return <MissionSelectorSkeleton />;

    const viewKey = `${currentScreen || "welcome"}-${selectedMission?.id ?? "none"}`;

    const isTemplateFullscreen = currentScreen === "MissionTemplate";

    return (
        <div className={`mission-selector-native-theme h-full w-full flex items-center overflow-hidden select-none transition-colors duration-200 ${isTemplateFullscreen ? "p-0 gap-0" : "gap-6 p-5"
            } ${isDark ? "bg-[#22262B] text-slate-100" : "bg-[#F1F5F9] text-slate-900"
            }`}>

            {/* Left Column: Actions & Previous Missions */}
            {!isTemplateFullscreen && (
                <div className={`h-full w-[286px] shrink-0 flex flex-col rounded-2xl p-3.5 border transition-colors duration-200 ${isDark
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
                                {isDateFiltered ? `${totalCount}/${totalUnfiltered}` : totalCount} {t("total")}
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowDateControls((prev) => !prev)}
                                title="Filter & Sort by Date / Month"
                                className={`p-1 rounded-md border transition-colors cursor-pointer ${showDateControls || isDateFiltered
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
                            className={`mb-2.5 p-2 rounded-xl border text-[11px] space-y-2 shrink-0 ${isDark
                                    ? "bg-[#22262D] border-[#323842] text-slate-200"
                                    : "bg-slate-50 border-slate-200 text-slate-700"
                                }`}
                        >
                            <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1 flex-wrap">
                                    {(["all", "date", "month"] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => setDateFilterMode(mode)}
                                            className={`px-2 py-0.5 rounded-md font-semibold capitalize transition-colors cursor-pointer ${dateFilterMode === mode
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
                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-medium cursor-pointer shrink-0 ${isDark
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
                                    rangeEnd={selectedDateEnd}
                                    onChange={setSelectedDate}
                                    onRangeChange={(start, end) => {
                                        setSelectedDate(start);
                                        setSelectedDateEnd(end);
                                    }}
                                    placeholder="Select date or range"
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
                        totalCount={totalCount}
                        hasMore={hasMore}
                        loadingMore={loadingMore}
                        onLoadMore={handleLoadMore}
                        setMission={setMission}
                        selectedMission={selectedMission}
                    />
                </div>
            )}

            {/* Right Main Area */}
            <div className={`relative h-full flex-1 overflow-hidden flex items-center justify-center transition-colors duration-200 ${isTemplateFullscreen
                    ? ""
                    : currentScreen
                        ? isDark
                            ? "bg-[#292D33] border border-[#373C43] rounded-2xl"
                            : "bg-white border border-slate-200 shadow-sm rounded-2xl"
                        : ""
                }`}>
                <div key={viewKey} className="w-full h-full flex items-center justify-center zoid-fade-slide">
                    {currentScreen === 'MissionTemplate' ? (
                        <MissionTemplate {...{ stopTemplateView }} />
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
