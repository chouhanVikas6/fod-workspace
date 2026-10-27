import React, { useState, useEffect, useRef, useMemo } from "react";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as turf from "@turf/turf";
import {
  RxLayers,
  RxPencil2,
  RxPlay,
  RxCross2,
  RxCheck,
  RxReload,
  RxTrash,
  RxBookmark,
  RxReset,
} from "react-icons/rx";
import RestPath from "@/constants/apiPaths";
import { start_Mission } from "@/store/slices/missionState-slice";
import axiosClient from "@/utils/axios";
import { config } from "@/config/clientConfig";
import { mapArea } from "@/helper/mapHelper";

mapboxgl.accessToken =
  config.map.mapboxToken ||
  (import.meta as any).env?.VITE_MAPBOX_TOKEN ||
  (import.meta as any).env?.NEXT_PUBLIC_MAPBOX_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  "";

const SPEED_RANGE = { min: 5, max: 45, default: 20 };
const PASS_RANGE = { min: 1, max: 3, default: 1 };
const OVERLAP_RANGE = { min: 10, max: 50, default: 20 };

const SAVED_TEMPLATES_KEY = "ZOID_SAVED_TEMPLATES";

export interface BoundaryPoint {
  lat: number;
  lon: number;
}

export interface MissionTemplateItem {
  id: string;
  name: string;
  description: string;
  type: "RUNWAY" | "TAXIWAY" | "APRON" | "CUSTOM";
  speed: number;
  pass: number;
  overlap: number;
  direction?: "LENGTHWISE" | "CROSSWISE";
  reverse?: boolean;
  boundaryPoints: BoundaryPoint[];
  isCustom?: boolean;
}

const DEFAULT_TEMPLATES: MissionTemplateItem[] = [
  {
    id: "tmpl-runway-09-27",
    name: "Runway 09/27 (Main)",
    description: "Standard primary runway inspection sweep with dual-pass coverage.",
    type: "RUNWAY",
    speed: 25,
    pass: 2,
    overlap: 20,
    direction: "LENGTHWISE",
    reverse: false,
    boundaryPoints: [
      { lat: 9.9447681, lon: 76.2721646 },
      { lat: 9.945757, lon: 76.2719205 },
      { lat: 9.9460083, lon: 76.27212 },
      { lat: 9.9449009, lon: 76.2725 },
    ],
  },
  {
    id: "tmpl-taxiway-alpha",
    name: "Taxiway Alpha Sweep",
    description: "Rapid single-pass scan along high-speed taxiway connecting main apron.",
    type: "TAXIWAY",
    speed: 20,
    pass: 1,
    overlap: 25,
    direction: "LENGTHWISE",
    reverse: false,
    boundaryPoints: [
      { lat: 9.9443, lon: 76.2714 },
      { lat: 9.9451, lon: 76.27125 },
      { lat: 9.94525, lon: 76.2715 },
      { lat: 9.94445, lon: 76.27165 },
    ],
  },
  {
    id: "tmpl-apron-central",
    name: "Apron Central Grid",
    description: "High-density multi-angle inspection grid of aircraft parking bays.",
    type: "APRON",
    speed: 15,
    pass: 1,
    overlap: 30,
    direction: "LENGTHWISE",
    reverse: false,
    boundaryPoints: [
      { lat: 9.9453, lon: 76.2724 },
      { lat: 9.9461, lon: 76.2721 },
      { lat: 9.94635, lon: 76.2728 },
      { lat: 9.94555, lon: 76.2731 },
    ],
  },
];

interface MissionTemplateProps {
  stopTemplateView: () => void;
}

const MissionTemplate: React.FC<MissionTemplateProps> = ({ stopTemplateView }) => {
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState<"PE" | "CN" | "FR">("PE");
  const [apiLoading, setApiLoading] = useState<boolean>(false);

  // Template Storage
  const [templates, setTemplates] = useState<MissionTemplateItem[]>(() => {
    try {
      const stored = localStorage.getItem(SAVED_TEMPLATES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Failed to load saved templates from localStorage:", e);
    }
    return DEFAULT_TEMPLATES;
  });

  // Selected Pre-existing template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    DEFAULT_TEMPLATES[0].id
  );

  // Creator state
  const [creatorName, setCreatorName] = useState<string>("Runway Extension Scan");
  const [creatorType, setCreatorType] = useState<"RUNWAY" | "TAXIWAY" | "APRON" | "CUSTOM">("RUNWAY");
  const [creatorPoints, setCreatorPoints] = useState<BoundaryPoint[]>(
    DEFAULT_TEMPLATES[0].boundaryPoints
  );
  const [speed, setSpeed] = useState<number>(SPEED_RANGE.default);
  const [pass, setPass] = useState<number>(PASS_RANGE.default);
  const [overlap, setOverlap] = useState<number>(OVERLAP_RANGE.default);
  const [direction, setDirection] = useState<"LENGTHWISE" | "CROSSWISE">("LENGTHWISE");
  const [reversePath, setReversePath] = useState<boolean>(false);

  // Free Run parameters
  const [freeRunSpeed, setFreeRunSpeed] = useState<number>(20);

  // Map references
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  // Active template reference
  const currentTemplate = useMemo(() => {
    return (
      templates.find((t) => t.id === selectedTemplateId) ||
      templates[0] ||
      DEFAULT_TEMPLATES[0]
    );
  }, [templates, selectedTemplateId]);

  // Synchronize parameters when pre-existing template selection changes
  useEffect(() => {
    if (activeTab === "PE" && currentTemplate) {
      setSpeed(currentTemplate.speed);
      setPass(currentTemplate.pass);
      setOverlap(currentTemplate.overlap);
      setDirection(currentTemplate.direction || "LENGTHWISE");
      setReversePath(currentTemplate.reverse || false);
    }
  }, [selectedTemplateId, activeTab]);

  // Active boundary points based on current view
  const activeBoundaryPoints = useMemo(() => {
    if (activeTab === "CN") return creatorPoints;
    if (activeTab === "PE" && currentTemplate) return currentTemplate.boundaryPoints;
    return [];
  }, [activeTab, creatorPoints, currentTemplate]);

  // Calculate generated path lines based on boundary, overlap, direction, and reverse
  const calculatedPathLines = useMemo(() => {
    if (activeBoundaryPoints.length < 4) return [];
    try {
      const baseWidth = 10; // Base camera FOV swath in meters
      const effectiveLateralDistance = Math.max(
        3,
        baseWidth * (1 - (overlap || 20) / 100)
      );
      return mapArea(
        activeBoundaryPoints,
        effectiveLateralDistance,
        2,
        direction,
        reversePath
      );
    } catch (e) {
      console.warn("Failed to generate path lines:", e);
      return [];
    }
  }, [activeBoundaryPoints, overlap, direction, reversePath]);

  // Metrics computation (Area, Path Distance, Duration)
  const stats = useMemo(() => {
    let areaM2 = 0;
    if (activeBoundaryPoints.length >= 3) {
      try {
        const coords = activeBoundaryPoints.map((p) => [p.lon, p.lat]);
        coords.push(coords[0]);
        const poly = turf.polygon([coords]);
        areaM2 = Math.round(turf.area(poly));
      } catch (e) {}
    }

    let totalDistM = 0;
    try {
      calculatedPathLines.forEach((segment) => {
        if (segment.length >= 2) {
          const line = turf.lineString(segment);
          totalDistM += turf.length(line, { units: "meters" });
        }
      });
    } catch (e) {}

    totalDistM = Math.round(totalDistM * pass);
    const speedMS = ((speed || 20) * 1000) / 3600;
    const durationSec = speedMS > 0 ? Math.round(totalDistM / speedMS) : 0;
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;

    return {
      areaM2,
      areaFormatted:
        areaM2 > 10000
          ? `${(areaM2 / 10000).toFixed(2)} ha`
          : `${areaM2.toLocaleString()} m²`,
      totalDistM,
      distFormatted:
        totalDistM > 1000
          ? `${(totalDistM / 1000).toFixed(2)} km`
          : `${totalDistM} m`,
      durationFormatted: `${mins}m ${secs.toString().padStart(2, "0")}s`,
      sweepsCount: calculatedPathLines.length,
    };
  }, [activeBoundaryPoints, calculatedPathLines, speed, pass]);

  // Initialize Mapbox map once on mount
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initialCenter =
      activeBoundaryPoints.length > 0
        ? [activeBoundaryPoints[0].lon, activeBoundaryPoints[0].lat]
        : [76.2723, 9.9463];

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: ["/satellite/{z}/{x}/{y}.jpg"],
          },
        },
        layers: [
          {
            id: "background-dark",
            type: "background",
            paint: { "background-color": "#0f172a" },
          },
          {
            id: "satellite",
            type: "raster",
            source: "satellite",
          },
        ],
        center: initialCenter as [number, number],
        zoom: 17,
      },
      attributionControl: false,
    });

    m.setMaxPitch(0);
    m.setMinPitch(0);

    const kickResize = () => {
      try {
        m.resize();
      } catch {}
    };

    m.on("load", () => {
      setMapLoaded(true);
      kickResize();
    });

    map.current = m;

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(kickResize) : null;
    if (ro && mapContainer.current) ro.observe(mapContainer.current);

    const t1 = setTimeout(kickResize, 150);
    const t2 = setTimeout(kickResize, 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (ro) ro.disconnect();
      try {
        m.remove();
      } catch {}
      map.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Resize map when activeTab changes
  useEffect(() => {
    if (map.current) {
      const timer = setTimeout(() => {
        try {
          map.current?.resize();
        } catch {}
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  // Click on map to add boundary point in Creator Mode
  useEffect(() => {
    if (!map.current || !mapLoaded || activeTab !== "CN") return;

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      const newPt: BoundaryPoint = {
        lat: Number(e.lngLat.lat.toFixed(7)),
        lon: Number(e.lngLat.lng.toFixed(7)),
      };

      setCreatorPoints((prev) => {
        if (prev.length >= 4) {
          toast.info("4 boundary points defined. Click Clear to start over, or tweak below.");
          return prev;
        }
        return [...prev, newPt];
      });
    };

    map.current.on("click", handleMapClick);
    return () => {
      map.current?.off("click", handleMapClick);
    };
  }, [mapLoaded, activeTab]);

  // Update Map Layers (Boundary polygon, Path lines, Vertex markers)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;

    // 1. Boundary Polygon GeoJSON
    const hasPolygon = activeBoundaryPoints.length >= 3;
    const polyCoords = hasPolygon
      ? [[...activeBoundaryPoints.map((p) => [p.lon, p.lat]), [activeBoundaryPoints[0].lon, activeBoundaryPoints[0].lat]]]
      : [];

    const polygonData: any = {
      type: "FeatureCollection",
      features: hasPolygon
        ? [
            {
              type: "Feature",
              geometry: { type: "Polygon", coordinates: polyCoords },
            },
          ]
        : [],
    };

    if (m.getSource("boundary-source")) {
      (m.getSource("boundary-source") as mapboxgl.GeoJSONSource).setData(polygonData);
    } else {
      m.addSource("boundary-source", { type: "geojson", data: polygonData });
      m.addLayer({
        id: "boundary-fill",
        type: "fill",
        source: "boundary-source",
        paint: {
          "fill-color": "#2563eb",
          "fill-opacity": 0.18,
        },
      });
      m.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary-source",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 2.5,
          "line-dasharray": [3, 2],
        },
      });
    }

    // 2. Scan Path Lines GeoJSON
    const pathFeatures: any[] = calculatedPathLines.map((lineCoords, idx) => ({
      type: "Feature",
      properties: { index: idx },
      geometry: { type: "LineString", coordinates: lineCoords },
    }));

    const pathData: any = {
      type: "FeatureCollection",
      features: pathFeatures,
    };

    if (m.getSource("path-source")) {
      (m.getSource("path-source") as mapboxgl.GeoJSONSource).setData(pathData);
    } else {
      m.addSource("path-source", { type: "geojson", data: pathData });
      m.addLayer({
        id: "path-layer",
        type: "line",
        source: "path-source",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#f59e0b",
          "line-width": 2.5,
          "line-dasharray": [2, 2],
        },
      });
    }

    // 3. Vertex Points GeoJSON
    const pointsFeatures = activeBoundaryPoints.map((p, idx) => ({
      type: "Feature",
      properties: { label: `${idx + 1}` },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    }));

    const pointsData: any = {
      type: "FeatureCollection",
      features: pointsFeatures,
    };

    if (m.getSource("points-source")) {
      (m.getSource("points-source") as mapboxgl.GeoJSONSource).setData(pointsData);
    } else {
      m.addSource("points-source", { type: "geojson", data: pointsData });
      m.addLayer({
        id: "points-circle",
        type: "circle",
        source: "points-source",
        paint: {
          "circle-radius": 7,
          "circle-color": "#2563eb",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }

    // Fit map bounds to active boundary if available
    if (activeBoundaryPoints.length >= 2) {
      try {
        const bounds = new mapboxgl.LngLatBounds();
        activeBoundaryPoints.forEach((p) => bounds.extend([p.lon, p.lat]));
        m.fitBounds(bounds, { padding: 45, maxZoom: 18.5, duration: 400 });
      } catch (e) {}
    }
  }, [mapLoaded, activeBoundaryPoints, calculatedPathLines]);

  // Save new custom template to localStorage
  const handleSaveTemplate = () => {
    if (creatorPoints.length < 3) {
      toast.error("Please define at least 3 points for the mission boundary.");
      return;
    }

    const newTemplate: MissionTemplateItem = {
      id: `tmpl-custom-${Date.now()}`,
      name: creatorName.trim() || "Custom Scan Template",
      description: `Custom ${creatorType.toLowerCase()} boundary with ${creatorPoints.length} coordinates, ${direction.toLowerCase()} sweeps, and ${overlap}% overlap.`,
      type: creatorType,
      speed,
      pass,
      overlap,
      direction,
      reverse: reversePath,
      boundaryPoints: [...creatorPoints],
      isCustom: true,
    };

    const updated = [newTemplate, ...templates];
    setTemplates(updated);
    try {
      localStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(updated));
      toast.success(`Template "${newTemplate.name}" saved!`);
      setSelectedTemplateId(newTemplate.id);
      setActiveTab("PE");
    } catch (e) {
      toast.error("Could not save template to localStorage.");
    }
  };

  // Delete a custom template
  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    try {
      localStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(updated));
      toast.info("Template deleted.");
      if (selectedTemplateId === id && updated.length > 0) {
        setSelectedTemplateId(updated[0].id);
      }
    } catch (e) {}
  };

  // Launch the Mission
  const handleLaunchMission = async (opts?: {
    isFreeRun?: boolean;
    customSpeed?: number;
  }) => {
    const launchSpeed = opts?.isFreeRun
      ? freeRunSpeed
      : Math.min(SPEED_RANGE.max, Math.max(SPEED_RANGE.min, Number(speed) || 20));
    const launchPass = opts?.isFreeRun
      ? 1
      : Math.min(PASS_RANGE.max, Math.max(PASS_RANGE.min, Number(pass) || 1));

    if (!opts?.isFreeRun && activeBoundaryPoints.length < 3) {
      toast.error("Define a valid boundary with at least 3 points before launching.");
      return;
    }

    setApiLoading(true);

    try {
      // Sync boundary and lateral spacing into clientConfig for live map tracking
      if (!opts?.isFreeRun && activeBoundaryPoints.length >= 4) {
        config.map.boundaryPoints = activeBoundaryPoints;
        const baseWidth = 10;
        const effectiveLateral = Math.max(
          3,
          Math.round(baseWidth * (1 - (overlap || 20) / 100))
        );
        config.map.lateraldistance = effectiveLateral;
        config.map.pathDirection = direction;
        config.map.reversePath = reversePath;
      }

      const res = await axiosClient({
        method: "POST",
        url: RestPath.LOADNEWMISSION,
        data: {
          speed: launchSpeed,
          pass: launchPass,
        },
      });

      if (res?.data?.id) {
        toast.success(`Mission #${res.data.id} launched successfully!`);
        dispatch(
          start_Mission({
            ...res.data,
            isActive: true,
            duration: res.data.timer ?? 0,
          })
        );
        stopTemplateView();
      } else {
        toast.error(res?.data?.error || res?.data?.message || "Failed to start mission");
      }
    } catch (err: any) {
      toast.error(
        err?.data?.error ||
          err?.data?.message ||
          "Failed to start mission — is the vehicle connected?"
      );
    } finally {
      setApiLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden select-none">
      {/* Top Header & Tab Navigation */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200/90 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <RxLayers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-800 tracking-tight leading-tight">
              Mission Planner & Templates
            </h1>
            <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">
              Define scan boundaries, generate sweep paths, and configure telemetry
            </p>
          </div>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab("PE")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "PE"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            <RxLayers className="w-3.5 h-3.5" />
            <span>Saved Templates</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("CN")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "CN"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            <RxPencil2 className="w-3.5 h-3.5" />
            <span>Create New Template</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("FR")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "FR"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            <RxPlay className="w-3.5 h-3.5" />
            <span>Free Run</span>
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={stopTemplateView}
          title="Close Mission Planner"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
        >
          <RxCross2 className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ========================================================================= */}
        {/* COLUMN 1 (LEFT): PRE-EXISTING TEMPLATES LIST (Only in PE mode)            */}
        {/* ========================================================================= */}
        {activeTab === "PE" && (
          <div className="w-[340px] border-r border-slate-200/90 bg-white p-3.5 flex flex-col gap-3 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Available Templates
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 font-mono text-[11px] font-bold text-slate-600">
                {templates.length}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {templates.map((tmpl) => {
                const isSelected = selectedTemplateId === tmpl.id;
                return (
                  <div
                    key={tmpl.id}
                    onClick={() => setSelectedTemplateId(tmpl.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer relative select-none ${
                      isSelected
                        ? "bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                        : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800 tracking-tight">
                        {tmpl.name}
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                          {tmpl.type}
                        </span>
                        {tmpl.isCustom && (
                          <button
                            onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                            title="Delete template"
                            className="text-slate-400 hover:text-red-500 p-0.5"
                          >
                            <RxTrash className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-tight">
                      {tmpl.description}
                    </p>

                    <div className="grid grid-cols-4 gap-1 mt-2.5 pt-2 border-t border-slate-100 text-[10px]">
                      <div className="text-slate-500 font-medium">
                        Speed: <span className="font-bold text-slate-700 font-mono">{tmpl.speed}</span>k
                      </div>
                      <div className="text-slate-500 font-medium">
                        Pass: <span className="font-bold text-slate-700 font-mono">{tmpl.pass}</span>x
                      </div>
                      <div className="text-slate-500 font-medium">
                        Overlap: <span className="font-bold text-slate-700 font-mono">{tmpl.overlap}%</span>
                      </div>
                      <div className="text-slate-500 font-medium">
                        Path: <span className="font-bold text-blue-600 font-mono">{tmpl.direction === "CROSSWISE" ? "Cross" : "Length"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* COLUMN 2 (CENTER): SHARED UNIFIED MAP CANVAS (Active in PE, CN, and FR)   */}
        {/* ========================================================================= */}
        <div className="flex-1 flex flex-col p-4 gap-3 bg-slate-100/60 overflow-hidden">
          {/* Map Canvas */}
          <div className="flex-1 relative rounded-2xl overflow-hidden border border-slate-200/90 shadow-sm bg-slate-900">
            <div
              ref={mapContainer}
              className={`w-full h-full ${activeTab === "CN" ? "cursor-crosshair" : ""}`}
            />

            {/* Overlays for PE */}
            {activeTab === "PE" && (
              <div className="absolute top-3 left-3 flex items-center space-x-2">
                <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-sm flex items-center space-x-2 text-xs font-semibold text-slate-700">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                  <span>Preview: {currentTemplate.name}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setDirection((prev) => (prev === "LENGTHWISE" ? "CROSSWISE" : "LENGTHWISE"))}
                  className="bg-white/95 backdrop-blur-md hover:bg-blue-50 text-blue-700 font-bold text-xs px-3 py-1.5 rounded-xl border border-blue-200 shadow-sm active:scale-95 transition-all flex items-center space-x-1.5"
                  title="Rotate sweep path direction 90°"
                >
                  <RxReload className="w-3.5 h-3.5" />
                  <span>Rotate 90° ({direction === "LENGTHWISE" ? "Lengthwise" : "Crosswise"})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setReversePath((prev) => !prev)}
                  className={`bg-white/95 backdrop-blur-md font-bold text-xs px-2.5 py-1.5 rounded-xl border shadow-sm active:scale-95 transition-all ${
                    reversePath
                      ? "border-indigo-400 text-indigo-700 bg-indigo-50"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  title="Reverse start point / traversal order"
                >
                  ⇄ {reversePath ? "Reversed" : "Reverse"}
                </button>
              </div>
            )}

            {/* Overlays for CN */}
            {activeTab === "CN" && (
              <>
                <div className="absolute top-3 left-3 flex items-center space-x-2">
                  <div className="bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-sm text-xs font-bold text-slate-700 flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    <span>
                      {creatorPoints.length < 4
                        ? `Click map to place boundary corner (${creatorPoints.length}/4)`
                        : "Boundary closed • Path calculated"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCreatorPoints(DEFAULT_TEMPLATES[0].boundaryPoints)}
                    className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-all"
                  >
                    Runway Preset
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreatorPoints(DEFAULT_TEMPLATES[1].boundaryPoints)}
                    className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-all"
                  >
                    Taxiway Preset
                  </button>

                  {creatorPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCreatorPoints((prev) => prev.slice(0, -1))}
                      className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-all"
                      title="Undo last point"
                    >
                      Undo
                    </button>
                  )}

                  {creatorPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCreatorPoints([])}
                      className="bg-white hover:bg-red-50 text-red-600 font-semibold text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-all"
                      title="Clear all points"
                    >
                      Clear
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setDirection((prev) => (prev === "LENGTHWISE" ? "CROSSWISE" : "LENGTHWISE"))}
                    className="bg-white hover:bg-blue-50 text-blue-700 font-bold text-xs px-3 py-1.5 rounded-xl border border-blue-200 shadow-sm active:scale-95 transition-all flex items-center space-x-1.5"
                    title="Rotate sweep path direction 90°"
                  >
                    <RxReload className="w-3.5 h-3.5" />
                    <span>Rotate 90° ({direction === "LENGTHWISE" ? "Lengthwise" : "Crosswise"})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReversePath((prev) => !prev)}
                    className={`bg-white font-bold text-xs px-2.5 py-1.5 rounded-xl border shadow-sm active:scale-95 transition-all ${
                      reversePath
                        ? "border-indigo-400 text-indigo-700 bg-indigo-50"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                    title="Reverse start point / traversal order"
                  >
                    ⇄ {reversePath ? "Reversed" : "Reverse"}
                  </button>
                </div>

                {/* Path Legend */}
                <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 text-[11px] font-medium text-slate-600 flex items-center space-x-4 shadow-sm">
                  <div className="flex items-center space-x-1.5">
                    <div className="w-3.5 h-0.5 border-t-2 border-dashed border-blue-500" />
                    <span>Boundary</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <div className="w-3.5 h-0.5 border-t-2 border-dashed border-amber-500" />
                    <span>Scan Path ({stats.sweepsCount} sweeps)</span>
                  </div>
                </div>
              </>
            )}

            {/* Overlays for FR */}
            {activeTab === "FR" && (
              <div className="absolute top-3 left-3 flex items-center space-x-2">
                <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-2.5 text-xs font-bold text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Free Run Scanning Mode • Full Airfield Free Roam</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Footer only in PE */}
          {activeTab === "PE" && (
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm flex items-center justify-between gap-6 shrink-0">
              <div className="flex items-center space-x-5">
                {/* Speed */}
                <div className="flex flex-col space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Speed (km/h)
                  </span>
                  <div className="flex items-center space-x-2">
                    <input
                      type="range"
                      min={SPEED_RANGE.min}
                      max={SPEED_RANGE.max}
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      className="w-20 accent-blue-600 cursor-pointer"
                    />
                    <input
                      type="number"
                      min={SPEED_RANGE.min}
                      max={SPEED_RANGE.max}
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      className="w-12 px-1.5 py-1 text-xs font-bold text-slate-800 font-mono rounded-lg border border-slate-300 text-center"
                    />
                  </div>
                </div>

                {/* Overlap */}
                <div className="flex flex-col space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Overlap (%)
                  </span>
                  <div className="flex items-center space-x-2">
                    <input
                      type="range"
                      min={OVERLAP_RANGE.min}
                      max={OVERLAP_RANGE.max}
                      value={overlap}
                      onChange={(e) => setOverlap(Number(e.target.value))}
                      className="w-20 accent-blue-600 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-800 font-mono w-9 text-center">
                      {overlap}%
                    </span>
                  </div>
                </div>

                {/* Direction */}
                <div className="flex flex-col space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Path Direction
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setDirection("LENGTHWISE")}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                        direction === "LENGTHWISE"
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                      title="Lengthwise (Optimal, sweeps along length with fewest turns)"
                    >
                      ↕ Lengthwise
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection("CROSSWISE")}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                        direction === "CROSSWISE"
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                      title="Crosswise (Transverse, sweeps across width)"
                    >
                      ↔ Crosswise
                    </button>
                  </div>
                </div>

                {/* Passes */}
                <div className="flex flex-col space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Passes
                  </span>
                  <div className="flex items-center space-x-1">
                    {[1, 2, 3].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPass(p)}
                        className={`w-7 h-7 text-xs font-bold rounded-lg border transition-all ${
                          pass === p
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {p}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stats Pill */}
                <div className="h-10 w-[1px] bg-slate-200" />
                <div className="flex items-center space-x-4 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Area</span>
                    <span className="font-bold font-mono text-slate-800">{stats.areaFormatted}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Distance</span>
                    <span className="font-bold font-mono text-slate-800">{stats.distFormatted}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Est. Time</span>
                    <span className="font-bold font-mono text-slate-800">{stats.durationFormatted}</span>
                  </div>
                </div>
              </div>

              {/* Launch Button */}
              <button
                type="button"
                onClick={() => handleLaunchMission()}
                disabled={apiLoading}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center space-x-2"
              >
                <RxPlay className="w-4 h-4" />
                <span>{apiLoading ? "Launching..." : "Launch Mission"}</span>
              </button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* COLUMN 3 (RIGHT): CREATOR PARAMETERS (When in CN mode)                    */}
        {/* ========================================================================= */}
        {activeTab === "CN" && (
          <div className="w-[380px] bg-white border-l border-slate-200/90 p-4 flex flex-col gap-4 overflow-y-auto shrink-0 shadow-sm">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                New Template Details
              </span>
              <div className="space-y-3 mt-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Template Name</label>
                  <input
                    type="text"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    placeholder="e.g. Runway 09 East Extension"
                    className="w-full mt-1 px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Area Category</label>
                  <select
                    value={creatorType}
                    onChange={(e) => setCreatorType(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:border-blue-500 focus:outline-none bg-white"
                  >
                    <option value="RUNWAY">Runway</option>
                    <option value="TAXIWAY">Taxiway</option>
                    <option value="APRON">Apron / Parking</option>
                    <option value="CUSTOM">Custom Inspection Area</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Boundary Points Summary */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Boundary Coordinates ({creatorPoints.length}/4)</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    creatorPoints.length >= 3
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {creatorPoints.length >= 3 ? "Valid Polygon" : "Needs 3+ points"}
                </span>
              </div>

              <div className="space-y-1 text-[11px] font-mono text-slate-600 max-h-24 overflow-y-auto">
                {creatorPoints.length === 0 ? (
                  <p className="text-slate-400 font-sans text-xs italic py-2 text-center">
                    Click the map to add 4 boundary corners, or select a preset above.
                  </p>
                ) : (
                  creatorPoints.map((p, idx) => (
                    <div key={idx} className="flex justify-between items-center py-0.5 border-b border-slate-100 last:border-0">
                      <span className="font-bold text-slate-800">Point #{idx + 1}</span>
                      <span>
                        {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Mission Parameters */}
            <div className="space-y-3.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Path & Speed Controls
              </span>

              {/* Speed */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Inspection Speed</span>
                  <span className="font-mono text-blue-600 font-bold">{speed} km/h</span>
                </div>
                <input
                  type="range"
                  min={SPEED_RANGE.min}
                  max={SPEED_RANGE.max}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{SPEED_RANGE.min} km/h (Slow)</span>
                  <span>{SPEED_RANGE.max} km/h (Fast)</span>
                </div>
              </div>

              {/* Overlap */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Swath Overlap</span>
                  <span className="font-mono text-blue-600 font-bold">{overlap}%</span>
                </div>
                <input
                  type="range"
                  min={OVERLAP_RANGE.min}
                  max={OVERLAP_RANGE.max}
                  value={overlap}
                  onChange={(e) => setOverlap(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>10% (Wide)</span>
                  <span>50% (Dense)</span>
                </div>
              </div>

              {/* Passes */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Pass Count</span>
                  <span className="font-mono text-blue-600 font-bold">{pass} Pass(es)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPass(p)}
                      className={`py-1.5 text-xs font-bold rounded-xl border transition-all ${
                        pass === p
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {p}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Sweep Path Orientation & Direction */}
              <div>
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
                  <span>Sweep Path Orientation</span>
                  <span className="text-[10px] uppercase font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {direction === "LENGTHWISE" ? "Lengthwise (Optimal)" : "Crosswise"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection("LENGTHWISE")}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all flex flex-col items-center justify-center space-y-0.5 ${
                      direction === "LENGTHWISE"
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-500/20"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span>↕ Lengthwise</span>
                    <span className={`text-[9px] font-normal ${direction === "LENGTHWISE" ? "text-blue-100" : "text-slate-400"}`}>
                      Fewest turns (Optimal)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection("CROSSWISE")}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all flex flex-col items-center justify-center space-y-0.5 ${
                      direction === "CROSSWISE"
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-500/20"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span>↔ Crosswise</span>
                    <span className={`text-[9px] font-normal ${direction === "CROSSWISE" ? "text-blue-100" : "text-slate-400"}`}>
                      Transverse sweeps
                    </span>
                  </button>
                </div>

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100 text-[11px] text-slate-500">
                  <span>Reverse sweep sequence</span>
                  <button
                    type="button"
                    onClick={() => setReversePath((prev) => !prev)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                      reversePath
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {reversePath ? "Reversed (ON)" : "Normal"}
                  </button>
                </div>
              </div>
            </div>

            {/* Calculated Metrics Card */}
            <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                Calculated Sweep Telemetry
              </span>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">Total Area</span>
                  <span className="font-bold text-slate-800">{stats.areaFormatted}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Path Length</span>
                  <span className="font-bold text-slate-800">{stats.distFormatted}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Number of Sweeps</span>
                  <span className="font-bold text-slate-800">{stats.sweepsCount}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Estimated Time</span>
                  <span className="font-bold text-slate-800">{stats.durationFormatted}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-auto pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={creatorPoints.length < 3}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <RxBookmark className="w-4 h-4 text-blue-600" />
                <span>Save Template</span>
              </button>

              <button
                type="button"
                onClick={() => handleLaunchMission()}
                disabled={apiLoading || creatorPoints.length < 3}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <RxPlay className="w-4 h-4" />
                <span>{apiLoading ? "Launching..." : "Launch This Mission"}</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* COLUMN 3 (RIGHT): FREE RUN PARAMETERS (When in FR mode)                   */}
        {/* ========================================================================= */}
        {activeTab === "FR" && (
          <div className="w-[380px] bg-white border-l border-slate-200/90 p-5 flex flex-col gap-5 overflow-y-auto shrink-0 shadow-sm">
            <div className="flex items-center space-x-3.5 pb-2 border-b border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0">
                <RxPlay className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Free Run Scanning</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Manual inspection drive with live AI detection
                </p>
              </div>
            </div>

            <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-xl space-y-2">
              <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                Autonomous Scanning Telemetry
              </span>
              <ul className="text-xs text-emerald-800 space-y-2 list-disc list-inside">
                <li>Continuous 26-camera vision stream and neural FOD detection</li>
                <li>Real-time vehicle RTK centimeter positioning & trail logging</li>
                <li>Unrestricted drive boundary for ad-hoc tarmac inspections</li>
                <li>Instant alert broadcasts on hazard identification</li>
              </ul>
            </div>

            {/* Speed Control */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Target Inspection Speed</span>
                <span className="text-emerald-600 font-mono text-sm">{freeRunSpeed} km/h</span>
              </div>
              <input
                type="range"
                min={SPEED_RANGE.min}
                max={SPEED_RANGE.max}
                value={freeRunSpeed}
                onChange={(e) => setFreeRunSpeed(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>5 km/h (Precision sweep)</span>
                <span>45 km/h (Rapid transit)</span>
              </div>
            </div>

            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={() => handleLaunchMission({ isFreeRun: true })}
                disabled={apiLoading}
                className="w-full py-3 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <RxPlay className="w-4 h-4" />
                <span>{apiLoading ? "Starting Vehicle..." : "Launch Free Run Mission"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MissionTemplate;
