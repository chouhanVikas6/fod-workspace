import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Gauge,
  GripVertical,
  MapPin,
  PenTool,
  Pentagon,
  Plus,
  RotateCcw,
  Route,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { CompiledRoutePreview, GeoPoint, LocationConfig, LoopMode, Pathway } from '../../store';
import {
  formatArea,
  formatMeters,
  PATHWAY_COLORS,
  polygonCentroid,
  polylineLengthMeters,
  PRESET_BOUNDARIES,
} from '../../utils/mapGeometry';
import type { InspectorTab, ToolMode } from './types';

interface OverlayInspectorProps {
  open: boolean;
  activeTab: InspectorTab;
  location: LocationConfig;
  compiledRoute: CompiledRoutePreview | null;
  selectedPathwayId: string | null;
  activeCarPathIndex: number | null;
  showTrail: boolean;
  onToggleOpen: () => void;
  onChangeTab: (tab: InspectorTab) => void;
  onChangeToolMode: (mode: ToolMode) => void;
  onUpdateLocation: (patch: Partial<LocationConfig>) => Promise<void>;
  onSelectPathway: (id: string | null) => void;
  onFlyTo: (pt: GeoPoint, zoom?: number) => void;
  onFitBoundary: () => void;
  onToggleShowTrail: () => void;
  onClearTrail: () => void;
}

export default function OverlayInspector({
  open,
  activeTab,
  location,
  compiledRoute,
  selectedPathwayId,
  activeCarPathIndex,
  showTrail,
  onToggleOpen,
  onChangeTab,
  onChangeToolMode,
  onUpdateLocation,
  onSelectPathway,
  onFlyTo,
  onFitBoundary,
  onToggleShowTrail,
  onClearTrail,
}: OverlayInspectorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      L.DomEvent.disableClickPropagation(containerRef.current);
      L.DomEvent.disableScrollPropagation(containerRef.current);
    }
  }, [open]);

  if (!open) {
    return (
      <div
        ref={containerRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-3 left-3 z-[1000] pointer-events-auto"
      >
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/90 dark:bg-[#0b101b]/90 backdrop-blur-md border border-slate-200/90 dark:border-[#24324a] shadow-lg text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-cyan-500/60 cursor-pointer"
        >
          <ChevronRight className="w-4 h-4 text-cyan-500" />
          <span>Studio Controls</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-600 dark:text-cyan-300">
            {location.boundary_points.length} pts
          </span>
        </button>
      </div>
    );
  }

  const movePathway = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= location.pathways.length) return;
    const next = [...location.pathways];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onUpdateLocation({ pathways: next });
  };

  const handleConvertSweepsToSequence = (replaceExisting: boolean) => {
    const lanes = compiledRoute?.auto_sweep_lanes || [];
    if (lanes.length === 0) return;
    const baseOffset = replaceExisting ? 0 : location.pathways.length;
    const stamp = Date.now().toString(36);
    const converted: Pathway[] = lanes.map((pts, idx) => ({
      id: `sweep-${stamp}-${idx}`,
      name: `Sweep #${baseOffset + idx + 1}`,
      kind: 'auto_sweep',
      points: pts,
      enabled: true,
      reversed: false,
      speed_kmh: null,
      color: PATHWAY_COLORS[(baseOffset + idx) % PATHWAY_COLORS.length],
    }));

    const nextList = replaceExisting ? converted : [...location.pathways, ...converted];
    onSelectPathway(converted[0]?.id ?? null);
    onUpdateLocation({
      path_mode: 'custom_sequence',
      pathways: nextList,
    });
  };

  const handleAddBoundaryPoint = () => {
    const pts = location.boundary_points;
    if (pts.length >= 2) {
      const last = pts[pts.length - 1];
      const first = pts[0];
      const mid = { lat: (last.lat + first.lat) / 2, lon: (last.lon + first.lon) / 2 };
      onUpdateLocation({ boundary_points: [...pts, mid] });
    } else {
      const c = polygonCentroid(pts);
      onUpdateLocation({
        boundary_points: [...pts, { lat: c.lat + 0.0005, lon: c.lon + 0.0005 }],
      });
    }
  };

  const cardinalDirections = [
    { label: '0° N', deg: 0 },
    { label: '45° NE', deg: 45 },
    { label: '90° E', deg: 90 },
    { label: '135° SE', deg: 135 },
    { label: '180° S', deg: 180 },
    { label: '270° W', deg: 270 },
  ];

  const activePathCount =
    location.path_mode === 'custom_sequence'
      ? location.pathways.filter((p) => p.enabled).length
      : compiledRoute?.auto_sweep_lanes.length ?? location.sweep_passes;

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className="absolute top-3 left-3 bottom-16 z-[1000] w-80 flex flex-col rounded-2xl bg-white/92 dark:bg-[#0b101b]/92 backdrop-blur-md border border-slate-200/90 dark:border-[#24324a] shadow-2xl overflow-hidden pointer-events-auto"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200/80 dark:border-[#1c283c]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-slate-100">
            Mission Map Studio
          </span>
        </div>
        <button
          type="button"
          title="Collapse Studio Panel"
          onClick={onToggleOpen}
          className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#172133] dark:hover:text-white cursor-pointer transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* 3 Sub-Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1.5 bg-slate-100/80 dark:bg-[#0f1625] border-b border-slate-200/80 dark:border-[#1c283c] text-[11px] font-semibold">
        <button
          type="button"
          onClick={() => onChangeTab('boundary')}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'boundary'
              ? 'bg-white text-cyan-700 shadow-xs dark:bg-[#192338] dark:text-cyan-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Pentagon className="w-3.5 h-3.5" />
          <span>Boundary</span>
          <span className="font-mono text-[10px] opacity-80">({location.boundary_points.length})</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTab('pathways')}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'pathways'
              ? 'bg-white text-cyan-700 shadow-xs dark:bg-[#192338] dark:text-cyan-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Route className="w-3.5 h-3.5" />
          <span>Pathways</span>
          <span className="font-mono text-[10px] opacity-80">({activePathCount})</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTab('drive')}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'drive'
              ? 'bg-white text-cyan-700 shadow-xs dark:bg-[#192338] dark:text-cyan-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Gauge className="w-3.5 h-3.5" />
          <span>Drive</span>
        </button>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 text-xs">
        {/* ================= TAB 1: BOUNDARY (N POINTS) ================= */}
        {activeTab === 'boundary' && (
          <>
            {/* Area & Perimeter Pills */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42]">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Area</div>
                <div className="font-mono font-bold text-slate-800 dark:text-cyan-300 text-xs mt-0.5">
                  {formatArea(compiledRoute?.boundary_area_m2 ?? 0)}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42]">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Perimeter</div>
                <div className="font-mono font-bold text-slate-800 dark:text-slate-100 text-xs mt-0.5">
                  {formatMeters(compiledRoute?.boundary_perimeter_m ?? 0)}
                </div>
              </div>
            </div>

            {/* Enforce FOD Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] cursor-pointer">
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                  Enforce FOD Inside Boundary
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  Clamp generated detections inside polygon
                </div>
              </div>
              <input
                type="checkbox"
                checked={location.enforce_boundary}
                onChange={(e) => onUpdateLocation({ enforce_boundary: e.target.checked })}
                className="accent-cyan-500 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* Quick Boundary Edit Trigger + Presets */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Presets & Quick Jump
                </span>
                <button
                  type="button"
                  onClick={() => onChangeToolMode('boundary')}
                  className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  Pick on Map →
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {PRESET_BOUNDARIES.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={async () => {
                      await onUpdateLocation({ boundary_points: preset.points });
                      setTimeout(() => onFitBoundary(), 40);
                    }}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-100/80 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-300 dark:bg-[#131b2c] dark:hover:bg-[#19263d] dark:border-[#223048] text-left transition-colors cursor-pointer"
                  >
                    <span className="font-medium text-slate-700 dark:text-slate-200 text-[11px] truncate">
                      {preset.name}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-[#0d1422] text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-[#283854] shrink-0">
                      {preset.tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vertex List (P1..PN) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Vertices ({location.boundary_points.length})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleAddBoundaryPoint}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-semibold cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Point
                  </button>
                  <button
                    type="button"
                    title="Reset to default 4-point box"
                    onClick={async () => {
                      await onUpdateLocation({ boundary_points: PRESET_BOUNDARIES[1].points });
                      setTimeout(() => onFitBoundary(), 40);
                    }}
                    className="p-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#172133] dark:hover:bg-[#22304a] text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-0.5">
                {location.boundary_points.map((pt, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[11px] text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
                        P{idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Center map on vertex"
                          onClick={() => onFlyTo(pt)}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-[#1e2c45] text-slate-500 dark:text-slate-400 cursor-pointer"
                        >
                          <Crosshair className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title={
                            location.boundary_points.length <= 3
                              ? 'Minimum 3 vertices required'
                              : 'Delete vertex'
                          }
                          disabled={location.boundary_points.length <= 3}
                          onClick={() => {
                            const next = location.boundary_points.filter((_, i) => i !== idx);
                            onUpdateLocation({ boundary_points: next });
                          }}
                          className={`p-1 rounded ${
                            location.boundary_points.length <= 3
                              ? 'opacity-30 cursor-not-allowed text-slate-400'
                              : 'hover:bg-rose-500/20 text-rose-500 cursor-pointer'
                          }`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        step="0.0001"
                        value={Number(pt.lat.toFixed(6))}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          const next = location.boundary_points.map((p, i) =>
                            i === idx ? { ...p, lat: v } : p
                          );
                          onUpdateLocation({ boundary_points: next });
                        }}
                        className="w-full bg-white dark:bg-[#0d1422] border border-slate-300 dark:border-[#283854] rounded px-1.5 py-1 text-[11px] font-mono text-slate-800 dark:text-white outline-none focus:border-cyan-500"
                      />
                      <input
                        type="number"
                        step="0.0001"
                        value={Number(pt.lon.toFixed(6))}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          const next = location.boundary_points.map((p, i) =>
                            i === idx ? { ...p, lon: v } : p
                          );
                          onUpdateLocation({ boundary_points: next });
                        }}
                        className="w-full bg-white dark:bg-[#0d1422] border border-slate-300 dark:border-[#283854] rounded px-1.5 py-1 text-[11px] font-mono text-slate-800 dark:text-white outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ================= TAB 2: PATHWAYS & SEQUENCE ================= */}
        {activeTab === 'pathways' && (
          <>
            {/* Mode Segmented Toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42]">
              <button
                type="button"
                onClick={() => onUpdateLocation({ path_mode: 'auto_sweep' })}
                className={`py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                  location.path_mode === 'auto_sweep'
                    ? 'bg-cyan-600 text-white shadow-xs dark:bg-cyan-500 dark:text-slate-950'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                Auto Sweep
              </button>
              <button
                type="button"
                onClick={() => onUpdateLocation({ path_mode: 'custom_sequence' })}
                className={`py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                  location.path_mode === 'custom_sequence'
                    ? 'bg-cyan-600 text-white shadow-xs dark:bg-cyan-500 dark:text-slate-950'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                Custom Sequence ({location.pathways.length})
              </button>
            </div>

            {location.path_mode === 'auto_sweep' ? (
              <div className="flex flex-col gap-3">
                {/* Sweep Passes */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Sweep Passes</span>
                    <span className="font-mono font-bold text-cyan-600 dark:text-cyan-300">
                      {location.sweep_passes} {location.sweep_passes === 1 ? 'Pass' : 'Passes'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={location.sweep_passes}
                    onChange={(e) => onUpdateLocation({ sweep_passes: parseInt(e.target.value, 10) })}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 5, 8].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => onUpdateLocation({ sweep_passes: p })}
                        className={`py-1 rounded text-[10px] font-mono font-semibold border cursor-pointer ${
                          location.sweep_passes === p
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-700 dark:text-cyan-300'
                            : 'bg-white dark:bg-[#0d1422] border-slate-200 dark:border-[#24324a] text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {p}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Exact Sweep Direction */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-cyan-500" />
                      Exact Sweep Direction
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateLocation({
                          sweep_angle_deg: location.sweep_angle_deg === null ? 90 : null,
                        })
                      }
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border cursor-pointer ${
                        location.sweep_angle_deg === null
                          ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-cyan-500/20 border-cyan-500/60 text-cyan-700 dark:text-cyan-300'
                      }`}
                    >
                      {location.sweep_angle_deg === null
                        ? 'Auto (Longest)'
                        : `${Math.round(location.sweep_angle_deg)}°`}
                    </button>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="359"
                    step="1"
                    value={location.sweep_angle_deg ?? 90}
                    onChange={(e) => onUpdateLocation({ sweep_angle_deg: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />

                  <div className="grid grid-cols-3 gap-1">
                    {cardinalDirections.map((c) => (
                      <button
                        key={c.deg}
                        type="button"
                        onClick={() => onUpdateLocation({ sweep_angle_deg: c.deg })}
                        className={`py-1 rounded text-[10px] font-mono border cursor-pointer ${
                          location.sweep_angle_deg === c.deg
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-700 dark:text-cyan-300 font-bold'
                            : 'bg-white dark:bg-[#0d1422] border-slate-200 dark:border-[#24324a] text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reverse & Serpentine Toggles */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] cursor-pointer">
                    <span className="font-medium text-slate-700 dark:text-slate-200 text-[11px]">
                      Reverse
                    </span>
                    <input
                      type="checkbox"
                      checked={location.reverse_sweep}
                      onChange={(e) => onUpdateLocation({ reverse_sweep: e.target.checked })}
                      className="accent-cyan-500 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] cursor-pointer">
                    <span className="font-medium text-slate-700 dark:text-slate-200 text-[11px]">
                      Serpentine
                    </span>
                    <input
                      type="checkbox"
                      checked={location.serpentine_sweep}
                      onChange={(e) => onUpdateLocation({ serpentine_sweep: e.target.checked })}
                      className="accent-cyan-500 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Convert to Editable Sequence */}
                <button
                  type="button"
                  onClick={() => handleConvertSweepsToSequence(true)}
                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Convert Sweeps → Editable Sequence</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {/* Quick Launch Drawing Actions */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangeToolMode('draw')}
                    className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-800 dark:bg-cyan-500/15 dark:hover:bg-cyan-500/25 dark:border-cyan-500/40 dark:text-cyan-300 text-[10px] font-semibold cursor-pointer"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>Draw Path</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeToolMode('waypoint')}
                    className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 dark:border-indigo-500/40 dark:text-indigo-300 text-[10px] font-semibold cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Waypoints</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConvertSweepsToSequence(false)}
                    className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-[#131b2c] dark:hover:bg-[#1b2740] dark:border-[#25334c] dark:text-slate-200 text-[10px] font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Sweeps</span>
                  </button>
                </div>

                {/* Ordered Travel Sequence List */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Exact Travel Sequence (#1 → #{location.pathways.length})
                  </span>
                  {location.pathways.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPathway(null);
                        onUpdateLocation({ pathways: [] });
                      }}
                      className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {location.pathways.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#26354e] text-center text-[11px] text-slate-500 dark:text-slate-400">
                    No custom pathways yet. Use <b>Draw Path</b> to sketch freehand like a human driver,{' '}
                    <b>Waypoints</b> for exact points, or <b>+ Sweeps</b>.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-0.5">
                    {location.pathways.map((pw, idx) => {
                      const color = pw.color || PATHWAY_COLORS[idx % PATHWAY_COLORS.length];
                      const isSelected = pw.id === selectedPathwayId;
                      const isActive = activeCarPathIndex === idx && pw.enabled;
                      const lenM = polylineLengthMeters(pw.points);
                      const kindTag =
                        pw.kind === 'freehand' ? 'DRAW' : pw.kind === 'waypoint' ? 'WPT' : 'SWEEP';

                      return (
                        <div
                          key={pw.id}
                          draggable
                          onDragStart={() => setDragIndex(idx)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverIndex(idx);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragIndex !== null) movePathway(dragIndex, idx);
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          onClick={() => onSelectPathway(pw.id)}
                          className={`p-2 rounded-xl border transition-all flex flex-col gap-1.5 cursor-pointer ${
                            dragOverIndex === idx
                              ? 'border-cyan-400 bg-cyan-500/10'
                              : isSelected
                                ? 'bg-cyan-50/70 border-cyan-400 dark:bg-[#152238] dark:border-cyan-500/70'
                                : 'bg-slate-50 border-slate-200 dark:bg-[#121a2b] dark:border-[#1f2c42] hover:border-slate-300 dark:hover:border-[#2e405e]'
                          } ${!pw.enabled ? 'opacity-60' : ''}`}
                        >
                          {/* Row 1: Drag, Sequence #, Editable Name, Kind, Length */}
                          <div className="flex items-center gap-1.5">
                            <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0 cursor-grab" />
                            <span
                              className="w-5 h-5 rounded-full text-[10px] font-mono font-extrabold flex items-center justify-center shrink-0 text-slate-950"
                              style={{ backgroundColor: color }}
                            >
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={pw.name}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const next = location.pathways.map((item) =>
                                  item.id === pw.id ? { ...item, name: e.target.value } : item
                                );
                                onUpdateLocation({ pathways: next });
                              }}
                              className="flex-1 min-w-0 bg-transparent font-semibold text-[11px] text-slate-800 dark:text-slate-100 outline-none border-b border-transparent focus:border-cyan-500 truncate"
                            />
                            {isActive && (
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                            )}
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-200/80 dark:bg-[#0d1422] text-slate-600 dark:text-slate-300 shrink-0">
                              {kindTag}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                              {formatMeters(lenM)}
                            </span>
                          </div>

                          {/* Row 2: Reorder, Flip Direction, Speed, Enable, Focus, Duplicate, Delete */}
                          <div
                            className="flex items-center justify-between gap-1 pt-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                title="Move earlier in sequence"
                                disabled={idx === 0}
                                onClick={() => movePathway(idx, idx - 1)}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-[#1e2c45] disabled:opacity-30 cursor-pointer text-slate-600 dark:text-slate-300"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                title="Move later in sequence"
                                disabled={idx === location.pathways.length - 1}
                                onClick={() => movePathway(idx, idx + 1)}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-[#1e2c45] disabled:opacity-30 cursor-pointer text-slate-600 dark:text-slate-300"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>

                              {/* Flip Exact Travel Direction */}
                              <button
                                type="button"
                                title="Flip travel direction along this pathway"
                                onClick={() => {
                                  const next = location.pathways.map((item) =>
                                    item.id === pw.id ? { ...item, reversed: !item.reversed } : item
                                  );
                                  onUpdateLocation({ pathways: next });
                                }}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border cursor-pointer ${
                                  pw.reversed
                                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-700 dark:text-amber-300'
                                    : 'bg-white dark:bg-[#0d1422] border-slate-200 dark:border-[#24324a] text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                <ArrowLeftRight className="w-2.5 h-2.5" />
                                <span>{pw.reversed ? 'REV' : 'FWD'}</span>
                              </button>

                              {/* Per-path speed override */}
                              <input
                                type="number"
                                min="3"
                                max="80"
                                placeholder="Auto"
                                title="Optional speed override (km/h)"
                                value={pw.speed_kmh ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                  const next = location.pathways.map((item) =>
                                    item.id === pw.id
                                      ? { ...item, speed_kmh: val !== null && Number.isFinite(val) ? val : null }
                                      : item
                                  );
                                  onUpdateLocation({ pathways: next });
                                }}
                                className="w-12 bg-white dark:bg-[#0d1422] border border-slate-200 dark:border-[#24324a] rounded px-1 py-0.5 text-[10px] font-mono text-center text-slate-700 dark:text-cyan-300 outline-none focus:border-cyan-500"
                              />
                            </div>

                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                title={pw.enabled ? 'Disable in sequence' : 'Enable in sequence'}
                                onClick={() => {
                                  const next = location.pathways.map((item) =>
                                    item.id === pw.id ? { ...item, enabled: !item.enabled } : item
                                  );
                                  onUpdateLocation({ pathways: next });
                                }}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-[#1e2c45] cursor-pointer text-slate-600 dark:text-slate-300"
                              >
                                {pw.enabled ? (
                                  <Eye className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <EyeOff className="w-3 h-3 text-slate-400" />
                                )}
                              </button>
                              <button
                                type="button"
                                title="Focus pathway on map"
                                onClick={() => {
                                  if (pw.points.length > 0) onFlyTo(pw.points[0]);
                                }}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-[#1e2c45] cursor-pointer text-slate-500 dark:text-slate-400"
                              >
                                <Crosshair className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                title="Duplicate pathway"
                                onClick={() => {
                                  const copy: Pathway = {
                                    ...pw,
                                    id: `path-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
                                    name: `${pw.name} (Copy)`,
                                    points: pw.points.map((p) => ({ ...p })),
                                  };
                                  const next = [...location.pathways];
                                  next.splice(idx + 1, 0, copy);
                                  onUpdateLocation({ pathways: next });
                                }}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-[#1e2c45] cursor-pointer text-slate-500 dark:text-slate-400"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                title="Delete pathway"
                                onClick={() => {
                                  const next = location.pathways.filter((item) => item.id !== pw.id);
                                  if (selectedPathwayId === pw.id) onSelectPathway(null);
                                  onUpdateLocation({ pathways: next });
                                }}
                                className="p-1 rounded hover:bg-rose-500/20 cursor-pointer text-rose-500"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Sequence Transition & Loop Controls */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] cursor-pointer">
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                      Connect Paths Smoothly
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Drive transit connectors between paths
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={location.connect_pathways}
                    onChange={(e) => onUpdateLocation({ connect_pathways: e.target.checked })}
                    className="accent-cyan-500 cursor-pointer"
                  />
                </label>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Sequence Repeat Mode
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'loop', label: 'Loop' },
                        { id: 'ping_pong', label: 'Ping-Pong' },
                        { id: 'once', label: 'Once' },
                      ] as Array<{ id: LoopMode; label: string }>
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onUpdateLocation({ loop_mode: m.id })}
                        className={`py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                          location.loop_mode === m.id
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-700 dark:text-cyan-300'
                            : 'bg-slate-50 dark:bg-[#121a2b] border-slate-200 dark:border-[#1f2c42] text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ================= TAB 3: DRIVE (HUMAN VIBE) ================= */}
        {activeTab === 'drive' && (
          <div className="flex flex-col gap-3">
            {/* Global Vehicle Speed */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-700 dark:text-slate-200">Base Vehicle Speed</span>
                <span className="font-mono font-bold text-cyan-600 dark:text-cyan-300">
                  {location.vehicle_speed_kmh.toFixed(1)} km/h
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="60"
                step="1"
                value={location.vehicle_speed_kmh}
                onChange={(e) => onUpdateLocation({ vehicle_speed_kmh: parseFloat(e.target.value) })}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>5 km/h</span>
                <span>30 km/h</span>
                <span>60 km/h</span>
              </div>
            </div>

            {/* Human-Drive Physics Master Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border border-cyan-500/30 cursor-pointer">
              <div>
                <div className="font-semibold text-slate-800 dark:text-cyan-200 flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                  Human-Drive Physics
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  Lookahead steering, corner braking & natural weave
                </div>
              </div>
              <input
                type="checkbox"
                checked={location.human_drive.enabled}
                onChange={(e) =>
                  onUpdateLocation({
                    human_drive: { ...location.human_drive, enabled: e.target.checked },
                  })
                }
                className="accent-cyan-500 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* Smooth Curves */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] cursor-pointer">
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                  Smooth Corner Curves
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  Round sharp corners & smooth hand-drawn strokes
                </div>
              </div>
              <input
                type="checkbox"
                checked={location.human_drive.smooth_curves}
                onChange={(e) =>
                  onUpdateLocation({
                    human_drive: { ...location.human_drive, smooth_curves: e.target.checked },
                  })
                }
                className="accent-cyan-500 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* Corner Smoothness */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="font-medium text-slate-700 dark:text-slate-200">Corner Smoothness</span>
                <span className="font-mono font-bold text-cyan-600 dark:text-cyan-300">
                  {Math.round(location.human_drive.corner_smoothness * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={Math.round(location.human_drive.corner_smoothness * 100)}
                onChange={(e) =>
                  onUpdateLocation({
                    human_drive: {
                      ...location.human_drive,
                      corner_smoothness: parseInt(e.target.value, 10) / 100,
                    },
                  })
                }
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Natural Steering Weave */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="font-medium text-slate-700 dark:text-slate-200">Natural Steering Weave</span>
                <span className="font-mono font-bold text-cyan-600 dark:text-cyan-300">
                  ±{location.human_drive.lateral_weave_m.toFixed(2)} m
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={location.human_drive.lateral_weave_m}
                onChange={(e) =>
                  onUpdateLocation({
                    human_drive: {
                      ...location.human_drive,
                      lateral_weave_m: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Throttle Variance */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="font-medium text-slate-700 dark:text-slate-200">Throttle Variance</span>
                <span className="font-mono font-bold text-cyan-600 dark:text-cyan-300">
                  ±{location.human_drive.speed_variance_pct.toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                step="1"
                value={location.human_drive.speed_variance_pct}
                onChange={(e) =>
                  onUpdateLocation({
                    human_drive: {
                      ...location.human_drive,
                      speed_variance_pct: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Live Breadcrumb Trail */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#121a2b] border border-slate-200 dark:border-[#1f2c42] flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTrail}
                  onChange={onToggleShowTrail}
                  className="accent-pink-500 cursor-pointer"
                />
                <span className="font-medium text-slate-700 dark:text-slate-200 text-xs">
                  Show Live Breadcrumb Trail
                </span>
              </label>
              <button
                type="button"
                onClick={onClearTrail}
                className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-[#1b2740] dark:hover:bg-[#243455] text-[10px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
