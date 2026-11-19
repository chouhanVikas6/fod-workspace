import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CompiledRoutePreview, GeoPoint, LocalTilesInfo, LocationConfig, Pathway } from '../../store';
import {
  bearingDeg,
  computeArrowMarkers,
  haversineMeters,
  PATHWAY_COLORS,
  polygonCentroid,
  polylineLengthMeters,
  simplifyFreehandPath,
} from '../../utils/mapGeometry';
import type { DraftStatus, MapCanvasHandle, MapLayerStyle, ToolMode, VehicleDisplayState } from './types';

interface MapCanvasProps {
  location: LocationConfig;
  compiledRoute: CompiledRoutePreview | null;
  localTiles: LocalTilesInfo;
  theme: 'dark' | 'light';
  toolMode: ToolMode;
  layerStyle: MapLayerStyle;
  selectedPathwayId: string | null;
  followCar: boolean;
  showTrail: boolean;
  trailPoints: GeoPoint[];
  vehicle: VehicleDisplayState;
  onUpdateLocation: (patch: Partial<LocationConfig>) => Promise<void>;
  onSelectPathway: (id: string | null) => void;
  onCursorMove: (pt: GeoPoint | null) => void;
  onDraftStatusChange: (status: DraftStatus) => void;
  onToolModeChange: (mode: ToolMode) => void;
}

function makeBoundaryVertexIcon(index: number, isHighlighted = false): L.DivIcon {
  const size = isHighlighted ? 26 : 22;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#0891b2;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.55);color:#ffffff;font-size:10px;font-weight:700;font-family:monospace;display:flex;align-items:center;justify-content:center;cursor:grab;user-select:none;">P${index + 1}</div>`,
  });
}

function makeMidpointHandleIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<div title="Drag or click to insert point" style="width:16px;height:16px;border-radius:9999px;background:rgba(15,23,42,0.85);border:1.5px solid #22d3ee;color:#67e8f9;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.45);">+</div>`,
  });
}

function makeCentroidHandleIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div title="Drag to move entire boundary" style="width:24px;height:24px;border-radius:9999px;background:rgba(14,116,144,0.9);border:1.5px solid #cffafe;color:#ffffff;font-size:12px;display:flex;align-items:center;justify-content:center;cursor:move;box-shadow:0 2px 8px rgba(0,0,0,0.5);">✥</div>`,
  });
}

function makeWaypointHandleIcon(index: number, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div style="width:18px;height:18px;border-radius:9999px;background:${color};border:2px solid #0f172a;box-shadow:0 0 0 1.5px #ffffff, 0 2px 5px rgba(0,0,0,0.5);color:#0f172a;font-size:9px;font-weight:800;font-family:monospace;display:flex;align-items:center;justify-content:center;cursor:grab;">${index + 1}</div>`,
  });
}

function makeArrowIcon(bearing: number, color: string, isTransit: boolean): L.DivIcon {
  const opacity = isTransit ? 0.8 : 0.95;
  const size = isTransit ? 14 : 16;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;transform:rotate(${bearing.toFixed(1)}deg);opacity:${opacity};pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.85));">
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L20 19L12 15L4 19L12 2Z" fill="${color}" stroke="#0b1120" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>
    </div>`,
  });
}

function makeSequenceBadgeIcon(seqNumber: number, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="width:24px;height:24px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.65);color:#090d16;font-size:10px;font-weight:800;font-family:monospace;display:flex;align-items:center;justify-content:center;pointer-events:none;">#${seqNumber}</div>`,
  });
}

function makeEndMarkerIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    html: `<div style="width:12px;height:12px;border-radius:3px;background:#0f172a;border:2px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,0.7);pointer-events:none;"></div>`,
  });
}

function makeVehicleIcon(heading: number, isPreview: boolean): L.DivIcon {
  const accent = isPreview ? '#a78bfa' : '#22d3ee';
  const coneFill = isPreview ? 'rgba(167,139,250,0.22)' : 'rgba(34,211,238,0.24)';
  return L.divIcon({
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;transform:rotate(${heading.toFixed(1)}deg);pointer-events:none;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.75));">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <path d="M22 2L32 18L22 15L12 18L22 2Z" fill="${coneFill}"/>
        <rect x="15" y="13" width="14" height="22" rx="4" fill="#0f172a" stroke="${accent}" stroke-width="2"/>
        <rect x="17" y="16" width="10" height="6" rx="1.5" fill="${accent}" fill-opacity="0.85"/>
        <circle cx="17.5" cy="14" r="1.4" fill="#fef08a"/>
        <circle cx="26.5" cy="14" r="1.4" fill="#fef08a"/>
        <rect x="17" y="29" width="10" height="3" rx="1" fill="#ef4444" fill-opacity="0.8"/>
      </svg>
    </div>`,
  });
}

const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  {
    location,
    compiledRoute,
    localTiles,
    theme,
    toolMode,
    layerStyle,
    selectedPathwayId,
    followCar,
    showTrail,
    trailPoints,
    vehicle,
    onUpdateLocation,
    onSelectPathway,
    onCursorMove,
    onDraftStatusChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileGroupRef = useRef<L.LayerGroup | null>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const drawLayerRef = useRef<L.LayerGroup | null>(null);
  const trailPolylineRef = useRef<L.Polyline | null>(null);
  const vehicleMarkerRef = useRef<L.Marker | null>(null);
  const hasFittedInitialRef = useRef(false);

  const [zoomTick, setZoomTick] = useState(0);
  const [spacePressed, setSpacePressed] = useState(false);

  // Refs synced to latest props for Leaflet event handlers
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;
  const locationRef = useRef(location);
  locationRef.current = location;
  const selectedPathwayIdRef = useRef(selectedPathwayId);
  selectedPathwayIdRef.current = selectedPathwayId;
  const onUpdateLocationRef = useRef(onUpdateLocation);
  onUpdateLocationRef.current = onUpdateLocation;
  const onSelectPathwayRef = useRef(onSelectPathway);
  onSelectPathwayRef.current = onSelectPathway;
  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;
  const onDraftStatusChangeRef = useRef(onDraftStatusChange);
  onDraftStatusChangeRef.current = onDraftStatusChange;

  // Freehand & Waypoint active draft refs
  const isDrawingRef = useRef(false);
  const freehandPointsRef = useRef<GeoPoint[]>([]);
  const freehandPreviewLineRef = useRef<L.Polyline | null>(null);

  const waypointDraftRef = useRef<GeoPoint[]>([]);
  const waypointCursorRef = useRef<GeoPoint | null>(null);
  const isDraggingItemRef = useRef(false);

  const updateDraftHud = () => {
    if (isDrawingRef.current) {
      const pts = freehandPointsRef.current;
      onDraftStatusChangeRef.current({
        kind: 'draw',
        pointCount: pts.length,
        lengthM: polylineLengthMeters(pts),
        lastBearingDeg: pts.length >= 2 ? bearingDeg(pts[pts.length - 2], pts[pts.length - 1]) : null,
        lastSegmentM: pts.length >= 2 ? haversineMeters(pts[pts.length - 2], pts[pts.length - 1]) : null,
      });
    } else if (waypointDraftRef.current.length > 0) {
      const pts = waypointDraftRef.current;
      const cur = waypointCursorRef.current;
      const last = pts[pts.length - 1];
      onDraftStatusChangeRef.current({
        kind: 'waypoint',
        pointCount: pts.length,
        lengthM: polylineLengthMeters(pts),
        lastBearingDeg: cur ? bearingDeg(last, cur) : pts.length >= 2 ? bearingDeg(pts[pts.length - 2], last) : null,
        lastSegmentM: cur ? haversineMeters(last, cur) : null,
      });
    } else {
      onDraftStatusChangeRef.current({
        kind: null,
        pointCount: 0,
        lengthM: 0,
        lastBearingDeg: null,
        lastSegmentM: null,
      });
    }
  };

  const renderWaypointDraft = () => {
    const layer = drawLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const pts = waypointDraftRef.current;
    if (pts.length === 0) return;

    const latLngs = pts.map((p) => [p.lat, p.lon] as [number, number]);
    if (pts.length >= 2) {
      L.polyline(latLngs, {
        color: '#22d3ee',
        weight: 3.5,
        opacity: 0.95,
        interactive: false,
      }).addTo(layer);

      const arrows = computeArrowMarkers(pts, 45);
      for (const arr of arrows) {
        L.marker([arr.lat, arr.lon], {
          icon: makeArrowIcon(arr.bearing, '#67e8f9', false),
          interactive: false,
        }).addTo(layer);
      }
    }

    if (waypointCursorRef.current) {
      const last = pts[pts.length - 1];
      const cur = waypointCursorRef.current;
      L.polyline(
        [
          [last.lat, last.lon],
          [cur.lat, cur.lon],
        ],
        {
          color: '#67e8f9',
          weight: 2,
          dashArray: '6 6',
          opacity: 0.85,
          interactive: false,
        }
      ).addTo(layer);
    }

    pts.forEach((p, idx) => {
      L.marker([p.lat, p.lon], {
        icon: makeWaypointHandleIcon(idx, '#22d3ee'),
        interactive: false,
      }).addTo(layer);
    });
  };

  const commitWaypointDraft = () => {
    const pts = [...waypointDraftRef.current];
    waypointDraftRef.current = [];
    waypointCursorRef.current = null;
    drawLayerRef.current?.clearLayers();
    updateDraftHud();

    if (pts.length < 2) return;
    const loc = locationRef.current;
    const nextColor = PATHWAY_COLORS[loc.pathways.length % PATHWAY_COLORS.length];
    const newPath: Pathway = {
      id: `path-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name: `Waypoint Route #${loc.pathways.length + 1}`,
      kind: 'waypoint',
      points: pts,
      enabled: true,
      reversed: false,
      speed_kmh: null,
      color: nextColor,
    };
    onSelectPathwayRef.current(newPath.id);
    onUpdateLocationRef.current({
      path_mode: 'custom_sequence',
      pathways: [...loc.pathways, newPath],
    });
  };

  const cancelDraftInternal = () => {
    isDrawingRef.current = false;
    freehandPointsRef.current = [];
    freehandPreviewLineRef.current = null;
    waypointDraftRef.current = [];
    waypointCursorRef.current = null;
    drawLayerRef.current?.clearLayers();
    updateDraftHud();
  };

  const undoDraftInternal = () => {
    if (waypointDraftRef.current.length > 0) {
      waypointDraftRef.current = waypointDraftRef.current.slice(0, -1);
      renderWaypointDraft();
      updateDraftHud();
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      fitAll: () => {
        const m = mapRef.current;
        if (!m) return;
        const pts: [number, number][] = locationRef.current.boundary_points.map((p) => [p.lat, p.lon]);
        locationRef.current.pathways.forEach((pw) => {
          pw.points.forEach((p) => pts.push([p.lat, p.lon]));
        });
        if (pts.length >= 2) {
          m.fitBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 19 });
        }
      },
      fitBoundary: () => {
        const m = mapRef.current;
        if (!m) return;
        const pts: [number, number][] = locationRef.current.boundary_points.map((p) => [p.lat, p.lon]);
        if (pts.length >= 2) {
          m.fitBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 19 });
        }
      },
      flyToPoint: (pt: GeoPoint, zoom?: number) => {
        const m = mapRef.current;
        if (!m) return;
        m.flyTo([pt.lat, pt.lon], zoom ?? Math.max(m.getZoom(), 17), { duration: 0.5 });
      },
      finishDraft: () => {
        commitWaypointDraft();
      },
      undoDraft: () => {
        undoDraftInternal();
      },
      cancelDraft: () => {
        cancelDraftInternal();
      },
    }),
    []
  );

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter = polygonCentroid(locationRef.current.boundary_points);
    const map = L.map(containerRef.current, {
      center: [initialCenter.lat, initialCenter.lon],
      zoom: 16,
      minZoom: 2,
      maxZoom: 22,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    const tileGroup = L.layerGroup().addTo(map);
    const boundaryLayer = L.layerGroup().addTo(map);
    const routeLayer = L.layerGroup().addTo(map);
    const trailLine = L.polyline([], {
      color: '#f472b6',
      weight: 2.5,
      opacity: 0.75,
      dashArray: '4 4',
      interactive: false,
    }).addTo(map);
    const drawLayer = L.layerGroup().addTo(map);

    const carMarker = L.marker([initialCenter.lat, initialCenter.lon], {
      icon: makeVehicleIcon(0, false),
      zIndexOffset: 1200,
      interactive: false,
    }).addTo(map);

    mapRef.current = map;
    tileGroupRef.current = tileGroup;
    boundaryLayerRef.current = boundaryLayer;
    routeLayerRef.current = routeLayer;
    drawLayerRef.current = drawLayer;
    trailPolylineRef.current = trailLine;
    vehicleMarkerRef.current = carMarker;

    // Fit initial boundary once
    if (locationRef.current.boundary_points.length >= 2) {
      const b = L.latLngBounds(
        locationRef.current.boundary_points.map((p) => [p.lat, p.lon] as [number, number])
      );
      map.fitBounds(b, { padding: [80, 80], maxZoom: 18 });
      hasFittedInitialRef.current = true;
    }

    // ResizeObserver for clean resize across tab switches & fullscreen toggles
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(containerRef.current);

    const handleZoomEnd = () => {
      setZoomTick((t) => t + 1);
    };

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const mode = toolModeRef.current;
      const pt: GeoPoint = { lat: e.latlng.lat, lon: e.latlng.lng };

      if (mode === 'boundary') {
        const curPts = locationRef.current.boundary_points;
        onUpdateLocationRef.current({ boundary_points: [...curPts, pt] });
      } else if (mode === 'waypoint') {
        waypointDraftRef.current = [...waypointDraftRef.current, pt];
        renderWaypointDraft();
        updateDraftHud();
      }
    };

    const handleMapDblClick = () => {
      if (toolModeRef.current === 'waypoint' && waypointDraftRef.current.length >= 2) {
        commitWaypointDraft();
      }
    };

    const handleMouseDown = (e: L.LeafletMouseEvent) => {
      if (toolModeRef.current !== 'draw') return;
      if (e.originalEvent.button !== 0) return;
      // If spacebar is pressed, user is temporarily panning
      if (!map.dragging.enabled()) {
        isDrawingRef.current = true;
        const startPt: GeoPoint = { lat: e.latlng.lat, lon: e.latlng.lng };
        freehandPointsRef.current = [startPt];
        const drawLayerCur = drawLayerRef.current;
        if (drawLayerCur) {
          drawLayerCur.clearLayers();
          freehandPreviewLineRef.current = L.polyline([[startPt.lat, startPt.lon]], {
            color: '#22d3ee',
            weight: 4,
            opacity: 0.95,
            interactive: false,
          }).addTo(drawLayerCur);
        }
        updateDraftHud();
      }
    };

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      const pt: GeoPoint = { lat: e.latlng.lat, lon: e.latlng.lng };
      onCursorMoveRef.current(pt);

      if (isDrawingRef.current && toolModeRef.current === 'draw') {
        const pts = freehandPointsRef.current;
        const prev = pts[pts.length - 1];
        if (!prev || haversineMeters(prev, pt) >= 1.5) {
          pts.push(pt);
          freehandPreviewLineRef.current?.addLatLng([pt.lat, pt.lon]);
          updateDraftHud();
        }
      } else if (toolModeRef.current === 'waypoint' && waypointDraftRef.current.length > 0) {
        waypointCursorRef.current = pt;
        renderWaypointDraft();
        updateDraftHud();
      }
    };

    const handleMouseOut = () => {
      onCursorMoveRef.current(null);
    };

    const finishFreehandStroke = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const rawPts = [...freehandPointsRef.current];
      freehandPointsRef.current = [];
      freehandPreviewLineRef.current = null;
      drawLayerRef.current?.clearLayers();
      updateDraftHud();

      const simplified = simplifyFreehandPath(rawPts, 1.5, 0.45);
      if (simplified.length >= 2 && polylineLengthMeters(simplified) >= 2.0) {
        const loc = locationRef.current;
        const nextColor = PATHWAY_COLORS[loc.pathways.length % PATHWAY_COLORS.length];
        const newPath: Pathway = {
          id: `path-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          name: `Drawn Path #${loc.pathways.length + 1}`,
          kind: 'freehand',
          points: simplified,
          enabled: true,
          reversed: false,
          speed_kmh: null,
          color: nextColor,
        };
        onSelectPathwayRef.current(newPath.id);
        onUpdateLocationRef.current({
          path_mode: 'custom_sequence',
          pathways: [...loc.pathways, newPath],
        });
      }
    };

    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      if (ev.code === 'Space') {
        setSpacePressed(true);
      } else if (ev.key === 'Enter' && toolModeRef.current === 'waypoint') {
        commitWaypointDraft();
      } else if (ev.key === 'Escape') {
        cancelDraftInternal();
      } else if (ev.key === 'Backspace' && toolModeRef.current === 'waypoint' && waypointDraftRef.current.length > 0) {
        ev.preventDefault();
        undoDraftInternal();
      }
    };

    const handleKeyUp = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') {
        setSpacePressed(false);
      }
    };

    map.on('zoomend', handleZoomEnd);
    map.on('click', handleMapClick);
    map.on('dblclick', handleMapDblClick);
    map.on('mousedown', handleMouseDown);
    map.on('mousemove', handleMouseMove);
    map.on('mouseout', handleMouseOut);
    window.addEventListener('mouseup', finishFreehandStroke);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      ro.disconnect();
      map.off('zoomend', handleZoomEnd);
      map.off('click', handleMapClick);
      map.off('dblclick', handleMapDblClick);
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseout', handleMouseOut);
      window.removeEventListener('mouseup', finishFreehandStroke);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Cancel active draft when switching away from its tool mode
  useEffect(() => {
    if (toolMode !== 'draw' && isDrawingRef.current) {
      cancelDraftInternal();
    }
    if (toolMode !== 'waypoint' && waypointDraftRef.current.length > 0) {
      cancelDraftInternal();
    }
  }, [toolMode]);

  // Configure map drag/zoom interaction per tool mode & spacebar pan
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (toolMode === 'draw') {
      if (spacePressed) {
        map.dragging.enable();
      } else {
        map.dragging.disable();
      }
      map.doubleClickZoom.disable();
    } else if (toolMode === 'waypoint') {
      map.dragging.enable();
      map.doubleClickZoom.disable();
    } else {
      map.dragging.enable();
      map.doubleClickZoom.enable();
    }
  }, [toolMode, spacePressed]);

  // Switch tile layers cleanly
  useEffect(() => {
    const group = tileGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (layerStyle === 'satellite' || layerStyle === 'hybrid') {
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxNativeZoom: 19,
          maxZoom: 22,
        }
      ).addTo(group);

      if (layerStyle === 'hybrid') {
        L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          {
            maxNativeZoom: 19,
            maxZoom: 22,
            opacity: 0.9,
          }
        ).addTo(group);
      }
    } else if (layerStyle === 'offline') {
      L.tileLayer(`${localTiles.base_url}/{z}/{x}/{y}.jpg`, {
        minZoom: localTiles.min_zoom,
        maxNativeZoom: localTiles.max_zoom,
        maxZoom: 22,
      }).addTo(group);
    } else if (layerStyle === 'street') {
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxNativeZoom: 19,
        maxZoom: 22,
      }).addTo(group);
    } else {
      const styleSlug = theme === 'dark' ? 'dark_all' : 'light_all';
      L.tileLayer(`https://{s}.basemaps.cartocdn.com/${styleSlug}/{z}/{x}/{y}{r}.png`, {
        maxNativeZoom: 19,
        maxZoom: 22,
      }).addTo(group);
    }
  }, [layerStyle, theme, localTiles.base_url, localTiles.min_zoom, localTiles.max_zoom]);

  // Render N-point Boundary Polygon + Draggable Vertices + Midpoints + Whole-Polygon Drag Handle
  useEffect(() => {
    const layer = boundaryLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const pts = location.boundary_points;
    if (pts.length === 0) return;

    let polygonOverlay: L.Polygon | L.Polyline | null = null;
    const latLngs = pts.map((p) => [p.lat, p.lon] as [number, number]);

    if (pts.length >= 3) {
      polygonOverlay = L.polygon(latLngs, {
        color: location.enforce_boundary ? '#06b6d4' : '#94a3b8',
        weight: 2.5,
        dashArray: location.enforce_boundary ? undefined : '6 6',
        fillColor: location.enforce_boundary ? '#06b6d4' : '#64748b',
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(layer);
    } else if (pts.length === 2) {
      polygonOverlay = L.polyline(latLngs, {
        color: '#06b6d4',
        weight: 2.5,
        dashArray: '5 5',
        interactive: false,
      }).addTo(layer);
    }

    const showHandles = toolMode === 'boundary' || toolMode === 'select';
    if (!showHandles) return;

    const workingPts = pts.map((p) => ({ ...p }));
    const vertexMarkers: L.Marker[] = [];
    const midpointMarkers: L.Marker[] = [];
    let centroidMarker: L.Marker | null = null;

    const syncLiveBoundaryGraphics = () => {
      const updatedLL = workingPts.map((p) => [p.lat, p.lon] as [number, number]);
      if (polygonOverlay) {
        polygonOverlay.setLatLngs(updatedLL);
      }
      midpointMarkers.forEach((mm, idx) => {
        const a = workingPts[idx];
        const b = workingPts[(idx + 1) % workingPts.length];
        if (a && b) {
          mm.setLatLng([(a.lat + b.lat) / 2, (a.lon + b.lon) / 2]);
        }
      });
      if (centroidMarker && workingPts.length >= 3) {
        const c = polygonCentroid(workingPts);
        centroidMarker.setLatLng([c.lat, c.lon]);
      }
    };

    // Vertex markers (draggable)
    workingPts.forEach((pt, idx) => {
      const marker = L.marker([pt.lat, pt.lon], {
        icon: makeBoundaryVertexIcon(idx, toolMode === 'boundary'),
        draggable: true,
        zIndexOffset: 700,
      }).addTo(layer);

      marker.on('dragstart', () => {
        isDraggingItemRef.current = true;
      });
      marker.on('drag', () => {
        const ll = marker.getLatLng();
        workingPts[idx] = { lat: ll.lat, lon: ll.lng };
        syncLiveBoundaryGraphics();
      });
      marker.on('dragend', () => {
        isDraggingItemRef.current = false;
        const ll = marker.getLatLng();
        const next = workingPts.map((p, i) => (i === idx ? { lat: ll.lat, lon: ll.lng } : p));
        onUpdateLocationRef.current({ boundary_points: next });
      });
      marker.on('contextmenu', (ev) => {
        L.DomEvent.stopPropagation(ev);
        if (workingPts.length > 3) {
          const next = workingPts.filter((_, i) => i !== idx);
          onUpdateLocationRef.current({ boundary_points: next });
        }
      });

      vertexMarkers.push(marker);
    });

    // Midpoint "+" handles in boundary mode (click or drag to split edge)
    if (toolMode === 'boundary' && workingPts.length >= 2) {
      const edgeCount = workingPts.length >= 3 ? workingPts.length : 1;
      for (let i = 0; i < edgeCount; i++) {
        const a = workingPts[i];
        const b = workingPts[(i + 1) % workingPts.length];
        const midLat = (a.lat + b.lat) / 2;
        const midLon = (a.lon + b.lon) / 2;

        const midMarker = L.marker([midLat, midLon], {
          icon: makeMidpointHandleIcon(),
          draggable: true,
          zIndexOffset: 650,
        }).addTo(layer);

        let wasDragged = false;
        midMarker.on('dragstart', () => {
          wasDragged = true;
          isDraggingItemRef.current = true;
        });
        midMarker.on('drag', () => {
          const ll = midMarker.getLatLng();
          if (polygonOverlay) {
            const temp = [...workingPts];
            temp.splice(i + 1, 0, { lat: ll.lat, lon: ll.lng });
            polygonOverlay.setLatLngs(temp.map((p) => [p.lat, p.lon] as [number, number]));
          }
        });
        midMarker.on('dragend', () => {
          isDraggingItemRef.current = false;
          const ll = midMarker.getLatLng();
          const next = [...workingPts];
          next.splice(i + 1, 0, { lat: ll.lat, lon: ll.lng });
          onUpdateLocationRef.current({ boundary_points: next });
        });
        midMarker.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (wasDragged) return;
          const next = [...workingPts];
          next.splice(i + 1, 0, { lat: midLat, lon: midLon });
          onUpdateLocationRef.current({ boundary_points: next });
        });

        midpointMarkers.push(midMarker);
      }
    }

    // Whole-polygon drag handle at centroid
    if (workingPts.length >= 3) {
      const center = polygonCentroid(workingPts);
      centroidMarker = L.marker([center.lat, center.lon], {
        icon: makeCentroidHandleIcon(),
        draggable: true,
        zIndexOffset: 640,
      }).addTo(layer);

      let startCenter = center;
      let startSnapshot = workingPts.map((p) => ({ ...p }));

      centroidMarker.on('dragstart', () => {
        isDraggingItemRef.current = true;
        const ll = centroidMarker!.getLatLng();
        startCenter = { lat: ll.lat, lon: ll.lng };
        startSnapshot = workingPts.map((p) => ({ ...p }));
      });
      centroidMarker.on('drag', () => {
        const ll = centroidMarker!.getLatLng();
        const dLat = ll.lat - startCenter.lat;
        const dLon = ll.lng - startCenter.lon;
        for (let i = 0; i < workingPts.length; i++) {
          workingPts[i] = {
            lat: startSnapshot[i].lat + dLat,
            lon: startSnapshot[i].lon + dLon,
          };
          vertexMarkers[i]?.setLatLng([workingPts[i].lat, workingPts[i].lon]);
        }
        if (polygonOverlay) {
          polygonOverlay.setLatLngs(workingPts.map((p) => [p.lat, p.lon] as [number, number]));
        }
        midpointMarkers.forEach((mm, idx) => {
          const a = workingPts[idx];
          const b = workingPts[(idx + 1) % workingPts.length];
          if (a && b) {
            mm.setLatLng([(a.lat + b.lat) / 2, (a.lon + b.lon) / 2]);
          }
        });
      });
      centroidMarker.on('dragend', () => {
        isDraggingItemRef.current = false;
        const ll = centroidMarker!.getLatLng();
        const dLat = ll.lat - startCenter.lat;
        const dLon = ll.lng - startCenter.lon;
        const moved = startSnapshot.map((p) => ({
          lat: p.lat + dLat,
          lon: p.lon + dLon,
        }));
        onUpdateLocationRef.current({ boundary_points: moved });
      });
    }
  }, [location.boundary_points, location.enforce_boundary, toolMode]);

  // Render Compiled Route Segments, Directional Arrows, Sequence Badges & Editable Waypoint Handles
  useEffect(() => {
    const layer = routeLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    const zoom = map.getZoom();
    // Scale arrow spacing naturally with zoom level (meters per pixel ~ 156543 * cos(lat) / 2^zoom)
    const arrowSpacingM = Math.max(12, Math.min(250, 900000 / Math.pow(2, zoom)));

    // Render disabled custom pathways faintly so user can see & re-enable them
    if (location.path_mode === 'custom_sequence') {
      location.pathways.forEach((pw) => {
        if (pw.enabled || pw.points.length < 2) return;
        const line = L.polyline(
          pw.points.map((p) => [p.lat, p.lon] as [number, number]),
          {
            color: '#64748b',
            weight: 2.5,
            dashArray: '4 7',
            opacity: 0.45,
          }
        ).addTo(layer);
        line.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          onSelectPathwayRef.current(pw.id);
        });
      });
    }

    const segments = compiledRoute?.segments ?? [];
    let nonTransitSeq = 0;

    segments.forEach((seg) => {
      if (seg.points.length < 2) return;
      const latLngs = seg.points.map((p) => [p.lat, p.lon] as [number, number]);
      const baseColor = seg.is_transit
        ? '#f59e0b'
        : seg.color || PATHWAY_COLORS[seg.pathway_index % PATHWAY_COLORS.length];

      const isSelected = !seg.is_transit && seg.pathway_id === selectedPathwayId;
      const isActiveCar =
        !seg.is_transit &&
        vehicle.activePathIndex !== null &&
        seg.pathway_index === vehicle.activePathIndex;

      if (isSelected || isActiveCar) {
        L.polyline(latLngs, {
          color: '#ffffff',
          weight: isSelected ? 7.5 : 6.5,
          opacity: 0.42,
          interactive: false,
        }).addTo(layer);
      }

      const line = L.polyline(latLngs, {
        color: baseColor,
        weight: seg.is_transit ? 2.2 : isSelected ? 4.5 : 3.5,
        dashArray: seg.is_transit ? '6 6' : undefined,
        opacity: seg.is_transit ? 0.72 : 0.94,
      }).addTo(layer);

      if (!seg.is_transit) {
        line.on('click', (ev) => {
          if (toolModeRef.current === 'select' || toolModeRef.current === 'waypoint') {
            L.DomEvent.stopPropagation(ev);
            onSelectPathwayRef.current(seg.pathway_id);
          }
        });
      }

      // Directional chevron arrows along every segment
      const arrows = computeArrowMarkers(
        seg.points,
        seg.is_transit ? arrowSpacingM * 1.4 : arrowSpacingM
      );
      arrows.forEach((arr) => {
        L.marker([arr.lat, arr.lon], {
          icon: makeArrowIcon(arr.bearing, baseColor, seg.is_transit),
          interactive: false,
          zIndexOffset: seg.is_transit ? 350 : 450,
        }).addTo(layer);
      });

      // Sequence #badge at exact start + target square at end for non-transit paths
      if (!seg.is_transit) {
        nonTransitSeq += 1;
        const startPt = seg.points[0];
        const endPt = seg.points[seg.points.length - 1];
        L.marker([startPt.lat, startPt.lon], {
          icon: makeSequenceBadgeIcon(nonTransitSeq, baseColor),
          interactive: false,
          zIndexOffset: 550,
        }).addTo(layer);
        L.marker([endPt.lat, endPt.lon], {
          icon: makeEndMarkerIcon(baseColor),
          interactive: false,
          zIndexOffset: 540,
        }).addTo(layer);
      }
    });

    // If a custom Waypoint pathway is selected in Select/Waypoint mode, allow dragging its vertices!
    if (
      (toolMode === 'select' || toolMode === 'waypoint') &&
      location.path_mode === 'custom_sequence' &&
      selectedPathwayId
    ) {
      const selectedPath = location.pathways.find(
        (p) => p.id === selectedPathwayId && p.kind === 'waypoint'
      );
      if (selectedPath && selectedPath.points.length >= 2) {
        const pwColor = selectedPath.color || '#22d3ee';
        const workingPts = selectedPath.points.map((p) => ({ ...p }));
        const previewLine = L.polyline(
          workingPts.map((p) => [p.lat, p.lon] as [number, number]),
          {
            color: '#ffffff',
            weight: 2,
            dashArray: '4 4',
            opacity: 0.75,
            interactive: false,
          }
        ).addTo(layer);

        workingPts.forEach((pt, idx) => {
          const wMarker = L.marker([pt.lat, pt.lon], {
            icon: makeWaypointHandleIcon(idx, pwColor),
            draggable: true,
            zIndexOffset: 800,
          }).addTo(layer);

          wMarker.on('dragstart', () => {
            isDraggingItemRef.current = true;
          });
          wMarker.on('drag', () => {
            const ll = wMarker.getLatLng();
            workingPts[idx] = { lat: ll.lat, lon: ll.lng };
            previewLine.setLatLngs(workingPts.map((p) => [p.lat, p.lon] as [number, number]));
          });
          wMarker.on('dragend', () => {
            isDraggingItemRef.current = false;
            const ll = wMarker.getLatLng();
            const nextPts = workingPts.map((p, i) => (i === idx ? { lat: ll.lat, lon: ll.lng } : p));
            const nextPathways = locationRef.current.pathways.map((pw) =>
              pw.id === selectedPath.id ? { ...pw, points: nextPts } : pw
            );
            onUpdateLocationRef.current({ pathways: nextPathways });
          });
          wMarker.on('contextmenu', (ev) => {
            L.DomEvent.stopPropagation(ev);
            if (workingPts.length > 2) {
              const nextPts = workingPts.filter((_, i) => i !== idx);
              const nextPathways = locationRef.current.pathways.map((pw) =>
                pw.id === selectedPath.id ? { ...pw, points: nextPts } : pw
              );
              onUpdateLocationRef.current({ pathways: nextPathways });
            }
          });
        });
      }
    }
  }, [
    compiledRoute,
    location.path_mode,
    location.pathways,
    selectedPathwayId,
    toolMode,
    vehicle.activePathIndex,
    zoomTick,
  ]);

  // Update Vehicle marker, breadcrumb trail & Follow Car panning
  useEffect(() => {
    const marker = vehicleMarkerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;

    marker.setLatLng([vehicle.lat, vehicle.lon]);
    marker.setIcon(makeVehicleIcon(vehicle.heading, vehicle.isPreview));

    if (trailPolylineRef.current) {
      if (showTrail && trailPoints.length >= 2) {
        trailPolylineRef.current.setLatLngs(
          trailPoints.map((p) => [p.lat, p.lon] as [number, number])
        );
      } else {
        trailPolylineRef.current.setLatLngs([]);
      }
    }

    if (followCar && !isDraggingItemRef.current && !isDrawingRef.current) {
      map.panTo([vehicle.lat, vehicle.lon], { animate: true, duration: 0.2 });
    }
  }, [vehicle.lat, vehicle.lon, vehicle.heading, vehicle.isPreview, showTrail, trailPoints, followCar]);

  const cursorClass =
    toolMode === 'draw' && !spacePressed
      ? 'map-cursor-crosshair'
      : toolMode === 'boundary' || toolMode === 'waypoint'
        ? 'map-cursor-crosshair'
        : 'map-cursor-grab';

  return (
    <div
      ref={containerRef}
      className={`w-full h-full select-none ${cursorClass}`}
      style={{ minHeight: '100%' }}
    />
  );
});

export default MapCanvas;
