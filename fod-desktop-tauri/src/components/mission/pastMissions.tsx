import React, { useMemo, useCallback } from "react";
import { FolderOpen } from "lucide-react";
import MissionCard from "./missionCard";

function getMissionDateInfo(mission: any): { key: string; label: string } {
    const raw = mission?.createdAt ?? mission?.created_at;
    if (!raw) return { key: "unknown", label: "Unknown Date" };
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return { key: "unknown", label: "Unknown Date" };
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
    return { key, label };
}

// Mission list comes from MissionSelector's paginated API so card stats stay live
// without loading thousands of missions at once.
const PastMission = ({
    missions,
    totalCount,
    hasMore: hasMoreProp,
    loadingMore = false,
    onLoadMore,
    setMission,
    selectedMission,
}: any) => {
    const visibleMissions = missions || [];
    const total = typeof totalCount === "number" ? totalCount : visibleMissions.length;
    const hasMore = typeof hasMoreProp === "boolean" ? hasMoreProp : total > visibleMissions.length;
    const remainingCount = Math.max(0, total - visibleMissions.length);

    const handleScroll = useCallback(
        (e: React.UIEvent<HTMLDivElement>) => {
            if (!hasMore || loadingMore || !onLoadMore) return;
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
                onLoadMore();
            }
        },
        [hasMore, loadingMore, onLoadMore]
    );

    const groupedMissions = useMemo(() => {
        if (!visibleMissions.length) return [];
        const groups: { key: string; label: string; items: { mission: any; index: number }[] }[] = [];
        for (let i = 0; i < visibleMissions.length; i++) {
            const mission = visibleMissions[i];
            const { key, label } = getMissionDateInfo(mission);
            const last = groups[groups.length - 1];
            if (last && last.key === key) {
                last.items.push({ mission, index: i });
            } else {
                groups.push({ key, label, items: [{ mission, index: i }] });
            }
        }
        return groups;
    }, [visibleMissions]);

    return (
        <div
            onScroll={handleScroll}
            className='flex-1 min-h-0 w-full flex flex-col justify-start items-stretch space-y-2.5 overflow-y-auto pr-1'
        >
            {groupedMissions.length ? (
                <>
                    {groupedMissions.map((group) => (
                        <React.Fragment key={group.key}>
                            <div className="flex items-center gap-2 pt-1.5 pb-0.5 select-none">
                                <div className="h-px flex-1 bg-slate-200 dark:bg-[#2E343D]" />
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#8C939C] shrink-0">
                                    {group.label}
                                </span>
                                <div className="h-px flex-1 bg-slate-200 dark:bg-[#2E343D]" />
                            </div>
                            {group.items.map(({ mission, index }) => (
                                <MissionCard
                                    missionData={mission}
                                    key={mission.mission_id || index}
                                    index={index}
                                    {...{ selectedMission, setMission }}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                    {hasMore && onLoadMore && (
                        <button
                            type="button"
                            disabled={loadingMore}
                            onClick={onLoadMore}
                            className="w-full py-2 mt-1 rounded-xl border border-slate-200 dark:border-[#323842] bg-slate-50 hover:bg-slate-100 dark:bg-[#22262D] dark:hover:bg-[#2B3038] text-xs font-semibold text-[#4C9FE8] transition-colors cursor-pointer shrink-0 disabled:opacity-60"
                        >
                            {loadingMore
                                ? "Loading more missions…"
                                : `Load More (${Math.min(40, remainingCount)} of ${remainingCount} remaining)`}
                        </button>
                    )}
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-[#323842] bg-slate-50/70 dark:bg-[#22262D]/60 px-4 py-10 text-center">
                    <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-[#2A3038] flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3">
                        <FolderOpen size={20} strokeWidth={1.8} />
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        No missions found
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed max-w-[185px]">
                        Start a new mission above or wait for missions to sync.
                    </p>
                </div>
            )}
        </div>
    );
};

export default PastMission;
