import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Compass, Pause, Play, RotateCcw } from 'lucide-react';
import type { CompiledRoutePreview, GeoPoint } from '../../store';
import { formatDuration, formatMeters } from '../../utils/mapGeometry';
import type { VehicleDisplayState } from './types';

interface OverlayPlaybackBarProps {
  vehicle: VehicleDisplayState;
  compiledRoute: CompiledRoutePreview | null;
  simRunning: boolean;
  isPreviewing: boolean;
  cursorPt: GeoPoint | null;
  onTogglePreview: () => void;
  onResetVehicle: () => void;
  onScrubProgress: (pct: number) => void;
}

export default function OverlayPlaybackBar({
  vehicle,
  compiledRoute,
  simRunning,
  isPreviewing,
  cursorPt,
  onTogglePreview,
  onResetVehicle,
  onScrubProgress,
}: OverlayPlaybackBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (barRef.current) {
      L.DomEvent.disableClickPropagation(barRef.current);
      L.DomEvent.disableScrollPropagation(barRef.current);
    }
    if (hudRef.current) {
      L.DomEvent.disableClickPropagation(hudRef.current);
      L.DomEvent.disableScrollPropagation(hudRef.current);
    }
  }, []);

  const totalM = compiledRoute?.total_length_m ?? vehicle.totalLengthM;
  const estSecs = compiledRoute?.estimated_duration_secs ?? 0;

  return (
    <>
      {/* Bottom-Center Floating Telemetry & Playback Bar */}
      <div
        ref={barRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto flex flex-col gap-1.5 px-3.5 py-2 rounded-2xl bg-white/92 dark:bg-[#0b101b]/92 backdrop-blur-md border border-slate-200/90 dark:border-[#24324a] shadow-2xl min-w-[460px] max-w-[calc(100vw-26rem)]"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Play/Preview & Reset Controls */}
          <div className="flex items-center gap-1.5">
            {simRunning ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold tracking-wider uppercase">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                LIVE SIM
              </span>
            ) : (
              <button
                type="button"
                title="Dry-Run Preview Drive along compiled path sequence"
                onClick={onTogglePreview}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                  isPreviewing
                    ? 'bg-violet-600 hover:bg-violet-500 text-white'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950'
                }`}
              >
                {isPreviewing ? (
                  <>
                    <Pause className="w-3 h-3 fill-current" />
                    <span>Pause Preview</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" />
                    <span>Preview Drive</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              title="Reset vehicle to start of path sequence"
              onClick={onResetVehicle}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#141d2e] dark:hover:bg-[#1c2840] border border-slate-200 dark:border-[#24324a] text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Live Telemetry Readouts */}
          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-700 dark:text-slate-200">
            <span className="flex items-center gap-1 font-bold text-cyan-700 dark:text-cyan-300">
              <Compass
                className="w-3.5 h-3.5 transition-transform"
                style={{ transform: `rotate(${vehicle.heading.toFixed(0)}deg)` }}
              />
              {vehicle.heading.toFixed(0)}°
            </span>

            <span className="font-bold text-slate-900 dark:text-white">
              {vehicle.speedKmh.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">km/h</span>
            </span>

            <span className="hidden md:inline text-slate-500 dark:text-slate-400">
              {vehicle.lat.toFixed(5)}, {vehicle.lon.toFixed(5)}
            </span>

            {vehicle.activePathName && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#141d2e] border border-slate-200 dark:border-[#24324a] text-cyan-700 dark:text-cyan-300 font-semibold truncate max-w-[145px]">
                {vehicle.activePathIndex !== null ? `#${vehicle.activePathIndex + 1} · ` : ''}
                {vehicle.activePathName}
              </span>
            )}

            <span className="text-slate-500 dark:text-slate-400">
              {formatMeters(totalM)} · {formatDuration(estSecs)}
            </span>

            {vehicle.lapCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-[10px]">
                Lap {vehicle.lapCount + 1}
              </span>
            )}
          </div>
        </div>

        {/* Route Scrub Slider */}
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 w-10 text-right">
            {vehicle.progressPct.toFixed(0)}%
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="0.5"
            value={vehicle.progressPct}
            onChange={(e) => onScrubProgress(parseFloat(e.target.value))}
            className="flex-1 h-1.5 accent-cyan-500 cursor-pointer"
          />
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 w-16">
            {formatMeters(vehicle.distanceM)}
          </span>
        </div>
      </div>

      {/* Bottom-Right Compact Cursor Coordinates & Legend Pill */}
      <div
        ref={hudRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-3 right-14 z-[1000] pointer-events-auto hidden xl:flex flex-col items-end gap-1"
      >
        {cursorPt && (
          <div className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-[#0b101b]/90 backdrop-blur-md border border-slate-200/80 dark:border-[#24324a] shadow-md text-[10px] font-mono text-slate-700 dark:text-slate-300">
            {cursorPt.lat.toFixed(6)}, {cursorPt.lon.toFixed(6)}
          </div>
        )}
        <div className="flex items-center gap-2.5 px-2.5 py-1 rounded-lg bg-white/90 dark:bg-[#0b101b]/90 backdrop-blur-md border border-slate-200/80 dark:border-[#24324a] shadow-md text-[10px] text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" /> Boundary
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 border-b-2 border-cyan-400 inline-block" /> Path ➤
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 border-b-2 border-dashed border-amber-400 inline-block" /> Transit
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-violet-400 inline-block" /> Vehicle
          </span>
        </div>
      </div>
    </>
  );
}
