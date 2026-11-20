import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Check,
  Compass,
  Crosshair,
  Globe,
  Hand,
  Layers,
  Maximize2,
  Minimize2,
  Navigation,
  PenTool,
  Pentagon,
  RefreshCw,
  Route,
  Undo2,
  X,
} from 'lucide-react';
import type { GeoPoint, LocalTilesInfo } from '../../store';
import { formatMeters, JUMP_LOCATIONS } from '../../utils/mapGeometry';
import type { DraftStatus, MapLayerStyle, ToolMode } from './types';

interface OverlayToolbarProps {
  toolMode: ToolMode;
  layerStyle: MapLayerStyle;
  localTiles: LocalTilesInfo;
  followCar: boolean;
  isFullscreen: boolean;
  draftStatus: DraftStatus;
  boundaryCount: number;
  tileError: boolean;
  onChangeToolMode: (mode: ToolMode) => void;
  onChangeLayerStyle: (style: MapLayerStyle) => void;
  onToggleFollowCar: () => void;
  onToggleFullscreen: () => void;
  onFitAll: () => void;
  onFlyTo: (pt: GeoPoint, zoom?: number) => void;
  onFinishDraft: () => void;
  onUndoDraft: () => void;
  onCancelDraft: () => void;
  onRedrawTiles: () => void;
}

export default function OverlayToolbar({
  toolMode,
  layerStyle,
  localTiles,
  followCar,
  isFullscreen,
  draftStatus,
  boundaryCount,
  tileError,
  onChangeToolMode,
  onChangeLayerStyle,
  onToggleFollowCar,
  onToggleFullscreen,
  onFitAll,
  onFlyTo,
  onFinishDraft,
  onUndoDraft,
  onCancelDraft,
  onRedrawTiles,
}: OverlayToolbarProps) {
  const centerBarRef = useRef<HTMLDivElement | null>(null);
  const rightBarRef = useRef<HTMLDivElement | null>(null);

  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [showJumpMenu, setShowJumpMenu] = useState(false);
  const [jumpLat, setJumpLat] = useState('9.94585');
  const [jumpLon, setJumpLon] = useState('76.26435');

  useEffect(() => {
    if (centerBarRef.current) {
      L.DomEvent.disableClickPropagation(centerBarRef.current);
      L.DomEvent.disableScrollPropagation(centerBarRef.current);
    }
    if (rightBarRef.current) {
      L.DomEvent.disableClickPropagation(rightBarRef.current);
      L.DomEvent.disableScrollPropagation(rightBarRef.current);
    }
  }, []);

  const tools: Array<{ id: ToolMode; label: string; icon: React.ReactNode; title: string }> = [
    {
      id: 'select',
      label: 'Pan / Select',
      icon: <Hand className="w-3.5 h-3.5" />,
      title: 'Pan map, select pathways & drag vertices',
    },
    {
      id: 'boundary',
      label: `Boundary (${boundaryCount})`,
      icon: <Pentagon className="w-3.5 h-3.5" />,
      title: 'Click map to add N boundary points, drag vertices or + midpoints',
    },
    {
      id: 'draw',
      label: 'Draw Path',
      icon: <PenTool className="w-3.5 h-3.5" />,
      title: 'Click and drag like a pen to draw a human-style route',
    },
    {
      id: 'waypoint',
      label: 'Waypoint Path',
      icon: <Route className="w-3.5 h-3.5" />,
      title: 'Click sequential points with exact directions',
    },
  ];

  const layerOptions: Array<{
    id: MapLayerStyle;
    label: string;
    badge?: string;
    disabled?: boolean;
  }> = [
    { id: 'hybrid', label: 'Satellite + Labels' },
    { id: 'satellite', label: 'Satellite Imagery' },
    {
      id: 'offline',
      label: 'Offline Hi-Res',
      badge: localTiles.available ? 'Local z22' : 'No Tiles',
      disabled: !localTiles.available,
    },
    { id: 'street', label: 'Street (OSM)' },
    { id: 'tactical', label: 'Tactical Radar' },
  ];

  const activeLayerLabel = layerOptions.find((l) => l.id === layerStyle)?.label || 'Map Layer';

  return (
    <>
      {/* Top-Center Floating Tool Studio Bar */}
      <div
        ref={centerBarRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-1.5 pointer-events-auto max-w-[calc(100vw-24rem)]"
      >
        <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/90 dark:bg-[#0b101b]/90 backdrop-blur-md border border-slate-200/90 dark:border-[#24324a] shadow-lg">
          {tools.map((tool) => {
            const active = toolMode === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                title={tool.title}
                onClick={() => onChangeToolMode(tool.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-cyan-600 text-white shadow-sm dark:bg-cyan-500 dark:text-slate-950'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#172133] dark:hover:text-white'
                }`}
              >
                {tool.icon}
                <span>{tool.label}</span>
              </button>
            );
          })}

          <div className="h-5 w-px bg-slate-200 dark:bg-[#24324a] mx-1" />

          <button
            type="button"
            title="Fit map to boundary and pathways"
            onClick={onFitAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#172133] dark:hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <Crosshair className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Fit All</span>
          </button>
        </div>

        {/* Contextual Mode Status Pill / Draft Actions */}
        {(toolMode !== 'select' || draftStatus.kind) && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 text-slate-100 border border-cyan-500/40 shadow-md text-[11px] backdrop-blur-md">
            {toolMode === 'boundary' && (
              <span>
                Click map to add vertex · Drag <b className="text-cyan-300">P1..P{boundaryCount}</b> or{' '}
                <b className="text-cyan-300">+</b> midpoint · Right-click vertex to remove
              </span>
            )}

            {toolMode === 'draw' && draftStatus.kind !== 'draw' && (
              <span>
                Click & drag directly on the map like a pen · Hold <b className="text-cyan-300">Space</b> to pan
              </span>
            )}

            {toolMode === 'draw' && draftStatus.kind === 'draw' && (
              <span className="font-mono text-cyan-300">
                Drawing… {draftStatus.pointCount} pts · {formatMeters(draftStatus.lengthM)}
              </span>
            )}

            {toolMode === 'waypoint' && draftStatus.pointCount === 0 && (
              <span>
                Click map to place directed waypoints <b className="text-cyan-300">1 → 2 → 3</b> · Double-click or Enter to finish
              </span>
            )}

            {toolMode === 'waypoint' && draftStatus.pointCount > 0 && (
              <>
                <span className="font-mono text-cyan-300">
                  {draftStatus.pointCount} wpts · {formatMeters(draftStatus.lengthM)}
                  {draftStatus.lastBearingDeg !== null && ` · ${draftStatus.lastBearingDeg.toFixed(0)}°`}
                  {draftStatus.lastSegmentM !== null && ` (${formatMeters(draftStatus.lastSegmentM)})`}
                </span>
                <button
                  type="button"
                  onClick={onUndoDraft}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  <Undo2 className="w-3 h-3" /> Undo
                </button>
                <button
                  type="button"
                  disabled={draftStatus.pointCount < 2}
                  onClick={onFinishDraft}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                    draftStatus.pointCount >= 2
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Check className="w-3 h-3" /> Finish
                </button>
                <button
                  type="button"
                  onClick={onCancelDraft}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-900/70 hover:bg-rose-800 text-rose-200 cursor-pointer"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Top-Right Map Layer, Jump, Follow & Fullscreen Controls */}
      <div
        ref={rightBarRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-1.5 pointer-events-auto"
      >
        <div className="flex items-center gap-1.5">
        {/* Map Layer Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowLayerMenu((v) => !v);
              setShowJumpMenu(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/90 dark:bg-[#0b101b]/90 backdrop-blur-md border border-slate-200/90 dark:border-[#24324a] shadow-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-cyan-500/60 transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>{activeLayerLabel}</span>
            {localTiles.available && layerStyle === 'offline' && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                z22
              </span>
            )}
          </button>

          {showLayerMenu && (
            <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-white/95 dark:bg-[#0d1422]/95 backdrop-blur-md border border-slate-200 dark:border-[#24324a] shadow-xl p-1.5 flex flex-col gap-0.5">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Real Map Layers
              </div>
              {layerOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    onChangeLayerStyle(opt.id);
                    setShowLayerMenu(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${
                    opt.disabled
                      ? 'opacity-45 cursor-not-allowed text-slate-400'
                      : layerStyle === opt.id
                        ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300 cursor-pointer'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#172133] cursor-pointer'
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.badge && (
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${
                        opt.disabled
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                          : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                      }`}
                    >
                      {opt.badge}
                    </span>
                  )}
                </button>
              ))}
              <div className="border-t border-slate-200 dark:border-[#1e2a3f] mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onRedrawTiles();
                    setShowLayerMenu(false);
                  }}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#172133] cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3 h-3 text-cyan-500" />
                  <span>Reload Tiles</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Jump-to-Coordinates Popover */}
        <div className="relative">
          <button
            type="button"
            title="Jump to airport or custom lat/lon"
            onClick={() => {
              setShowJumpMenu((v) => !v);
              setShowLayerMenu(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/90 dark:bg-[#0b101b]/90 backdrop-blur-md border border-slate-200/90 dark:border-[#24324a] shadow-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-cyan-500/60 transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Jump</span>
          </button>

          {showJumpMenu && (
            <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white/95 dark:bg-[#0d1422]/95 backdrop-blur-md border border-slate-200 dark:border-[#24324a] shadow-xl p-3 flex flex-col gap-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Fly to Coordinates
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  step="0.0001"
                  value={jumpLat}
                  onChange={(e) => setJumpLat(e.target.value)}
                  placeholder="Lat"
                  className="bg-slate-100 dark:bg-[#141d2e] border border-slate-300 dark:border-[#283854] rounded-lg px-2 py-1 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                />
                <input
                  type="number"
                  step="0.0001"
                  value={jumpLon}
                  onChange={(e) => setJumpLon(e.target.value)}
                  placeholder="Lon"
                  className="bg-slate-100 dark:bg-[#141d2e] border border-slate-300 dark:border-[#283854] rounded-lg px-2 py-1 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const lat = parseFloat(jumpLat);
                  const lon = parseFloat(jumpLon);
                  if (Number.isFinite(lat) && Number.isFinite(lon)) {
                    onFlyTo({ lat, lon }, 18);
                    setShowJumpMenu(false);
                  }
                }}
                className="w-full py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold cursor-pointer flex items-center justify-center gap-1"
              >
                <Compass className="w-3.5 h-3.5" /> Go to Coordinate
              </button>
              <div className="border-t border-slate-200 dark:border-[#1e2a3f] pt-2 flex flex-col gap-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Quick Sites
                </div>
                {JUMP_LOCATIONS.map((site) => (
                  <button
                    key={site.name}
                    type="button"
                    onClick={() => {
                      onFlyTo({ lat: site.lat, lon: site.lon }, site.zoom);
                      setShowJumpMenu(false);
                    }}
                    className="text-left px-2 py-1 rounded-lg text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#172133] cursor-pointer transition-colors"
                  >
                    {site.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Follow Car Toggle */}
        <button
          type="button"
          title="Keep map centered on the vehicle"
          onClick={onToggleFollowCar}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl backdrop-blur-md border shadow-lg text-xs font-semibold transition-colors cursor-pointer ${
            followCar
              ? 'bg-cyan-600 border-cyan-500 text-white dark:bg-cyan-500 dark:text-slate-950'
              : 'bg-white/90 dark:bg-[#0b101b]/90 border-slate-200/90 dark:border-[#24324a] text-slate-700 dark:text-slate-200 hover:border-cyan-500/60'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Follow</span>
        </button>

        {/* Fullscreen Expand / Collapse */}
        <button
          type="button"
          title={isFullscreen ? 'Exit Fullscreen Map' : 'Expand Map Fullscreen'}
          onClick={onToggleFullscreen}
          className="p-2 rounded-xl bg-white/90 dark:bg-[#0b101b]/90 backdrop-blur-md border border-slate-200/90 dark:border-[#24324a] shadow-lg text-slate-700 dark:text-slate-200 hover:border-cyan-500/60 transition-colors cursor-pointer"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        </div>

        {tileError && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-950/90 border border-amber-500/50 text-amber-200 shadow-lg text-[11px] backdrop-blur-md">
            <span>Tiles slow / unavailable</span>
            <button
              type="button"
              onClick={onRedrawTiles}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Retry Tiles
            </button>
            {localTiles.available && layerStyle !== 'offline' && (
              <button
                type="button"
                onClick={() => onChangeLayerStyle('offline')}
                className="px-2 py-0.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold cursor-pointer"
              >
                Use Offline Hi-Res
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
