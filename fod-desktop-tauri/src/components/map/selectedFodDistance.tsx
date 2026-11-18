import { RootState } from '@/store';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import getDistance from 'geolib/es/getDistance';
import { RxChevronDown, RxChevronUp } from 'react-icons/rx';

function SelectedFodDistance({ map }: { map?: any }) {
  const [distance, setDistance] = useState<number | string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const { fod, selectedFrame } = useSelector((state: RootState) => state.SelectedFod);
  const selfLocation = useSelector(
    (state: RootState) => state.SystemHealth.RtkData.data
  ) as { lat?: number; lon?: number };

  const updateLine = (selfLoc: any, selectedFod: any) => {
    if (selfLoc && selectedFod && map?.current?.getSource('lines')) {
      const lineData = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [selfLoc.lon, selfLoc.lat],
                [selectedFod.location.lon, selectedFod.location.lat],
              ],
            },
          },
        ],
      };

      map.current.getSource('lines').setData(lineData);
    }
  };

  useEffect(() => {
    const typedSelfLocation = selfLocation as { lat?: number; lon?: number };
    let fodPointArr: Array<{ groupId: number; location: { lat: number; lon: number } }> = [];
    if (Array.isArray(fod?.FodPoint)) {
      fodPointArr = fod.FodPoint as Array<{ groupId: number; location: { lat: number; lon: number } }>;
    } else if (typeof fod?.FodPoint === 'string') {
      try {
        const parsed = JSON.parse(fod.FodPoint);
        if (Array.isArray(parsed)) {
          fodPointArr = parsed;
        } else if (parsed && typeof parsed === 'object') {
          fodPointArr = [parsed];
        }
      } catch (e) {
        // Ignore invalid JSON
      }
    }
    if (!!typedSelfLocation?.lat && !!typedSelfLocation?.lon && fodPointArr.length > 0) {
      const target =
        !!selectedFrame && selectedFrame.groupId == fodPointArr[0]?.groupId
          ? selectedFrame
          : fodPointArr[0];
      const payloadTarget = { latitude: target.location.lat, longitude: target.location.lon };
      const payloadSelf = { latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon };
      const d = getDistance(payloadTarget, payloadSelf, 0.001);
      setDistance(d.toFixed(2));
      updateLine(typedSelfLocation, target);
    } else {
      setDistance(-1);
    }
  }, [selfLocation, fod, selectedFrame]);

  const latDisplay =
    typeof selfLocation?.lat === 'number' && isFinite(selfLocation.lat)
      ? `${selfLocation.lat.toFixed(6)}° N`
      : '0.000000° N';

  const lonDisplay =
    typeof selfLocation?.lon === 'number' && isFinite(selfLocation.lon)
      ? `${selfLocation.lon.toFixed(6)}° E`
      : '0.000000° E';

  const hasValidDistance = distance !== null && Number(distance) >= 0;

  return (
    <div
      className={`absolute top-3 left-3 z-20 rounded-xl bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md border border-slate-200/90 dark:border-white/15 shadow-lg select-none transition-all ${
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
          <span className="w-2 h-2 rounded-full bg-[#01B656] shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#A8B0BA] whitespace-nowrap">
            Our Coordinates
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#4C9FE8]/15 text-[#4C9FE8] whitespace-nowrap">
            {hasValidDistance ? `${distance} m` : '— m'}
          </span>
          {isExpanded ? (
            <RxChevronUp className="w-3.5 h-3.5 text-slate-400 dark:text-[#8C939C]" />
          ) : (
            <RxChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-[#8C939C]" />
          )}
        </div>
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

export default SelectedFodDistance;
