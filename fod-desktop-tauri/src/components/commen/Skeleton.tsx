import React from "react";

export const FodGridSkeleton: React.FC<{ count?: number }> = ({ count = 12 }) => {
  return (
    <div className="h-full w-full overflow-hidden select-none zoid-fade-slide">
      <div className="flex flex-wrap justify-center gap-4 pt-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="w-[225px] h-[350px] rounded-xl p-3.5 flex flex-col justify-between bg-white dark:bg-[#1C2129] border border-slate-200 dark:border-[#373C43]"
          >
            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="h-4 w-16 rounded-full zoid-shimmer" />
                <div className="h-5 w-5 rounded-md zoid-shimmer" />
              </div>
              <div className="h-5 w-24 rounded-md zoid-shimmer mb-2.5" />
              <div className="h-[105px] w-full rounded-lg zoid-shimmer mb-3 border border-slate-200/60 dark:border-slate-700/40" />
              <div className="space-y-2">
                <div className="flex justify-between">
                  <div className="h-3 w-10 rounded zoid-shimmer" />
                  <div className="h-3 w-16 rounded zoid-shimmer" />
                </div>
                <div className="flex justify-between">
                  <div className="h-3 w-8 rounded zoid-shimmer" />
                  <div className="h-3 w-12 rounded zoid-shimmer" />
                </div>
                <div className="flex justify-between">
                  <div className="h-3 w-14 rounded zoid-shimmer" />
                  <div className="h-3 w-20 rounded zoid-shimmer" />
                </div>
              </div>
            </div>
            <div className="space-y-1.5 pt-2">
              <div className="h-8 w-full rounded-lg zoid-shimmer" />
              <div className="h-8 w-full rounded-lg zoid-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const MissionSelectorSkeleton: React.FC = () => {
  return (
    <div className="h-full w-full flex items-center gap-6 p-5 overflow-hidden select-none bg-[#F1F5F9] dark:bg-[#22262B] zoid-fade-slide">
      {/* Left sidebar skeleton */}
      <div className="h-full w-[286px] shrink-0 flex flex-col rounded-2xl p-3.5 border bg-white dark:bg-[#1A1E24] border-slate-200/90 dark:border-[#2E343D] shadow-sm">
        <div className="w-full h-10 rounded-lg zoid-shimmer" />
        <div className="flex items-center justify-between px-1 mt-4 mb-3">
          <div className="h-3 w-28 rounded zoid-shimmer" />
          <div className="h-3 w-12 rounded zoid-shimmer" />
        </div>
        <div className="flex-1 space-y-2.5 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-full rounded-xl p-3 border border-slate-200 dark:border-[#373C43] bg-white dark:bg-[#292D33] flex items-center justify-between gap-3"
            >
              <div className="flex-1 space-y-2.5">
                <div className="h-4 w-24 rounded zoid-shimmer" />
                <div className="flex items-center gap-4">
                  <div className="h-6 w-8 rounded zoid-shimmer" />
                  <div className="h-6 w-8 rounded zoid-shimmer" />
                  <div className="h-6 w-8 rounded zoid-shimmer" />
                </div>
              </div>
              <div className="w-[72px] h-[52px] rounded-md shrink-0 zoid-shimmer" />
            </div>
          ))}
        </div>
      </div>

      {/* Right main area skeleton */}
      <div className="relative h-full flex-1 flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-2xl zoid-shimmer mb-4" />
        <div className="h-7 w-28 rounded-lg zoid-shimmer mb-3" />
        <div className="h-3 w-64 rounded zoid-shimmer" />
      </div>
    </div>
  );
};

export const ExploreFodListSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="flex-1 min-h-0 overflow-hidden p-2 xl:p-2.5 space-y-1.5 xl:space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 xl:gap-3 p-1.5 xl:p-2.5 rounded-xl border border-slate-200/90 dark:border-[#373C43] bg-slate-50/70 dark:bg-[#22262B]"
        >
          <div className="w-14 h-12 xl:w-[88px] xl:h-[68px] shrink-0 rounded-lg zoid-shimmer" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="h-3.5 w-16 rounded zoid-shimmer" />
              <div className="h-4 w-12 rounded-full zoid-shimmer" />
            </div>
            <div className="h-3 w-28 rounded zoid-shimmer" />
            <div className="h-2.5 w-36 rounded zoid-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
};
