import { RootState } from '@/store';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { getDistance } from 'geolib';
import { RxChevronDown, RxChevronUp } from 'react-icons/rx';

function SelectedLineDistance({ refrenceLine, map }: { refrenceLine?: any; map?: any }) {
  const selfLocation = useSelector((state: RootState) => state.SystemHealth.RtkData.data);
  const [distanceFromSelectedFod, setSelectedFodDistance] = useState<[number, number]>([0, 0]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const typedSelfLocation = selfLocation as { lat?: number; lon?: number };
    if (
      typedSelfLocation &&
      typeof typedSelfLocation.lat === 'number' &&
      typeof typedSelfLocation.lon === 'number' &&
      Array.isArray(refrenceLine) &&
      !!refrenceLine[0] &&
      !!refrenceLine[1]
    ) {
      const distance0 = getDistance(
        refrenceLine[0],
        { latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon },
        0.001
      );
      const distance1 = getDistance(
        refrenceLine[1],
        { latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon },
        0.001
      );
      setSelectedFodDistance([distance0, distance1]);
    }
  }, [refrenceLine, selfLocation]);

  const latDisplay = `${distanceFromSelectedFod[0].toFixed(6)}° N`;
  const lonDisplay = `${distanceFromSelectedFod[1].toFixed(6)}° E`;

  return (
    <div
      className={`absolute top-3 right-16 z-20 rounded-xl bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md border border-slate-200/90 dark:border-white/15 shadow-lg select-none transition-all ${
        isExpanded ? 'min-w-[195px] sm:min-w-[210px] px-3 py-2.5' : 'px-2.5 py-1.5'
      }`}
    >
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 cursor-pointer focus:outline-none ${
          isExpanded ? 'pb-1.5 mb-1.5 border-b border-slate-200/80 dark:border-white/10' : ''
        }`}
        title={isExpanded ? 'Collapse coordinates' : 'Expand coordinates'}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#4C9FE8] shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#A8B0BA] whitespace-nowrap">
            General Coordinates
          </span>
        </div>

        {isExpanded ? (
          <RxChevronUp className="w-3.5 h-3.5 text-slate-400 dark:text-[#8C939C] shrink-0" />
        ) : (
          <RxChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-[#8C939C] shrink-0" />
        )}
      </button>

      {/* Coordinates Readout */}
      {isExpanded && (
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-[#8C939C]">
              LAT
            </span>
            <span className="font-mono font-bold text-slate-800 dark:text-white tabular-nums">
              {latDisplay}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-[#8C939C]">
              LON
            </span>
            <span className="font-mono font-bold text-slate-800 dark:text-white tabular-nums">
              {lonDisplay}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SelectedLineDistance;
