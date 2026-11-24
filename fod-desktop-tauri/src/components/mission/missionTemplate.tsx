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
      { lat: 28.5104, lon: 77.3726 },
      { lat: 28.5115, lon: 77.3726 },
      { lat: 28.5115, lon: 77.3739 },
      { lat: 28.5104, lon: 77.3739 },
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
      { lat: 28.5096, lon: 77.3718 },
      { lat: 28.5104, lon: 77.3718 },
      { lat: 28.5104, lon: 77.3726 },
      { lat: 28.5096, lon: 77.3726 },
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
      { lat: 28.5108, lon: 77.3739 },
      { lat: 28.5118, lon: 77.3739 },
      { lat: 28.5118, lon: 77.3749 },
      { lat: 28.5108, lon: 77.3749 },
    ],
  },
];

interface MissionTemplateProps {
  stopTemplateView: () => void;
  nextDisplayId?: number;
}

const MissionTemplate: React.FC<MissionTemplateProps> = ({ stopTemplateView, nextDisplayId }) => {
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
    if (activeBoundaryPoints.length < 3) return [];
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
        : [77.373276, 28.510936];

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      minZoom: 1,
      maxZoom: 22,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: ["/satellite/{z}/{x}/{y}.jpg"],
            tileSize: 256,
            minzoom: 0,
            maxzoom: 20,
          },
          "satellite-kochi-hi": {
            type: "raster",
            tiles: ["/satellite/{z}/{x}/{y}.jpg"],
            tileSize: 256,
            minzoom: 21,
            maxzoom: 22,
            bounds: [76.265, 9.935, 76.285, 9.955],
          },
        },
        layers: [
          {
            id: "background-dark",
            type: "background",
            paint: { "background-color": "#22262B" },
          },
          {
            id: "satellite",
            type: "raster",
            source: "satellite",
          },
          {
            id: "satellite-kochi-hi",
            type: "raster",
            source: "satellite-kochi-hi",
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

      setCreatorPoints((prev) => [...prev, newPt]);
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
          "fill-color": "#4C9FE8",
          "fill-opacity": 0.18,
        },
      });
      m.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary-source",
        paint: {
          "line-color": "#4C9FE8",
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
          "line-color": "#E5A12B",
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
          "circle-color": "#4C9FE8",
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
      if (!opts?.isFreeRun && activeBoundaryPoints.length >= 3) {
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
            displayId: nextDisplayId ?? res.data.displayId ?? null,
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

  const getTypeBadgeClass = (type: string) => {
    if (type === "RUNWAY") return "bg-[#4C9FE8]/15 text-[#4C9FE8] border border-[#4C9FE8]/30";
    if (type === "TAXIWAY") return "bg-[#E5A12B]/15 text-[#E5A12B] border border-[#E5A12B]/30";
    if (type === "APRON") return "bg-[#01B656]/15 text-[#01B656] border border-[#01B656]/30";
    return "bg-slate-200/70 dark:bg-[#353A42] text-slate-600 dark:text-slate-300 border border-slate-300/60 dark:border-[#454B53]";
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#F8FAFC] dark:bg-[#22262B] text-slate-800 dark:text-slate-100 overflow-hidden select-none transition-colors duration-200">
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-white dark:bg-[#292D33] border-b border-slate-200 dark:border-[#373C43] shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#4C9FE8]/15 text-[#4C9FE8] border border-[#4C9FE8]/30 flex items-center justify-center shrink-0">
            <RxLayers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight truncate">
              Mission Planner &amp; Templates
            </h1>
          </div>
        </div>

        {/* Right: Tab Pills + Close Button */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-[#22262B] rounded-xl border border-slate-200 dark:border-[#373C43]">
            <button
              type="button"
              onClick={() => setActiveTab("PE")}
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "PE"
                  ? "bg-white dark:bg-[#292D33] text-[#4C9FE8] border border-slate-200/80 dark:border-[#4C9FE8]/40 shadow-xs"
                  : "border border-transparent text-slate-600 dark:text-[#8C939C] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#353A42]/60"
              }`}
            >
              <RxLayers className="w-3.5 h-3.5 shrink-0" />
              <span>Saved Templates</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("CN")}
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "CN"
                  ? "bg-white dark:bg-[#292D33] text-[#4C9FE8] border border-slate-200/80 dark:border-[#4C9FE8]/40 shadow-xs"
                  : "border border-transparent text-slate-600 dark:text-[#8C939C] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#353A42]/60"
              }`}
            >
              <RxPencil2 className="w-3.5 h-3.5 shrink-0" />
              <span>Create New Template</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("FR")}
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "FR"
                  ? "bg-white dark:bg-[#292D33] text-[#4C9FE8] border border-slate-200/80 dark:border-[#4C9FE8]/40 shadow-xs"
                  : "border border-transparent text-slate-600 dark:text-[#8C939C] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#353A42]/60"
              }`}
            >
              <RxPlay className="w-3.5 h-3.5 shrink-0" />
              <span>Free Run</span>
            </button>
          </div>

          <button
            type="button"
            onClick={stopTemplateView}
            title="Close Mission Planner"
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-[#373C43] bg-white dark:bg-[#292D33] text-slate-500 dark:text-[#8C939C] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#373C43] active:scale-95 transition-all flex items-center justify-center cursor-pointer shrink-0"
          >
            <RxCross2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* ========================================================================= */}
        {/* COLUMN 1 (LEFT): PRE-EXISTING TEMPLATES LIST (Only in PE mode)            */}
        {/* ========================================================================= */}
        {activeTab === "PE" && (
          <div className="w-full md:w-[250px] lg:w-[270px] max-h-[170px] md:max-h-none border-b md:border-b-0 md:border-r border-slate-200 dark:border-[#373C43] bg-white dark:bg-[#292D33] p-3 flex flex-col gap-2.5 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between px-1 shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#8C939C]">
                Available Templates
              </span>
              <span className="font-mono text-xs font-bold text-[#4C9FE8]">
                {String(templates.length).padStart(2, "0")}
              </span>
            </div>

            <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0">
              {templates.map((tmpl) => {
                const isSelected = selectedTemplateId === tmpl.id;
                return (
                  <div
                    key={tmpl.id}
                    onClick={() => setSelectedTemplateId(tmpl.id)}
                    className={`min-w-[230px] md:min-w-0 p-2.5 rounded-xl border transition-all cursor-pointer relative select-none ${
                      isSelected
                        ? "bg-[#4C9FE8]/[0.08] dark:bg-[#4C9FE8]/[0.14] border-[#4C9FE8] ring-1 ring-[#4C9FE8] shadow-xs"
                        : "bg-slate-50/70 dark:bg-[#22262B] border-slate-200 dark:border-[#373C43] hover:border-[#4C9FE8]/60 hover:bg-slate-100/60 dark:hover:bg-[#262B31]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-bold text-xs text-slate-900 dark:text-white tracking-tight truncate">
                        {tmpl.name}
                      </span>
                      <div className="flex items-center space-x-1 shrink-0">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${getTypeBadgeClass(tmpl.type)}`}>
                          {tmpl.type}
                        </span>
                        {tmpl.isCustom && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                            title="Delete template"
                            className="text-slate-400 hover:text-[#D51F32] p-0.5 cursor-pointer"
                          >
                            <RxTrash className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-[#8C939C] mt-1 line-clamp-2 leading-snug">
                      {tmpl.description}
                    </p>

                    <div className="grid grid-cols-4 gap-1 mt-2 pt-2 border-t border-slate-200/80 dark:border-[#373C43] text-[10px]">
                      <div>
                        <span className="block text-[9px] text-slate-400 dark:text-[#8C939C]">Speed</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{tmpl.speed}km/h</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 dark:text-[#8C939C]">Pass</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{tmpl.pass}Ã—</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 dark:text-[#8C939C]">Overlap</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{tmpl.overlap}%</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 dark:text-[#8C939C]">Path</span>
                        <span className="font-bold text-[#4C9FE8] font-mono">{tmpl.direction === "CROSSWISE" ? "Cross" : "Length"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* COLUMN 2 (CENTER): SHARED UNIFIED MAP CANVAS (Maximized)                  */}
        {/* ========================================================================= */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col p-2 sm:p-2.5 gap-2.5 bg-[#F1F5F9] dark:bg-[#22262B] overflow-hidden">
          {/* Map Canvas */}
          <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden border border-slate-200 dark:border-[#373C43] shadow-xs bg-[#22262B]">
            <div
              ref={mapContainer}
              className={`w-full h-full ${activeTab === "CN" ? "cursor-crosshair" : ""}`}
            />

            {/* Overlays for PE: Top-Left Preview Pill & Top-Right Rotate/Reverse */}
            {activeTab === "PE" && (
              <>
                <div className="absolute top-3 left-3 bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-white/15 shadow-sm flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <div className="w-2 h-2 rounded-full bg-[#4C9FE8] animate-pulse shrink-0" />
                  <span className="truncate max-w-[220px] sm:max-w-none">
                    Preview: <strong className="text-slate-900 dark:text-white">{currentTemplate.name}</strong>
                  </span>
                </div>

                <div className="absolute top-3 right-3 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setDirection((prev) => (prev === "LENGTHWISE" ? "CROSSWISE" : "LENGTHWISE"))}
                    className="bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md hover:bg-[#4C9FE8]/10 text-[#4C9FE8] font-bold text-xs px-3 py-1.5 rounded-xl border border-[#4C9FE8]/40 shadow-sm active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer"
                    title="Rotate sweep path direction 90 deg"
                  >
                    <RxReload className="w-3.5 h-3.5" />
                    <span>Rotate 90</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReversePath((prev) => !prev)}
                    className={`bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md font-bold text-xs px-2.5 py-1.5 rounded-xl border shadow-sm active:scale-95 transition-all cursor-pointer ${
                      reversePath
                        ? "border-[#4C9FE8] text-[#4C9FE8] bg-[#4C9FE8]/15"
                        : "border-slate-200/90 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                    }`}
                    title="Reverse start point / traversal order"
                  >
                    {reversePath ? "Reversed" : "Reverse"}
                  </button>
                </div>
              </>
            )}

            {/* Overlays for CN */}
            {activeTab === "CN" && (
              <>
                <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center gap-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      if (!Number.isNaN(idx) && DEFAULT_TEMPLATES[idx]) {
                        setCreatorPoints(DEFAULT_TEMPLATES[idx].boundaryPoints);
                      }
                    }}
                    className="bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 font-semibold text-xs px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-white/15 shadow-sm focus:outline-none cursor-pointer"
                    title="Load boundary preset"
                  >
                    <option value="" disabled>
                      Presets
                    </option>
                    <option value="0">Runway Preset</option>
                    <option value="1">Taxiway Preset</option>
                  </select>

                  {creatorPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCreatorPoints((prev) => prev.slice(0, -1))}
                      className="bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 font-semibold text-xs px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-white/15 shadow-sm active:scale-95 transition-all cursor-pointer"
                      title="Undo last point"
                    >
                      Undo
                    </button>
                  )}

                  {creatorPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCreatorPoints([])}
                      className="bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md hover:bg-[#D51F32]/15 text-[#D51F32] font-semibold text-xs px-2.5 py-1.5 rounded-xl border border-[#D51F32]/30 shadow-sm active:scale-95 transition-all cursor-pointer"
                      title="Clear all points"
                    >
                      Clear
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setDirection((prev) => (prev === "LENGTHWISE" ? "CROSSWISE" : "LENGTHWISE"))}
                    className="bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md hover:bg-[#4C9FE8]/10 text-[#4C9FE8] font-bold text-xs px-2.5 py-1.5 rounded-xl border border-[#4C9FE8]/40 shadow-sm active:scale-95 transition-all cursor-pointer"
                    title="Rotate sweep path direction 90 deg"
                  >
                    Rotate 90
                  </button>

                  <button
                    type="button"
                    onClick={() => setReversePath((prev) => !prev)}
                    className={`bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md font-bold text-xs px-2.5 py-1.5 rounded-xl border shadow-sm active:scale-95 transition-all cursor-pointer ${
                      reversePath
                        ? "border-[#4C9FE8] text-[#4C9FE8] bg-[#4C9FE8]/15"
                        : "border-slate-200/90 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                    }`}
                    title="Reverse start point / traversal order"
                  >
                    {reversePath ? "Reversed" : "Reverse"}
                  </button>
                </div>

                {/* Path Legend */}
                <div className="absolute bottom-3 left-3 bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-white/15 text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center space-x-4 shadow-sm">
                  <div className="flex items-center space-x-1.5">
                    <div className="w-3.5 h-0.5 border-t-2 border-dashed border-[#4C9FE8]" />
                    <span>Boundary</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <div className="w-3.5 h-0.5 border-t-2 border-dashed border-[#E5A12B]" />
                    <span>Scan Path ({stats.sweepsCount} sweeps)</span>
                  </div>
                </div>
              </>
            )}

            {/* Overlays for FR */}
            {activeTab === "FR" && (
              <div className="absolute top-3 left-3 flex items-center space-x-2">
                <div className="bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200/90 dark:border-white/15 shadow-sm flex items-center space-x-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#01B656] animate-pulse" />
                  <span>Free Run Scanning Mode - Full Airfield Free Roam</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Control Bar in PE (Compact single-row matching reference) */}
          {activeTab === "PE" && (
            <div className="bg-white dark:bg-[#292D33] rounded-xl px-3.5 py-2.5 border border-slate-200 dark:border-[#373C43] shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Left: Primary Launch Button */}
              <button
                type="button"
                onClick={() => handleLaunchMission()}
                disabled={apiLoading}
                className="px-5 py-2.5 bg-[#4C9FE8] hover:bg-[#3B91DC] text-white font-bold text-xs sm:text-sm rounded-lg shadow active:scale-[0.98] transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RxPlay className="w-4 h-4" />
                <span>{apiLoading ? "Launching..." : "Launch Mission"}</span>
              </button>

              {/* Center: Sliders, Passes & Telemetry */}
              <div className="flex flex-wrap items-center gap-4 lg:gap-5">
                {/* Inspection Speed */}
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-[#8C939C] uppercase tracking-wider">
                      Inspection Speed
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                      {speed} km/h
                    </span>
                  </div>
                  <input
                    type="range"
                    min={SPEED_RANGE.min}
                    max={SPEED_RANGE.max}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="w-28 sm:w-32 accent-[#4C9FE8] cursor-pointer"
                  />
                </div>

                {/* Swath Overlap */}
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-[#8C939C] uppercase tracking-wider">
                      Swath Overlap
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                      {overlap}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={OVERLAP_RANGE.min}
                    max={OVERLAP_RANGE.max}
                    value={overlap}
                    onChange={(e) => setOverlap(Number(e.target.value))}
                    className="w-28 sm:w-32 accent-[#4C9FE8] cursor-pointer"
                  />
                </div>

                {/* Passes */}
                <div className="flex flex-col space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-[#8C939C] uppercase tracking-wider">
                    Passes
                  </span>
                  <div className="flex items-center space-x-1">
                    {[1, 2, 3].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPass(p)}
                        className={`w-7 h-7 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          pass === p
                            ? "bg-[#4C9FE8] text-white border-[#4C9FE8] shadow-xs"
                            : "bg-slate-50 dark:bg-[#22262B] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#373C43] hover:bg-slate-100 dark:hover:bg-[#353A42]"
                        }`}
                      >
                        {p}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Telemetry Stats */}
                <div className="hidden xl:flex items-center space-x-4 pl-3 border-l border-slate-200 dark:border-[#373C43] text-xs">
                  <div>
                    <span className="text-slate-400 dark:text-[#8C939C] block text-[10px] uppercase font-bold">Area</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-white">{stats.areaFormatted}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-[#8C939C] block text-[10px] uppercase font-bold">Distance</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-white">{stats.distFormatted}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-[#8C939C] block text-[10px] uppercase font-bold">Est. Time</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-white">{stats.durationFormatted}</span>
                  </div>
                </div>
              </div>

              {/* Right: Path Direction Toggle */}
              <div className="flex items-center space-x-1.5 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => setDirection("LENGTHWISE")}
                  className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                    direction === "LENGTHWISE"
                      ? "bg-[#4C9FE8]/15 text-[#4C9FE8] border-[#4C9FE8] shadow-xs"
                      : "bg-slate-50 dark:bg-[#22262B] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#373C43] hover:bg-slate-100 dark:hover:bg-[#353A42]"
                  }`}
                  title="Lengthwise (Optimal, sweeps along length with fewest turns)"
                >
                  <span>â†•</span>
                  <span>Lengthwise</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("CROSSWISE")}
                  className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                    direction === "CROSSWISE"
                      ? "bg-[#4C9FE8]/15 text-[#4C9FE8] border-[#4C9FE8] shadow-xs"
                      : "bg-slate-50 dark:bg-[#22262B] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#373C43] hover:bg-slate-100 dark:hover:bg-[#353A42]"
                  }`}
                  title="Crosswise (Transverse, sweeps across width)"
                >
                  <span>â†”</span>
                  <span>Crosswise</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* COLUMN 3 (RIGHT): CREATOR PARAMETERS (When in CN mode)                    */}
        {/* ========================================================================= */}
        {activeTab === "CN" && (
          <div className="w-full md:w-[320px] lg:w-[340px] max-h-[45%] md:max-h-none bg-white dark:bg-[#292D33] border-t md:border-t-0 md:border-l border-slate-200 dark:border-[#373C43] p-4 flex flex-col gap-3.5 overflow-y-auto shrink-0">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#8C939C]">
                New Template Details
              </span>
              <div className="space-y-2.5 mt-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-[#9EA4B0]">Template Name</label>
                  <input
                    type="text"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    placeholder="e.g. Runway 09 East Extension"
                    className="w-full mt-1 px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-[#353A42] border border-slate-300 dark:border-[#454B53] text-slate-900 dark:text-slate-100 rounded-lg focus:border-[#4C9FE8] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-[#9EA4B0]">Area Category</label>
                  <select
                    value={creatorType}
                    onChange={(e) => setCreatorType(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-[#353A42] border border-slate-300 dark:border-[#454B53] text-slate-900 dark:text-slate-100 rounded-lg focus:border-[#4C9FE8] focus:outline-none"
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
            <div className="p-3 bg-slate-50 dark:bg-[#22262B] border border-slate-200 dark:border-[#373C43] rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span>Polygon Vertices ({creatorPoints.length})</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    creatorPoints.length >= 3
                      ? "bg-[#01B656]/15 text-[#01B656] border border-[#01B656]/30"
                      : "bg-[#E5A12B]/15 text-[#E5A12B] border border-[#E5A12B]/30"
                  }`}
                >
                  {creatorPoints.length >= 3 ? "Valid Polygon" : "Needs 3+ points"}
                </span>
              </div>

              <div className="space-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-300 max-h-24 overflow-y-auto">
                {creatorPoints.length === 0 ? (
                  <p className="text-slate-400 dark:text-[#8C939C] font-sans text-xs italic py-2 text-center">
                    Click the map to add polygon vertices (3+ points), or select a preset above.
                  </p>
                ) : (
                  creatorPoints.map((p, idx) => (
                    <div key={idx} className="flex justify-between items-center py-0.5 border-b border-slate-200/70 dark:border-[#373C43] last:border-0 gap-2">
                      <span className="font-bold text-slate-800 dark:text-white">Point #{idx + 1}</span>
                      <span className="ml-auto">
                        {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCreatorPoints((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-[#D51F32] px-1 font-sans cursor-pointer"
                        title={`Remove Point #${idx + 1}`}
                      >
                        <RxCross2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Mission Parameters */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#8C939C]">
                Path &amp; Speed Controls
              </span>

              {/* Speed */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  <span>Inspection Speed</span>
                  <span className="font-mono text-[#4C9FE8] font-bold">{speed} km/h</span>
                </div>
                <input
                  type="range"
                  min={SPEED_RANGE.min}
                  max={SPEED_RANGE.max}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full accent-[#4C9FE8] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 dark:text-[#8C939C]">
                  <span>{SPEED_RANGE.min} km/h (Slow)</span>
                  <span>{SPEED_RANGE.max} km/h (Fast)</span>
                </div>
              </div>

              {/* Overlap */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  <span>Swath Overlap</span>
                  <span className="font-mono text-[#4C9FE8] font-bold">{overlap}%</span>
                </div>
                <input
                  type="range"
                  min={OVERLAP_RANGE.min}
                  max={OVERLAP_RANGE.max}
                  value={overlap}
                  onChange={(e) => setOverlap(Number(e.target.value))}
                  className="w-full accent-[#4C9FE8] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 dark:text-[#8C939C]">
                  <span>10% (Wide)</span>
                  <span>50% (Dense)</span>
                </div>
              </div>

              {/* Passes */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  <span>Pass Count</span>
                  <span className="font-mono text-[#4C9FE8] font-bold">{pass} Pass(es)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPass(p)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        pass === p
                          ? "bg-[#4C9FE8] text-white border-[#4C9FE8] shadow-xs"
                          : "bg-slate-50 dark:bg-[#22262B] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#373C43] hover:bg-slate-100 dark:hover:bg-[#353A42]"
                      }`}
                    >
                      {p}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Sweep Path Orientation & Direction */}
              <div>
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  <span>Sweep Path Orientation</span>
                  <span className="text-[10px] uppercase font-bold text-[#4C9FE8] bg-[#4C9FE8]/15 border border-[#4C9FE8]/30 px-2 py-0.5 rounded">
                    {direction === "LENGTHWISE" ? "Lengthwise" : "Crosswise"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection("LENGTHWISE")}
                    className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all flex flex-col items-center justify-center space-y-0.5 cursor-pointer ${
                      direction === "LENGTHWISE"
                        ? "bg-[#4C9FE8] text-white border-[#4C9FE8] shadow-xs"
                        : "bg-slate-50 dark:bg-[#22262B] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#373C43] hover:bg-slate-100 dark:hover:bg-[#353A42]"
                    }`}
                  >
                    <span>â†• Lengthwise</span>
                    <span className={`text-[9px] font-normal ${direction === "LENGTHWISE" ? "text-white/85" : "text-slate-400 dark:text-[#8C939C]"}`}>
                      Fewest turns
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection("CROSSWISE")}
                    className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all flex flex-col items-center justify-center space-y-0.5 cursor-pointer ${
                      direction === "CROSSWISE"
                        ? "bg-[#4C9FE8] text-white border-[#4C9FE8] shadow-xs"
                        : "bg-slate-50 dark:bg-[#22262B] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#373C43] hover:bg-slate-100 dark:hover:bg-[#353A42]"
                    }`}
                  >
                    <span>â†” Crosswise</span>
                    <span className={`text-[9px] font-normal ${direction === "CROSSWISE" ? "text-white/85" : "text-slate-400 dark:text-[#8C939C]"}`}>
                      Transverse
                    </span>
                  </button>
                </div>

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200 dark:border-[#373C43] text-[11px] text-slate-500 dark:text-[#8C939C]">
                  <span>Reverse sweep sequence</span>
                  <button
                    type="button"
                    onClick={() => setReversePath((prev) => !prev)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                      reversePath
                        ? "bg-[#4C9FE8] text-white"
                        : "bg-slate-100 dark:bg-[#353A42] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#454B53]"
                    }`}
                  >
                    {reversePath ? "Reversed (ON)" : "Normal"}
                  </button>
                </div>
              </div>
            </div>

            {/* Calculated Metrics Card */}
            <div className="p-3 bg-[#4C9FE8]/10 border border-[#4C9FE8]/30 rounded-xl space-y-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#4C9FE8]">
                Calculated Sweep Telemetry
              </span>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                <div>
                  <span className="text-slate-500 dark:text-[#8C939C] block text-[10px]">Total Area</span>
                  <span className="font-bold text-slate-800 dark:text-white">{stats.areaFormatted}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-[#8C939C] block text-[10px]">Path Length</span>
                  <span className="font-bold text-slate-800 dark:text-white">{stats.distFormatted}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-[#8C939C] block text-[10px]">Number of Sweeps</span>
                  <span className="font-bold text-slate-800 dark:text-white">{stats.sweepsCount}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-[#8C939C] block text-[10px]">Estimated Time</span>
                  <span className="font-bold text-slate-800 dark:text-white">{stats.durationFormatted}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-auto pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={creatorPoints.length < 3}
                className="w-full py-2.5 px-4 bg-slate-100 dark:bg-[#353A42] hover:bg-slate-200 dark:hover:bg-[#454B53] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#454B53] font-bold text-xs rounded-lg transition-all shadow-xs active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                <RxBookmark className="w-4 h-4 text-[#4C9FE8]" />
                <span>Save Template</span>
              </button>

              <button
                type="button"
                onClick={() => handleLaunchMission()}
                disabled={apiLoading || creatorPoints.length < 3}
                className="w-full py-2.5 px-4 bg-[#4C9FE8] hover:bg-[#3B91DC] text-white font-bold text-xs rounded-lg transition-all shadow active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
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
          <div className="w-full md:w-[320px] lg:w-[340px] max-h-[45%] md:max-h-none bg-white dark:bg-[#292D33] border-t md:border-t-0 md:border-l border-slate-200 dark:border-[#373C43] p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3 overflow-y-auto shrink-0">
            <div className="flex items-center space-x-3 pb-2.5 border-b border-slate-200 dark:border-[#373C43] shrink-0">
              <div className="w-9 h-9 rounded-lg bg-[#01B656]/15 text-[#01B656] border border-[#01B656]/30 flex items-center justify-center shrink-0">
                <RxPlay className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight leading-tight">Free Run Scanning</h2>
                <p className="text-[11px] text-slate-500 dark:text-[#8C939C] mt-0.5 leading-tight">
                  Manual inspection drive with live AI detection
                </p>
              </div>
            </div>

            <div className="p-2.5 sm:p-3 bg-[#01B656]/10 border border-[#01B656]/30 rounded-xl space-y-1.5 shrink-0">
              <span className="text-[11px] font-bold text-[#01B656] uppercase tracking-wide block">
                Autonomous Scanning Telemetry
              </span>
              <ul className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-200 space-y-1 leading-snug list-disc list-inside">
                <li>Continuous 26-camera vision stream and neural FOD detection</li>
                <li>Real-time vehicle RTK centimeter positioning &amp; trail logging</li>
                <li>Unrestricted drive boundary for ad-hoc tarmac inspections</li>
                <li>Instant alert broadcasts on hazard identification</li>
              </ul>
            </div>

            {/* Speed Control */}
            <div className="space-y-1 shrink-0">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700 dark:text-slate-200">
                <span>Target Inspection Speed</span>
                <span className="text-[#01B656] font-mono text-sm">{freeRunSpeed} km/h</span>
              </div>
              <input
                type="range"
                min={SPEED_RANGE.min}
                max={SPEED_RANGE.max}
                value={freeRunSpeed}
                onChange={(e) => setFreeRunSpeed(Number(e.target.value))}
                className="w-full accent-[#01B656] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-[#8C939C]">
                <span>5 km/h (Precision sweep)</span>
                <span>45 km/h (Rapid transit)</span>
              </div>
            </div>

            <div className="mt-auto pt-1 shrink-0">
              <button
                type="button"
                onClick={() => handleLaunchMission({ isFreeRun: true })}
                disabled={apiLoading}
                className="w-full py-2.5 px-4 bg-[#01B656] hover:bg-[#009E48] text-white font-bold text-xs sm:text-sm rounded-lg shadow active:scale-[0.98] transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
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