import RestPath from '@/constants/apiPaths';
import { start_Mission } from '@/store/slices/missionState-slice';
import axiosClient from '@/utils/axios';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import ExploreMap from '../map/exploreMap';
import { config } from '@/config/clientConfig';
import Image from 'next/image';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Timer is elapsed ms — render as 1h 05m / 12m 30s / 45s
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
    if (!value) return null;
    const d = new Date(value);

    if (isNaN(d.getTime())) return null;

    return d.toLocaleString([], {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatSize(size: any) {
    const num = Number(size);
    if (!isFinite(num) || num <= 0) return null;
    return `${Number(num.toFixed(1))} mm`;
}

const GROUP_STATUS_BADGE: Record<string, string> = {
    ACCEPTED:
        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    REJECTED:
        'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
    CLEARED:
        'bg-[#4C9FE8]/15 text-[#4C9FE8] border-[#4C9FE8]/30',
    NEW:
        'bg-slate-100 dark:bg-[#353A42] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#454B53]',
};

function MissionExplore({ stopTemplateView, selectedMission }: any) {
    const [fodList, setFodList] = useState<any[]>([]);
    const [selectedFod, setSelectedFod] = useState<any>(null);
    const [displayLimit, setDisplayLimit] = useState(60);

    const cardRefs = useRef<Record<string | number, HTMLDivElement | null>>({});
    const dispatch = useDispatch();

    // Deduplicate FODs by groupId so multiple frames of the same FOD don't repeat
    const uniqueFodList = useMemo(() => {
        const map = new Map<string | number, any>();

        for (const item of fodList) {
            const key = item.groupId ?? item.id;
            if (key == null) continue;

            if (!map.has(key)) {
                map.set(key, { ...item, frameCount: 1 });
            } else {
                const existing = map.get(key);
                map.set(key, {
                    ...existing,
                    groupStatus: item.groupStatus ?? existing.groupStatus,
                    frameCount: (existing.frameCount || 1) + 1,
                });
            }
        }

        return Array.from(map.values());
    }, [fodList]);

    function exploreMission() {
        axiosClient({
            method: 'GET',
            url: RestPath.EXPLOREMISSION(selectedMission?.id),
        })
            .then((response) => {
                if (!!response?.data?.id) {
                    dispatch(
                        start_Mission({
                            ...response.data,
                            isActive: false,
                            isExplore: true,
                        })
                    );
                } else {
                    toast.error(response?.data?.error || 'Mission not found');
                }
            })
            .catch((error) => {
                toast.error(error?.data?.error || 'Failed to explore mission');
            });
    }

    function handleSelectFod(fod: any, fromMap = false) {
        if (!fod) {
            setSelectedFod(null);
            return;
        }

        const clickedKey = fod.groupId ?? fod.id;
        const currentKey = selectedFod?.groupId ?? selectedFod?.id;

        if (currentKey === clickedKey && !fromMap) {
            setSelectedFod(null);
            return;
        }

        setSelectedFod(fod);

        if (fromMap && clickedKey != null) {
            const el = cardRefs.current[clickedKey];
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    useEffect(() => {
        if (!selectedMission) return;

        let disposed = false;
        let unlistenFn: (() => void) | null = null;
        let rafId: number | null = null;

        const pendingRows: any[] = [];

        const subId = `mission-explore-${selectedMission.id}-${Date.now()}`;

        setFodList([]);
        setSelectedFod(null);
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
                const rows = typeof data === 'string' ? JSON.parse(data) : data;

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
                console.error('Failed to parse IPC retrive-data:', err);
            }
        }

        listen(`sse:retrive-data:${subId}`, (event: any) => {
            const payload = event.payload;

            if (payload?.event === 'update') {
                getRealtimeData(payload.data);
            }
        })
            .then((unlisten) => {
                if (disposed) {
                    unlisten();
                    return;
                }

                unlistenFn = unlisten;

                return invoke('start_retrive_stream', {
                    subId,
                    missionId: Number(selectedMission.id),
                });
            })
            .catch((err) => {
                console.error('IPC retrive-data stream error:', err);
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

            invoke('stop_retrive_stream', { subId }).catch(() => {});
        };
    }, [selectedMission]);

    const isActive = selectedMission?.status === 'ACTIVE';

    const stats = [
        { label: 'Started', value: formatDate(selectedMission?.createdAt) ?? '—' },
        { label: 'Duration', value: formatDuration(selectedMission?.timer) },
        {
            label: 'Speed',
            value:
                selectedMission?.speed != null
                    ? `${selectedMission.speed} km/h`
                    : '—',
        },
        {
            label: 'Passes',
            value: selectedMission?.pass != null ? selectedMission.pass : '—',
        },
        { label: 'FODs Detected', value: selectedMission?.total ?? 0 },
        { label: 'Accepted', value: selectedMission?.accepted ?? 0 },
        { label: 'False FODs', value: selectedMission?.rejected ?? 0 },
        { label: 'Cleared', value: selectedMission?.cleared ?? 0 },
    ];

    const selectedKey = selectedFod?.groupId ?? selectedFod?.id;

    return (
        <div className="w-full h-full flex flex-col gap-2 xl:gap-3 p-3 xl:p-4 bg-[#F8FAFC] dark:bg-[#22262B] text-slate-800 dark:text-slate-100 transition-colors duration-200 select-none">

            {/* Header */}
            <div className="flex items-center justify-between gap-2 shrink-0 min-w-0 flex-nowrap">

                {/* Mission title and status */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <h1 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white tracking-wide truncate">
                        Mission {selectedMission.id}
                    </h1>

                    <span
                        className={`shrink-0 px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] lg:text-xs font-semibold tracking-wide border ${
                            isActive
                                ? 'bg-[#01B656]/20 text-[#01B656] border-[#01B656]/50'
                                : 'bg-white dark:bg-[#292D33] text-slate-600 dark:text-[#8C939C] border-slate-200 dark:border-[#373C43]'
                        }`}
                    >
                        {selectedMission.status}
                    </span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

                    {/* View Report */}
                    <button
                        type="button"
                        onClick={() => toast.info('Report view coming soon')}
                        className="
                            h-8 sm:h-9 lg:h-[35px]
                            px-2.5 sm:px-3 lg:px-5
                            rounded-[5px]
                            bg-slate-200 dark:bg-[#353A42]
                            text-slate-700 dark:text-[#D9DDE2]
                            text-[10px] sm:text-xs lg:text-sm
                            font-semibold
                            hover:bg-slate-300 dark:hover:bg-[#454B53]
                            active:scale-95
                            transition-all
                            whitespace-nowrap
                        "
                    >
                        View Report
                    </button>

                    {/* Explore Mission */}
                    <button
                        type="button"
                        onClick={exploreMission}
                        className="
                            h-8 sm:h-9 lg:h-[35px]
                            px-2.5 sm:px-3 lg:px-5
                            rounded-[5px]
                            bg-[#4C9FE8]
                            text-white
                            text-[10px] sm:text-xs lg:text-sm
                            font-semibold
                            hover:bg-[#3B91DC]
                            active:scale-95
                            transition-all
                            shadow
                            whitespace-nowrap
                        "
                    >
                        Explore Mission
                    </button>

                    {/* Close */}
                    <button
                        type="button"
                        onClick={stopTemplateView}
                        title="Close"
                        className="
                            h-8 w-8 sm:h-9 sm:w-9 lg:h-[44px] lg:w-[44px]
                            rounded-lg
                            border border-slate-200 dark:border-[#373C43]
                            bg-white dark:bg-[#292D33]
                            text-slate-500 dark:text-[#8C939C]
                            hover:bg-slate-100 dark:hover:bg-[#373C43]
                            hover:text-slate-900 dark:hover:text-white
                            active:scale-95
                            transition-all
                            flex items-center justify-center
                            text-sm sm:text-base lg:text-lg
                            shrink-0
                        "
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Mission stats — slightly slimmer on smaller screens, original size on xl+ */}
            <div className="grid grid-cols-4 gap-1.5 xl:gap-2 shrink-0">
                {stats.map(({ label, value }) => (
                    <div
                        key={label}
                        className="bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-lg px-2.5 py-1.5 xl:px-3 xl:py-2.5 shadow-xs dark:shadow-none min-w-0"
                    >
                        <div className="text-[11px] xl:text-xs text-slate-500 dark:text-[#8C939C] font-medium truncate">
                            {label}
                        </div>

                        <div
                            title={String(value)}
                            className="text-xs sm:text-sm xl:text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5 truncate"
                        >
                            {value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Body: Left Map + Right Detected FODs List */}
            <div className="flex gap-2.5 xl:gap-3 flex-1 min-h-0">

                {/* Left Section: Map */}
                <div className="flex-[3] min-w-0 flex flex-col bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-lg overflow-hidden isolate shadow-xs dark:shadow-none">
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 xl:py-2 border-b border-slate-200 dark:border-[#373C43] shrink-0 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs xl:text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                Mission Map
                            </span>
                            {selectedFod && (
                                <span className="px-2 xl:px-2.5 py-0.5 rounded-full text-[10px] xl:text-xs font-semibold bg-[#4C9FE8]/15 text-[#4C9FE8] border border-[#4C9FE8]/40 whitespace-nowrap">
                                    FOD #{selectedKey} Selected
                                </span>
                            )}
                        </div>

                        {selectedFod && (
                            <button
                                type="button"
                                onClick={() => setSelectedFod(null)}
                                className="text-[11px] xl:text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-[#8C939C] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                                Clear selection
                            </button>
                        )}
                    </div>

                    <div className="relative flex-1 min-h-0 overflow-hidden">
                        <ExploreMap
                            fods={uniqueFodList}
                            selectedFod={selectedFod}
                            selectedGroupId={selectedKey}
                            onSelectFod={(fod: any) => handleSelectFod(fod, true)}
                        />
                    </div>
                </div>

                {/* Right Section: Detected FODs List (~3.5 cards visible on smaller screens, full size on xl+) */}
                <div className="relative z-10 flex-[1.55] xl:flex-[1.4] min-w-[240px] max-w-[440px] flex flex-col bg-white dark:bg-[#292D33] border border-slate-200 dark:border-[#373C43] rounded-lg overflow-hidden shadow-xs dark:shadow-none">

                    {/* Right Header */}
                    <div className="flex items-center justify-between gap-2 px-3 xl:px-3.5 py-1.5 xl:py-2.5 border-b border-slate-200 dark:border-[#373C43] shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] xl:text-xs font-bold tracking-wider uppercase text-slate-600 dark:text-[#8C939C] whitespace-nowrap">
                                Detected FODs
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] xl:text-[11px] font-bold bg-slate-100 dark:bg-[#22262B] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#373C43]">
                                {uniqueFodList.length}
                            </span>
                        </div>

                        {uniqueFodList.length > displayLimit && (
                            <button
                                type="button"
                                onClick={() => setDisplayLimit(uniqueFodList.length)}
                                className="text-xs font-semibold text-[#4C9FE8] hover:underline whitespace-nowrap cursor-pointer"
                            >
                                View all
                            </button>
                        )}
                    </div>

                    {/* Scrollable FOD Cards */}
                    {uniqueFodList.length > 0 ? (
                        <div className="flex-1 min-h-0 overflow-y-auto p-2 xl:p-2.5 space-y-1.5 xl:space-y-2">
                            {uniqueFodList.slice(0, displayLimit).map((fod: any) => {
                                const itemKey = fod.groupId ?? fod.id;
                                const isSelected =
                                    selectedKey != null && selectedKey === itemKey;
                                const statusStyle =
                                    GROUP_STATUS_BADGE[fod.groupStatus] ||
                                    GROUP_STATUS_BADGE.NEW;
                                const formattedSize = formatSize(fod.size);
                                const formattedTime = formatDate(
                                    fod.createdAt ?? fod.timestamp ?? fod.detectedAt
                                );

                                return (
                                    <div
                                        key={`fod-group-${itemKey}`}
                                        ref={(el) => {
                                            if (itemKey != null) {
                                                cardRefs.current[itemKey] = el;
                                            }
                                        }}
                                        onClick={() => handleSelectFod(fod, false)}
                                        className={`group relative flex items-center gap-2.5 xl:gap-3 p-1.5 xl:p-2.5 rounded-xl cursor-pointer transition-all duration-150 border ${
                                            isSelected
                                                ? 'bg-[#4C9FE8]/[0.08] dark:bg-[#4C9FE8]/[0.14] border-[#4C9FE8] ring-1 ring-[#4C9FE8] shadow-xs'
                                                : 'bg-slate-50/70 dark:bg-[#22262B] border-slate-200/90 dark:border-[#373C43] hover:border-[#4C9FE8]/60 hover:bg-slate-100/60 dark:hover:bg-[#262B31]'
                                        }`}
                                    >
                                        {/* Left Thumbnail: compact on small screens (56x48), full on xl+ (88x68) */}
                                        <div
                                            className={`relative w-14 h-12 xl:w-[88px] xl:h-[68px] shrink-0 rounded-lg overflow-hidden bg-slate-200 dark:bg-[#1B1E23] border ${
                                                isSelected
                                                    ? 'border-[#4C9FE8]'
                                                    : 'border-slate-200 dark:border-[#373C43]'
                                            }`}
                                        >
                                            <Image
                                                src={`${config.ImagesBase}/${selectedMission.id}/${fod.groupId}/${fod.id}.jpg`}
                                                alt={`FOD #${itemKey}`}
                                                width={120}
                                                height={90}
                                                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                                            />
                                        </div>

                                        {/* Right Content — strictly 3 lines so cards stay ~64px tall on small screens (~3.5 visible) */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-between gap-0.5 xl:gap-1">
                                            {/* Row 1: FOD ID + Status Badge */}
                                            <div className="flex items-center justify-between gap-1.5 min-w-0">
                                                <span
                                                    className={`text-[11px] xl:text-xs font-bold tracking-wide truncate ${
                                                        isSelected
                                                            ? 'text-[#4C9FE8]'
                                                            : 'text-slate-900 dark:text-white'
                                                    }`}
                                                >
                                                    FOD #{itemKey}
                                                </span>

                                                {fod.groupStatus && (
                                                    <span
                                                        className={`shrink-0 px-1.5 xl:px-2 py-0.2 xl:py-0.5 rounded-full text-[9px] xl:text-[10px] font-semibold tracking-wide uppercase border ${statusStyle}`}
                                                    >
                                                        {fod.groupStatus}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Row 2: FOD Class + Size pill inline */}
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="text-[11px] xl:text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                                                    {fod.class || 'Unclassified FOD'}
                                                </span>

                                                {formattedSize && (
                                                    <span className="shrink-0 font-mono text-[10px] xl:text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-[#292D33] px-1.5 py-0.2 rounded">
                                                        {formattedSize}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Row 3: Camera & Timestamp on a single truncated line */}
                                            <div className="flex items-center gap-1 text-[10px] xl:text-[11px] text-slate-500 dark:text-[#8C939C] truncate">
                                                {fod.sysid && (
                                                    <span className="truncate">
                                                        CAM {fod.sysid}
                                                    </span>
                                                )}

                                                {fod.sysid && formattedTime && (
                                                    <span className="shrink-0">·</span>
                                                )}

                                                {formattedTime && (
                                                    <span className="truncate">
                                                        {formattedTime}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {uniqueFodList.length > displayLimit && (
                                <div className="pt-1 pb-2 flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setDisplayLimit((prev) => prev + 60)
                                        }
                                        className="w-full py-1.5 xl:py-2 bg-slate-100 dark:bg-[#22262B] hover:bg-slate-200 dark:hover:bg-[#353A42] text-slate-700 dark:text-slate-200 text-[11px] xl:text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#373C43] transition-all cursor-pointer"
                                    >
                                        Load More ({displayLimit} of{' '}
                                        {uniqueFodList.length})
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500 p-4 text-center">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                No FODs recorded for this mission
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default MissionExplore;