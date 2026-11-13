import RestPath from '@/constants/apiPaths';
import { start_Mission } from '@/store/slices/missionState-slice';
import axiosClient from '@/utils/axios';
import React, { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import ExploreMap from '../map/exploreMap';
import { config } from '@/config/clientConfig';
import Image from 'next/image';
import FodHorizontalcard from '../fodPanel/FodCards/fodHorizontalCard';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// timer is elapsed ms (see MissionProgress) — render as 1h 05m / 12m 30s / 45s
function formatDuration(ms: any) {
    if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return '—';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
}

function formatDate(value: any) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const GROUP_STATUS_COLOR = {
    ACCEPTED: 'text-green-600',
    REJECTED: 'text-red-500',
    CLEARED: 'text-[#017ED7]',
};

function MissionExplore({ stopTemplateView, selectedMission }: any) {
    const [activeTab, setActiveTab] = useState('map');
    const [fodList, setFodList] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [displayLimit, setDisplayLimit] = useState(60);
    const groupRequestRef = useRef(0);
    const dispatch = useDispatch();

    function exploreMission() {
        axiosClient({
            method: "GET",
            url: RestPath.EXPLOREMISSION(selectedMission?.id),
        }).then((response) => {
            if (!!response?.data?.id) {
                dispatch(start_Mission({ ...response.data, displayId: selectedMission?.displayId, isActive: false, isExplore: true }));
            } else {
                toast.error(response?.data?.error || 'Mission not found')
            }
        }).catch((error) => {
            toast.error(error?.data?.error || 'Failed to explore mission');
        })
    }


    async function setSelectedGroup(fodGroup) {
        let id = fodGroup.groupId;
        if (selectedGroupId?.id == id) {
            setSelectedGroupId(null);
            return;
        }

        // The list-fod endpoint round-trips to car-backend, so it can take
        // seconds. Paint the panel straight away from the card's own data (the
        // clicked FOD is itself a frame of the group) and fill in the rest when
        // the response lands — same optimistic pattern as updateSelectedFod.
        const reqId = ++groupRequestRef.current;
        setSelectedGroupId({ id, status: fodGroup.groupStatus, data: [fodGroup], loading: true });

        try {
            const response = await axiosClient({
                method: 'get',
                maxBodyLength: Infinity,
                //the endpoint will be moved in some config file
                url: `/api/fod-group/list-fod/${id}?missionId=${selectedMission.id}`,
                timeout: 10000
            });
            // A newer click already superseded this one — drop the stale result.
            if (reqId !== groupRequestRef.current) return;
            setSelectedGroupId({
                id,
                status: fodGroup.groupStatus,
                data: response.data.data,
                loading: false
            })
        } catch (error) {
            if (reqId !== groupRequestRef.current) return;
            toast.error(error?.data?.error || 'Failed to load FOD group frames');
            // Keep the optimistic frame on screen rather than blanking the panel.
            setSelectedGroupId((prev) => prev?.id === id ? { ...prev, loading: false } : prev);
        }
    }

    useEffect(() => {
        if (!selectedMission) return;
        let disposed = false;
        let unlistenFn: (() => void) | null = null;
        let rafId: number | null = null;
        const pendingRows: any[] = [];
        const subId = `mission-explore-${selectedMission.id}-${Date.now()}`;
        groupRequestRef.current += 1;
        setSelectedGroupId(null);
        setFodList([]);
        setDisplayLimit(60);

        const flushRows = () => {
            rafId = null;
            if (disposed || pendingRows.length === 0) return;
            const batch = pendingRows.splice(0, 2500);
            React.startTransition(() => {
                setFodList((prvs) => {
                    const maxLimit = config?.FodListsLimit ?? 25000;
                    if (prvs.length >= maxLimit) return prvs;
                    return [...prvs, ...batch].slice(0, maxLimit);
                });
            });
            if (pendingRows.length > 0 && !disposed) {
                rafId = window.requestAnimationFrame(flushRows);
            }
        };

        function getRealtimeData(data: any) {
            if (disposed) return;
            try {
                const rows = typeof data === "string" ? JSON.parse(data) : data;
                if (Array.isArray(rows) && rows.length > 0) {
                    const maxLimit = config?.FodListsLimit ?? 25000;
                    if (pendingRows.length < maxLimit) {
                        pendingRows.push(...rows);
                    }
                    if (rafId === null) {
                        rafId = window.requestAnimationFrame(flushRows);
                    }
                }
            } catch (err) {
                console.error("Failed to parse IPC retrive-data:", err);
            }
        }

        listen(`sse:retrive-data:${subId}`, (event: any) => {
            const payload = event.payload;
            if (payload?.event === "update") {
                getRealtimeData(payload.data);
            }
        })
            .then((unlisten) => {
                if (disposed) {
                    unlisten();
                    return;
                }
                unlistenFn = unlisten;
                return invoke("start_retrive_stream", {
                    subId,
                    missionId: Number(selectedMission.id),
                });
            })
            .catch((err) => {
                console.error("IPC retrive-data stream error:", err);
            });

        return () => {
            disposed = true;
            pendingRows.length = 0;
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
            }
            if (unlistenFn) {
                unlistenFn();
            }
            invoke("stop_retrive_stream", { subId }).catch(() => {});
        };
    }, [selectedMission])

    const isActive = selectedMission?.status === 'ACTIVE';
    const stats = [
        { label: 'Started', value: formatDate(selectedMission?.createdAt) },
        { label: 'Duration', value: formatDuration(selectedMission?.timer) },
        { label: 'Speed', value: selectedMission?.speed != null ? `${selectedMission.speed} km/h` : '—' },
        { label: 'Passes', value: selectedMission?.pass != null ? selectedMission.pass : '—' },
        { label: 'FODs Detected', value: selectedMission?.total ?? 0 },
        { label: 'Accepted', value: selectedMission?.accepted ?? 0 },
        { label: 'False FODs', value: selectedMission?.rejected ?? 0 },
        { label: 'Cleared', value: selectedMission?.cleared ?? 0 },
    ];

    const groupInfo = selectedGroupId?.data?.[0];

    return (
        <div className="w-full h-full flex flex-col gap-3 p-4 bg-[#F8FAFC] dark:bg-[#22262B] text-slate-800 dark:text-slate-100 transition-colors duration-200 select-none">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide" title={selectedMission?.id ? `ID: ${selectedMission.id}` : undefined}>
                        Mission #{selectedMission.displayId ?? selectedMission.id}
                    </h1>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border ${
                        isActive 
                            ? 'bg-[#01B656]/20 text-[#01B656] border-[#01B656]/50' 
                            : 'bg-white dark:bg-[#292D33] text-slate-600 dark:text-[#8C939C] border-slate-200 dark:border-[#373C43]'
                    }`}>
                        {selectedMission.status}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={exploreMission}
                        className="h-[44px] px-5 rounded-lg bg-[#4C9FE8] text-white font-semibold hover:bg-[#3B91DC] active:scale-95 transition-all shadow"
                    >
                        Explore Mission
                    </button>
                    <button
                        onClick={stopTemplateView}
                        title="Close"
                        className="h-[44px] w-[44px] rounded-lg border border-slate-200 dark:border-[#373C43] bg-white dark:bg-[#292D33] text-slate-500 dark:text-[#8C939C] hover:bg-slate-100 dark:hover:bg-[#373C43] hover:text-slate-900 dark:hover:text-white active:scale-95 transition-all flex items-center justify-center font-bold"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Mission stats */}
            <div className="grid grid-cols-4 gap-2 shrink-0">
                {stats.map(({ label, value }) => (
                    <div key={label} className="bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-lg px-3 py-2.5 shadow-xs dark:shadow-none">
                        <div className="text-xs text-slate-500 dark:text-[#8C939C] font-medium">{label}</div>
                        <div className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5 truncate">{value}</div>
                    </div>
                ))}
            </div>

            {/* Body: map/list + group detail */}
            <div className="flex gap-3 flex-1 min-h-0">
                <div className="flex-[3] min-w-0 flex flex-col bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-lg overflow-hidden isolate shadow-xs dark:shadow-none">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-[#373C43] shrink-0">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Detected FODs</span>
                        <div className="inline-flex rounded-lg bg-slate-100 dark:bg-[#22262B] p-0.5 border border-slate-200 dark:border-[#373C43]">
                            {['map', 'list'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-1 rounded-md text-sm font-medium capitalize transition-colors ${
                                        activeTab === tab
                                            ? 'bg-[#4C9FE8] shadow text-white font-semibold'
                                            : 'text-slate-600 dark:text-[#8C939C] hover:text-slate-900 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className={`relative flex-1 min-h-0 ${activeTab === 'list' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
                        {activeTab === 'map' ? <ExploreMap fods={fodList} onSelectFod={setSelectedGroup} /> :
                            fodList.length ?
                                <div className="p-2 space-y-3">
                                   <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-2">
                                        {fodList.slice(0, displayLimit).map((fod: any) => (
                                            <FodHorizontalcard key={fod.id + 'listonExplore'} {...{ fod, selectedMission, actionOnCard: setSelectedGroup }} />
                                        ))}
                                    </div>
                                    {fodList.length > displayLimit && (
                                        <div className="flex justify-center pb-4 pt-1">
                                            <button
                                                onClick={() => setDisplayLimit((prev) => prev + 60)}
                                                className="px-5 py-2 bg-[#4C9FE8] hover:bg-[#3B91DC] text-white text-xs font-bold rounded-lg shadow transition-all active:scale-95 cursor-pointer"
                                            >
                                                Load More ({displayLimit} of {fodList.length} shown)
                                            </button>
                                        </div>
                                    )}
                                </div>
                                :
                                <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
                                    No FODs recorded for this mission
                                </div>
                        }
                    </div>
                </div>

                <div className="relative z-10 flex-[2] min-w-0 bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-lg overflow-hidden shadow-xs dark:shadow-none">
                    {selectedGroupId ? (
                        <div className="h-full flex flex-col gap-3 p-3 overflow-y-auto">
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">FOD Group {selectedGroupId.id}</span>
                                {selectedGroupId.loading && (
                                    <span className="text-xs text-[#4C9FE8] animate-pulse">loading frames…</span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 2xl:grid-cols-3 gap-2">
                                {selectedGroupId?.data?.map((frame, index) => (
                                    <div
                                        id={`selectedFrame${index}`}
                                        key={index + 'fodGroupOnExplore'}
                                        className={`aspect-square overflow-hidden rounded-lg border ${index === 0 ? "border-[#4C9FE8] border-2" : "border-slate-200 dark:border-[#373C43]"}`}
                                    >
                                        <Image src={`${config.ImagesBase}/${selectedMission.id}/${frame.groupId}/${frame.id}.jpg`} className="w-full h-full object-cover object-center" alt="FOD frame" width={220} height={220} />
                                    </div>
                                ))}
                                {selectedGroupId.loading && [0, 1].map((i) => (
                                    <div key={`skeleton${i}`} className="aspect-square rounded-lg bg-slate-100 dark:bg-[#22262B] animate-pulse" />
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-2 shrink-0">
                                {[
                                    ['CAM ID', groupInfo?.sysid],
                                    ['Size', groupInfo?.size != null ? `${groupInfo.size} mm` : '—'],
                                    ['Class', groupInfo?.class ?? '—'],
                                    ['Velocity', groupInfo?.velocity != null ? `${groupInfo.velocity} km/h` : '—'],
                                    ['Detected at', formatDate(groupInfo?.createdAt)],
                                ].map(([label, value]) => (
                                    <div key={label as string} className="rounded-lg bg-slate-50 dark:bg-[#22262B] border border-slate-200 dark:border-[#373C43] px-3 py-2 flex justify-between items-center text-sm">
                                        <span className="text-slate-500 dark:text-[#8C939C] text-xs">{label}</span>
                                        <span className="font-semibold text-slate-900 dark:text-white truncate ml-2 font-mono">{value}</span>
                                    </div>
                                ))}
                                <div className="rounded-lg bg-slate-50 dark:bg-[#22262B] border border-slate-200 dark:border-[#373C43] px-3 py-2 flex justify-between items-center text-sm">
                                    <span className="text-slate-500 dark:text-[#8C939C] text-xs">Status</span>
                                    <span className={`font-bold ${GROUP_STATUS_COLOR[selectedGroupId?.status] || 'text-slate-900 dark:text-white'}`}>{selectedGroupId?.status}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500 p-4 text-center">
                            <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5 21 6.75v10.5l-5.25-3.75M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 13.5 5.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                            </svg>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Select a FOD from the list to view its frames and details</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default MissionExplore
