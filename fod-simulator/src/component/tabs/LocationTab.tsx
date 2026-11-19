import { useEffect, useMemo, useRef, useState } from 'react';
import { useSimulatorStore, type GeoPoint } from '../../store';
import { haversineMeters, polygonCentroid, sampleCompiledSegments } from '../../utils/mapGeometry';
import MapCanvas from '../location/MapCanvas';
import OverlayInspector from '../location/OverlayInspector';
import OverlayPlaybackBar from '../location/OverlayPlaybackBar';
import OverlayToolbar from '../location/OverlayToolbar';
import type {
  DraftStatus,
  InspectorTab,
  MapCanvasHandle,
  MapLayerStyle,
  ToolMode,
  VehicleDisplayState,
} from '../location/types';

export default function LocationTab() {
  const {
    location,
    compiledRoute,
    localTiles,
    telemetry,
    theme,
    updateLocation,
    refreshCompiledRoute,
    resetVehiclePosition,
    setVehicleProgress,
  } = useSimulatorStore();

  const mapHandleRef = useRef<MapCanvasHandle | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [layerStyle, setLayerStyle] = useState<MapLayerStyle>('hybrid');
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('boundary');
  const [selectedPathwayId, setSelectedPathwayId] = useState<string | null>(null);
  const [followCar, setFollowCar] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showTrail, setShowTrail] = useState<boolean>(true);
  const [trailPoints, setTrailPoints] = useState<GeoPoint[]>([]);
  const [cursorPt, setCursorPt] = useState<GeoPoint | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>({
    kind: null,
    pointCount: 0,
    lengthM: 0,
    lastBearingDeg: null,
    lastSegmentM: null,
  });

  // Dry-Run Preview Drive local state (when gRPC sim isn't running)
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [previewDistM, setPreviewDistM] = useState<number>(0);
  const [previewForward, setPreviewForward] = useState<boolean>(true);
  const [previewLaps, setPreviewLaps] = useState<number>(0);
  const previewDistRef = useRef(0);
  const previewForwardRef = useRef(true);

  useEffect(() => {
    if (!compiledRoute) {
      refreshCompiledRoute().catch(() => {});
    }
  }, [compiledRoute, refreshCompiledRoute]);

  // Stop local preview if live gRPC sim starts
  useEffect(() => {
    if (telemetry.running && isPreviewing) {
      setIsPreviewing(false);
    }
  }, [telemetry.running, isPreviewing]);

  // Keep preview distance clamped if route changes
  useEffect(() => {
    const maxLen = compiledRoute?.total_length_m ?? 0;
    if (previewDistRef.current > maxLen) {
      previewDistRef.current = maxLen;
      setPreviewDistM(maxLen);
    }
  }, [compiledRoute?.total_length_m]);

  // Smooth requestAnimationFrame Dry-Run Preview loop
  useEffect(() => {
    if (!isPreviewing || telemetry.running) return;
    const totalLen = compiledRoute?.total_length_m ?? 0;
    if (totalLen <= 0.5) return;

    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      const curSample = sampleCompiledSegments(
        compiledRoute?.segments ?? [],
        previewDistRef.current,
        previewForwardRef.current
      );
      const activePw =
        curSample.pathIndex !== null ? location.pathways[curSample.pathIndex] : undefined;
      const baseSpeedKmh =
        location.path_mode === 'custom_sequence' && activePw?.speed_kmh
          ? activePw.speed_kmh
          : location.vehicle_speed_kmh;
      const speedMs = Math.max(1, (baseSpeedKmh * 1000) / 3600);
      const delta = speedMs * dt;

      let nextD = previewDistRef.current;
      let fwd = previewForwardRef.current;
      let hitOnceEnd = false;

      if (location.loop_mode === 'loop') {
        nextD += delta;
        if (nextD >= totalLen) {
          setPreviewLaps((l) => l + Math.floor(nextD / totalLen));
          nextD = nextD % totalLen;
        }
        fwd = true;
      } else if (location.loop_mode === 'ping_pong') {
        if (fwd) {
          nextD += delta;
          if (nextD >= totalLen) {
            nextD = Math.max(0, totalLen - (nextD - totalLen));
            fwd = false;
          }
        } else {
          nextD -= delta;
          if (nextD <= 0) {
            nextD = Math.min(totalLen, -nextD);
            fwd = true;
            setPreviewLaps((l) => l + 1);
          }
        }
      } else {
        nextD += delta;
        if (nextD >= totalLen) {
          nextD = totalLen;
          hitOnceEnd = true;
        }
        fwd = true;
      }

      previewDistRef.current = nextD;
      previewForwardRef.current = fwd;
      setPreviewDistM(nextD);
      setPreviewForward(fwd);

      if (hitOnceEnd) {
        setIsPreviewing(false);
        return;
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [
    isPreviewing,
    telemetry.running,
    compiledRoute,
    location.vehicle_speed_kmh,
    location.loop_mode,
    location.path_mode,
    location.pathways,
  ]);

  // Unified VehicleDisplayState from live telemetry OR local dry-run/scrubbed state
  const vehicle: VehicleDisplayState = useMemo(() => {
    const totalLen = compiledRoute?.total_length_m ?? telemetry.total_route_length_m ?? 0;

    if (telemetry.running) {
      return {
        lat: telemetry.current_lat,
        lon: telemetry.current_lon,
        heading: telemetry.current_heading,
        speedKmh: telemetry.current_speed_kmh,
        activePathIndex: telemetry.active_path_index,
        activePathName: telemetry.active_path_name,
        progressPct: telemetry.route_progress_pct,
        distanceM: telemetry.route_distance_m,
        totalLengthM: totalLen,
        lapCount: telemetry.lap_count,
        isPreview: false,
      };
    }

    if (compiledRoute && compiledRoute.segments.length > 0 && (isPreviewing || previewDistM > 0)) {
      const sampled = sampleCompiledSegments(compiledRoute.segments, previewDistM, previewForward);
      const pct = totalLen > 0 ? Math.min(100, Math.max(0, (previewDistM / totalLen) * 100)) : 0;
      const activePw =
        sampled.pathIndex !== null ? location.pathways[sampled.pathIndex] : undefined;
      const spd =
        location.path_mode === 'custom_sequence' && activePw?.speed_kmh
          ? activePw.speed_kmh
          : location.vehicle_speed_kmh;
      return {
        lat: sampled.lat,
        lon: sampled.lon,
        heading: sampled.heading,
        speedKmh: spd,
        activePathIndex: sampled.pathIndex,
        activePathName: sampled.pathName,
        progressPct: pct,
        distanceM: previewDistM,
        totalLengthM: totalLen,
        lapCount: previewLaps,
        isPreview: true,
      };
    }

    const fallbackCenter = polygonCentroid(location.boundary_points);
    return {
      lat: telemetry.current_lat || fallbackCenter.lat,
      lon: telemetry.current_lon || fallbackCenter.lon,
      heading: telemetry.current_heading || 0,
      speedKmh: telemetry.current_speed_kmh || location.vehicle_speed_kmh,
      activePathIndex: telemetry.active_path_index,
      activePathName: telemetry.active_path_name,
      progressPct: telemetry.route_progress_pct || 0,
      distanceM: telemetry.route_distance_m || 0,
      totalLengthM: totalLen,
      lapCount: telemetry.lap_count || 0,
      isPreview: false,
    };
  }, [
    compiledRoute,
    telemetry,
    isPreviewing,
    previewDistM,
    previewForward,
    previewLaps,
    location.boundary_points,
    location.vehicle_speed_kmh,
    location.path_mode,
    location.pathways,
  ]);

  // Accumulate rolling live breadcrumb trail (up to 180 points)
  useEffect(() => {
    if (!showTrail) return;
    if (!telemetry.running && !isPreviewing) return;

    const pt: GeoPoint = { lat: vehicle.lat, lon: vehicle.lon };
    setTrailPoints((prev) => {
      const last = prev[prev.length - 1];
      if (last && haversineMeters(last, pt) < 2.0) return prev;
      const next = [...prev, pt];
      return next.length > 180 ? next.slice(next.length - 180) : next;
    });
  }, [showTrail, telemetry.running, isPreviewing, vehicle.lat, vehicle.lon]);

  const handleResetVehicle = () => {
    setIsPreviewing(false);
    previewDistRef.current = 0;
    previewForwardRef.current = true;
    setPreviewDistM(0);
    setPreviewForward(true);
    setPreviewLaps(0);
    setTrailPoints([]);
    resetVehiclePosition();
  };

  const handleScrubProgress = (pct: number) => {
    const totalLen = compiledRoute?.total_length_m ?? 0;
    const targetDist = (pct / 100) * totalLen;
    if (!telemetry.running) {
      previewDistRef.current = targetDist;
      previewForwardRef.current = true;
      setPreviewDistM(targetDist);
      setPreviewForward(true);
    }
    setVehicleProgress(pct);
  };

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[#080c14] overflow-hidden'
          : 'relative w-full h-full overflow-hidden'
      }
    >
      {/* Single Full-Bleed Real Interactive Map */}
      <MapCanvas
        ref={mapHandleRef}
        location={location}
        compiledRoute={compiledRoute}
        localTiles={localTiles}
        theme={theme}
        toolMode={toolMode}
        layerStyle={layerStyle}
        selectedPathwayId={selectedPathwayId}
        followCar={followCar}
        showTrail={showTrail}
        trailPoints={trailPoints}
        vehicle={vehicle}
        onUpdateLocation={updateLocation}
        onSelectPathway={(id) => {
          setSelectedPathwayId(id);
          if (id) setInspectorTab('pathways');
        }}
        onCursorMove={setCursorPt}
        onDraftStatusChange={setDraftStatus}
        onToolModeChange={setToolMode}
      />

      {/* Top Tool Studio Bar + Map Layer / Jump / Fullscreen Controls */}
      <OverlayToolbar
        toolMode={toolMode}
        layerStyle={layerStyle}
        localTiles={localTiles}
        followCar={followCar}
        isFullscreen={isFullscreen}
        draftStatus={draftStatus}
        boundaryCount={location.boundary_points.length}
        onChangeToolMode={(mode) => {
          setToolMode(mode);
          if (mode === 'boundary') setInspectorTab('boundary');
          if (mode === 'draw' || mode === 'waypoint') setInspectorTab('pathways');
        }}
        onChangeLayerStyle={setLayerStyle}
        onToggleFollowCar={() => setFollowCar((f) => !f)}
        onToggleFullscreen={() => setIsFullscreen((v) => !v)}
        onFitAll={() => mapHandleRef.current?.fitAll()}
        onFlyTo={(pt, zoom) => mapHandleRef.current?.flyToPoint(pt, zoom)}
        onFinishDraft={() => mapHandleRef.current?.finishDraft()}
        onUndoDraft={() => mapHandleRef.current?.undoDraft()}
        onCancelDraft={() => mapHandleRef.current?.cancelDraft()}
      />

      {/* Left Collapsible Inspector Drawer (Boundary / Pathways Sequence / Human Drive) */}
      <OverlayInspector
        open={inspectorOpen}
        activeTab={inspectorTab}
        location={location}
        compiledRoute={compiledRoute}
        selectedPathwayId={selectedPathwayId}
        activeCarPathIndex={vehicle.activePathIndex}
        showTrail={showTrail}
        onToggleOpen={() => setInspectorOpen((o) => !o)}
        onChangeTab={setInspectorTab}
        onChangeToolMode={setToolMode}
        onUpdateLocation={updateLocation}
        onSelectPathway={setSelectedPathwayId}
        onFlyTo={(pt, zoom) => mapHandleRef.current?.flyToPoint(pt, zoom)}
        onFitBoundary={() => mapHandleRef.current?.fitBoundary()}
        onToggleShowTrail={() => setShowTrail((s) => !s)}
        onClearTrail={() => setTrailPoints([])}
      />

      {/* Bottom Telemetry, Scrub & Dry-Run Preview Playback Bar */}
      <OverlayPlaybackBar
        vehicle={vehicle}
        compiledRoute={compiledRoute}
        simRunning={telemetry.running}
        isPreviewing={isPreviewing}
        cursorPt={cursorPt}
        onTogglePreview={() => {
          const totalLen = compiledRoute?.total_length_m ?? 0;
          if (!isPreviewing && totalLen > 0 && previewDistRef.current >= totalLen - 0.5) {
            previewDistRef.current = 0;
            previewForwardRef.current = true;
            setPreviewDistM(0);
            setPreviewForward(true);
          }
          setIsPreviewing((p) => !p);
        }}
        onResetVehicle={handleResetVehicle}
        onScrubProgress={handleScrubProgress}
      />
    </div>
  );
}
