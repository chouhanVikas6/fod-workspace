import { RootState } from '@/store';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { getDistance } from 'geolib';

function SelectedLineDistance({ refrenceLine, map }: { refrenceLine?: any; map?: any }) {
  const selfLocation = useSelector((state: RootState) => state.SystemHealth.RtkData.data);
  const [distanceFromSelectedFod, setSelectedFodDistance] = useState<[number, number]>([0, 0]);

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
    <div className="absolute top-4 right-16 z-20 min-w-[205px] rounded-xl bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md border border-slate-200/90 dark:border-white/15 shadow-lg px-3.5 py-2.5 select-none transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-1.5 mb-1.5 border-b border-slate-200/80 dark:border-white/10">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#4C9FE8] shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#8C939C]">
            General Coordinates
          </span>
        </div>
      </div>

      {/* Coordinates Readout */}
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
    </div>
  );
}

export default SelectedLineDistance;
