import RestPath from '@/constants/apiPaths';
import { start_Mission } from '@/store/slices/missionState-slice';
import axiosClient from '@/utils/axios';
import React, { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import ExploreMap from '../map/exploreMap';
import { config, ServerBase } from '@/config/clientConfig';
import Image from 'next/image';
import FodHorizontalcard from '../fodPanel/FodCards/fodHorizontalCard';

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
    const groupRequestRef = useRef(0);
    const dispatch = useDispatch();

    function exploreMission() {
        axiosClient({
            method: "GET",
            url: RestPath.EXPLOREMISSION(selectedMission?.id),
        }).then((response) => {
            if (!!response?.data?.id) {
                dispatch(start_Mission({ ...response.data, isActive: false }));
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
        const sse = new EventSource(`${ServerBase}/api/sse/retrive-data?id=${selectedMission.id}`,
            { withCredentials: true });
        function getRealtimeData(data) {
            try {
                setFodList((prvs) => {
                    return [...prvs, ...data]
                })
            } catch (err) {
                console.error("Failed to parse SSE data:", err);
            }
        }
        sse.addEventListener("update", (e) => {
            getRealtimeData(JSON.parse(e.data));
        });

        sse.onmessage = e => getRealtimeData(JSON.parse(e.data));
        sse.onerror = (err) => {
            console.error("SSE connection error:", err);
            sse.close();
        };
        return () => {
            sse.close();
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
        <div className="w-full h-full flex flex-col gap-3 p-4 bg-[#F5F5F5]">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-[#002756]">Mission {selectedMission.id}</h1>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                        {selectedMission.status}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={exploreMission}
                        className="h-10 px-5 rounded-lg bg-[#017ED7] text-white font-medium hover:bg-[#0171c0] active:scale-95 transition-transform"
                    >
                        Explore Mission
                    </button>
                    <button
                        onClick={stopTemplateView}
                        title="Close"
                        className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 active:scale-95 transition-transform"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Mission stats */}
            <div className="grid grid-cols-4 gap-2 shrink-0">
                {stats.map(({ label, value }) => (
                    <div key={label} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                        <div className="text-xs text-gray-500">{label}</div>
                        <div className="text-base font-semibold text-[#002756] truncate">{value}</div>
                    </div>
                ))}
            </div>

            {/* Body: map/list + group detail */}
            <div className="flex gap-3 flex-1 min-h-0">
                <div className="flex-[3] min-w-0 flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden isolate">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 shrink-0">
                        <span className="text-sm font-semibold text-gray-600">Detected FODs</span>
                        <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
                            {['map', 'list'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-1 rounded-md text-sm font-medium capitalize transition-colors ${activeTab === tab
                                        ? 'bg-white shadow text-[#017ED7]'
                                        : 'text-gray-500 hover:text-gray-700'
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
                                <div className="grid grid-cols-2">
                                    {fodList.map((fod) => (
                                        <FodHorizontalcard key={fod.id + 'listonExplore'} {...{ fod, selectedMission, actionOnCard: setSelectedGroup }} />
                                    ))}
                                </div>
                                :
                                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                                    No FODs recorded for this mission
                                </div>
                        }
                    </div>
                </div>

                <div className="relative z-10 flex-[2] min-w-0 bg-white border border-gray-200 rounded-lg overflow-hidden">
                    {selectedGroupId ? (
                        <div className="h-full flex flex-col gap-3 p-3 overflow-y-auto">
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm font-semibold text-gray-600">FOD Group {selectedGroupId.id}</span>
                                {/* NOTE: don't use animate-spin here — tailwind.config.ts
                                    overrides it with mulShdSpin, whose box-shadow dots
                                    paint far outside the element. */}
                                {selectedGroupId.loading && (
                                    <span className="text-xs text-gray-400 animate-pulse">loading frames…</span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 2xl:grid-cols-3 gap-2">
                                {selectedGroupId?.data?.map((frame, index) => (
                                    <div
                                        id={`selectedFrame${index}`}
                                        key={index + 'fodGroupOnExplore'}
                                        className={`aspect-square overflow-hidden rounded-lg border ${index === 0 ? "border-[#017ED7] border-2" : "border-gray-200"}`}
                                    >
                                        <Image src={`${config.ImagesBase}/${selectedMission.id}/${frame.groupId}/${frame.id}.jpg`} className="w-full h-full object-cover object-center" alt="FOD frame" width={220} height={220} />
                                    </div>
                                ))}
                                {selectedGroupId.loading && [0, 1].map((i) => (
                                    <div key={`skeleton${i}`} className="aspect-square rounded-lg bg-gray-200 animate-pulse" />
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
                                    <div key={label as string} className="rounded-md bg-[#F7F7F7] px-3 py-2 flex justify-between items-center text-sm">
                                        <span className="text-gray-500">{label}</span>
                                        <span className="font-medium text-[#002756] truncate ml-2">{value}</span>
                                    </div>
                                ))}
                                <div className="rounded-md bg-[#F7F7F7] px-3 py-2 flex justify-between items-center text-sm">
                                    <span className="text-gray-500">Status</span>
                                    <span className={`font-semibold ${GROUP_STATUS_COLOR[selectedGroupId?.status] || 'text-[#002756]'}`}>{selectedGroupId?.status}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400 p-4 text-center">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5 21 6.75v10.5l-5.25-3.75M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 13.5 5.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                            </svg>
                            <span className="text-sm">Select a FOD from the list to view its frames and details</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default MissionExplore
