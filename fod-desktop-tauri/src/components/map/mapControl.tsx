import React, { useEffect, useState } from "react";

import "mapbox-gl/dist/mapbox-gl.css";

import { useSelector } from "react-redux";
import { SlidersHorizontal, Crosshair, Navigation } from "lucide-react";
import * as turf from "@turf/turf";

import HeadingIcon from "@/assets/images/svg/map/heading.svg";

import {
  validateSelfLocation,
  validateSelectedFodLocation,
} from "../../utils/MapUtils";

import FilterBox from "./filterBox";

import { RootState } from "@/store";

import Image from "next/image";

const MapControls = ({ map }: { map: any }) => {
  const [isfilterboxOpen, setisfilterboxOpen] = useState(false);
  const [isFodTrackON, setIsFodTrackON] = useState(false);
  const [goToZoom, setGoToZoom] = useState(false);
  const [isHeadingTrackON, set_isHeadingTrackON] = useState(false);
  const [offscreenIndicator, setOffscreenIndicator] = useState<{
    x: number;
    y: number;
    angleDeg: number;
    distanceLabel: string | null;
    fodLabel: string;
  } | null>(null);

  const selectedFod = useSelector(
    (state: RootState) => state.SelectedFod.fod
  );

  const selfLocation = useSelector(
    (state: RootState) => state.SystemHealth.RtkData.data
  );
  const magnetometer = useSelector(
    (state: RootState) => state.SystemHealth.magnetometer
  );

  const [zoom, setZoom] = useState(19);
  const [showPath, setShowPath] = useState(true);

  const minZoom = 1;
  const maxZoom = 22;
  const zoomStep = 0.5;

  function toggle() {
    setisfilterboxOpen((prev) => !prev);
  }

  function handleZoomIn() {
    if (!map?.current) return;
    const nextZoom = Math.min(maxZoom, map.current.getZoom() + zoomStep);
    map.current.zoomTo(nextZoom, { duration: 200 });
    setZoom(nextZoom);
  }

  function handleZoomOut() {
    if (!map?.current) return;
    const nextZoom = Math.max(minZoom, map.current.getZoom() - zoomStep);
    map.current.zoomTo(nextZoom, { duration: 200 });
    setZoom(nextZoom);
  }

  function jump_target(target: any) {
    if (!map?.current || !map.current.dragPan.isActive()) return;

    map.current.easeTo({
      ...target,
      duration: 600,
      essential: true,
    });

    if (goToZoom) {
      map.current.setZoom(20);
      setGoToZoom(false);
    }
  }

  // Initialize high-contrast navigation path layers on map init
  useEffect(() => {
    if (!map || !map.current) return;

    const handleStyleLoad = () => {
      if (!map.current.getSource("navpath")) {
        map.current.addSource("navpath", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        map.current.addLayer({
          id: "navpath-casing",
          type: "line",
          source: "navpath",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "rgba(255, 255, 255, 0.92)",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10, 6,
              18, 6,
              20, 7,
              21, 8,
              22, 11,
            ],
          },
        });

        map.current.addLayer({
          id: "navpath-layer",
          type: "line",
          source: "navpath",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#017ED7",
            "line-dasharray": [2, 1.5],
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10, 3.5,
              18, 3.5,
              20, 4,
              21, 5,
              22, 7.5,
            ],
          },
        });
      }
    };

    if (map.current.isStyleLoaded()) {
      handleStyleLoad();
    }
    map.current.on("style.load", handleStyleLoad);

    return () => {
      if (map.current) {
        map.current.off("style.load", handleStyleLoad);
      }
    };
  }, [map]);

  // Take you to selected FOD location on toggle
  useEffect(() => {
    if (!map || !map.current) return;

    const validatedSelfLocation = validateSelfLocation(selfLocation);
    const selectedFodLocation = validateSelectedFodLocation(selectedFod);

    try {
      const linesSource = map.current.getSource("navpath");
      if (linesSource) {
        if (validatedSelfLocation && selectedFodLocation && selectedFod) {
          linesSource.setData({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { index: 0 },
                geometry: {
                  type: "LineString",
                  coordinates: [
                    validatedSelfLocation.coord,
                    selectedFodLocation,
                  ],
                },
              },
            ],
          });
        } else {
          linesSource.setData({
            type: "FeatureCollection",
            features: [],
          });
        }
      }
    } catch (error) {
      console.warn("error in plotting nav line ", error);
    }

    if (!isFodTrackON) return;

    if (selectedFodLocation && !validatedSelfLocation) {
      const target = { center: selectedFodLocation };
      jump_target(target);
    } else if (!selectedFodLocation && validatedSelfLocation) {
      const target = { center: validatedSelfLocation.coord };
      jump_target(target);
    } else if (selectedFodLocation && validatedSelfLocation) {
      map.current.fitBounds(
        [selectedFodLocation, validatedSelfLocation.coord],
        {
          padding: {
            top: 100,
            bottom: 100,
            left: 100,
            right: 150,
          },
          linear: true,
        }
      );
    }
  }, [isFodTrackON, selectedFod, selfLocation, map]);

  // Update heading on toggle (uses live magnetometer when connected, otherwise GNSS heading)
  useEffect(() => {
    if (!map || !map.current || !isHeadingTrackON) return;

    const magData = magnetometer?.data as any;
    const magHeading =
      magData?.connected && typeof magData?.heading === "number"
        ? magData.heading
        : null;
    const rtkHeading =
      typeof (selfLocation as any)?.heading === "number"
        ? (selfLocation as { heading: number }).heading
        : null;
    const liveHeading = magHeading ?? rtkHeading;
    if (liveHeading === null || !Number.isFinite(liveHeading)) return;

    const validatedSelfLocation = validateSelfLocation(
      selfLocation as { heading: number }
    );

    if (validatedSelfLocation) {
      jump_target({
        center: validatedSelfLocation.coord,
        bearing: liveHeading,
      });
    } else if (map.current.dragPan.isActive()) {
      map.current.easeTo({
        bearing: liveHeading,
        duration: 250,
        essential: true,
      });
    }
  }, [isHeadingTrackON, selfLocation, magnetometer, map]);

  // Sync zoom state with map
  useEffect(() => {
    if (!map || !map.current) return;

    const handleZoom = () => {
      setZoom(map.current.getZoom());
    };

    map.current.on("zoom", handleZoom);

    setZoom(map.current.getZoom());

    return () => {
      if (map.current) {
        map.current.off("zoom", handleZoom);
      }
    };
  }, [map]);

  // Toggle car path visibility
  useEffect(() => {
    if (!map || !map.current) return;

    if (map.current.getLayer("car-path")) {
      map.current.setLayoutProperty(
        "car-path",
        "visibility",
        showPath ? "visible" : "none"
      );
    }
  }, [showPath, map]);

  // Show directional off-screen HUD indicator instead of nav line when selected FOD is outside viewport
  useEffect(() => {
    if (!map || !map.current) return;

    const setNavVisibility = (visible: boolean) => {
      const vis = visible ? "visible" : "none";
      try {
        if (map.current?.getLayer("navpath-casing")) {
          map.current.setLayoutProperty("navpath-casing", "visibility", vis);
        }
        if (map.current?.getLayer("navpath-layer")) {
          map.current.setLayoutProperty("navpath-layer", "visibility", vis);
        }
      } catch {
        // ignore if style not ready
      }
    };

    const updateOffscreenIndicator = () => {
      const selectedFodLocation = validateSelectedFodLocation(selectedFod);
      if (!selectedFodLocation || !map.current) {
        setOffscreenIndicator(null);
        setNavVisibility(true);
        return;
      }

      const canvas = map.current.getCanvas();
      const width = canvas?.clientWidth || 0;
      const height = canvas?.clientHeight || 0;
      if (width <= 0 || height <= 0) {
        setOffscreenIndicator(null);
        return;
      }

      const pt = map.current.project(selectedFodLocation);
      const isVisible =
        pt.x >= 18 && pt.x <= width - 18 && pt.y >= 18 && pt.y <= height - 18;

      if (isVisible) {
        setOffscreenIndicator(null);
        setNavVisibility(true);
        return;
      }

      // FOD is off-screen: hide the line and show directional HUD indicator along viewport edge
      setNavVisibility(false);

      const cx = width / 2;
      const cy = height / 2;
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

      const minX = 40;
      const maxX = Math.max(41, width - 80);
      const minY = 72;
      const maxY = Math.max(73, height - 88);

      const tx = dx > 0 ? (maxX - cx) / dx : dx < 0 ? (minX - cx) / dx : Infinity;
      const ty = dy > 0 ? (maxY - cy) / dy : dy < 0 ? (minY - cy) / dy : Infinity;
      const t = Math.min(tx, ty);

      const x = Math.min(maxX, Math.max(minX, cx + dx * t));
      const y = Math.min(maxY, Math.max(minY, cy + dy * t));

      let distanceLabel: string | null = null;
      const validatedSelfLocation = validateSelfLocation(selfLocation);
      if (validatedSelfLocation) {
        try {
          const distM = turf.distance(
            turf.point(validatedSelfLocation.coord),
            turf.point(selectedFodLocation),
            { units: "meters" }
          );
          distanceLabel =
            distM >= 1000
              ? `${(distM / 1000).toFixed(2)} km`
              : `${Math.round(distM)} m`;
        } catch {
          distanceLabel = null;
        }
      }

      const fodNum = (selectedFod as any)?.groupId ?? (selectedFod as any)?.id;
      setOffscreenIndicator({
        x,
        y,
        angleDeg,
        distanceLabel,
        fodLabel: fodNum ? `FOD #${fodNum}` : "Target FOD",
      });
    };

    updateOffscreenIndicator();
    const events = ["move", "zoom", "rotate", "resize"];
    events.forEach((ev) => map.current.on(ev, updateOffscreenIndicator));

    return () => {
      if (map.current) {
        events.forEach((ev) => map.current.off(ev, updateOffscreenIndicator));
      }
    };
  }, [map, selectedFod, selfLocation]);

  return (
    <>
      {/* OFF-SCREEN FOD DIRECTIONAL WAYPOINT INDICATOR */}
      {offscreenIndicator && (
        <button
          type="button"
          onClick={() => {
            const target = validateSelectedFodLocation(selectedFod);
            if (target && map.current) {
              map.current.easeTo({
                center: target,
                zoom: Math.max(map.current.getZoom(), 19),
                duration: 600,
                essential: true,
              });
            }
          }}
          style={{
            left: `${offscreenIndicator.x}px`,
            top: `${offscreenIndicator.y}px`,
            transform: "translate(-50%, -50%)",
          }}
          title={`Locate ${offscreenIndicator.fodLabel}`}
          className="absolute z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/95 dark:bg-[#181C23]/95 backdrop-blur-md border-2 border-[#017ED7] shadow-[0_4px_16px_rgba(1,126,215,0.35)] hover:scale-105 active:scale-95 transition-transform cursor-pointer select-none"
        >
          <span
            className="w-5 h-5 rounded-full bg-[#017ED7] text-white flex items-center justify-center shrink-0"
            style={{
              transform: `rotate(${offscreenIndicator.angleDeg + 45}deg)`,
            }}
          >
            <Navigation className="w-3 h-3 fill-current" />
          </span>
          <div className="flex flex-col items-start leading-none text-left pr-0.5">
            <span className="text-[10px] font-bold text-slate-900 dark:text-white whitespace-nowrap">
              {offscreenIndicator.fodLabel}
            </span>
            {offscreenIndicator.distanceLabel && (
              <span className="text-[9px] font-mono font-semibold text-[#017ED7] dark:text-[#38BDF8] whitespace-nowrap mt-0.5">
                {offscreenIndicator.distanceLabel}
              </span>
            )}
          </div>
        </button>
      )}
      {/* ZOOM CONTROLS HUD - BOTTOM LEFT */}
      <div className="absolute bottom-5 left-5 z-20 flex flex-col items-center gap-1.5 select-none">
        <div className="flex flex-col bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md border border-slate-200/90 dark:border-white/15 rounded-2xl shadow-lg overflow-hidden transition-colors">
          {/* Zoom In (+) */}
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= maxZoom}
            title="Zoom in"
            className="w-10 h-10 flex items-center justify-center text-lg font-bold text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-white/15 active:scale-95 disabled:opacity-35 disabled:pointer-events-none transition-all cursor-pointer"
          >
            +
          </button>

          {/* Subtle divider + live zoom readout inside the pill */}
          <div className="px-2 py-1 border-y border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-black/25 text-[10px] font-mono font-bold text-[#4C9FE8] text-center tracking-tight">
            {zoom.toFixed(1)}x
          </div>

          {/* Zoom Out (-) */}
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= minZoom}
            title="Zoom out"
            className="w-10 h-10 flex items-center justify-center text-lg font-bold text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-white/15 active:scale-95 disabled:opacity-35 disabled:pointer-events-none transition-all cursor-pointer"
          >
            −
          </button>
        </div>
      </div>

      {/* MAP ACTION DOCK - BOTTOM RIGHT (Filter -> Locate -> Heading) */}
      <div className={`absolute bottom-5 right-5 flex items-center gap-2 p-1.5 rounded-2xl bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md border border-slate-200/90 dark:border-white/15 shadow-lg transition-colors ${isfilterboxOpen ? "z-40" : "z-20"}`}>
        {/* 1. Filter (Leftmost) */}
        <div className="relative">
          <button
            type="button"
            title="Filter FODs"
            className={`w-11 h-11 flex items-center justify-center rounded-xl filter-button transition-all active:scale-95 cursor-pointer ${
              isfilterboxOpen
                ? "bg-[#4C9FE8] text-white shadow-[0_2px_10px_rgba(76,159,232,0.45)]"
                : "bg-slate-100 hover:bg-slate-200 border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-200 dark:bg-white/10 dark:hover:bg-white/20"
            }`}
            onClick={toggle}
          >
            <SlidersHorizontal size={19} strokeWidth={2.2} />
          </button>

          {isfilterboxOpen && <FilterBox />}
        </div>

        {/* 2. Locate / FOD Tracking */}
        <button
          type="button"
          title="Track Location / FOD"
          className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all active:scale-95 cursor-pointer ${
            isFodTrackON
              ? "bg-[#4C9FE8] text-white shadow-[0_2px_10px_rgba(76,159,232,0.45)]"
              : "bg-slate-100 hover:bg-slate-200 border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-200 dark:bg-white/10 dark:hover:bg-white/20"
          }`}
          onClick={() => {
            setGoToZoom(true);
            setIsFodTrackON(!isFodTrackON);
          }}
        >
          <Crosshair size={20} strokeWidth={2.2} />
        </button>

        {/* 3. Heading */}
        <button
          type="button"
          title="Lock Heading"
          className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all active:scale-95 cursor-pointer ${
            isHeadingTrackON
              ? "bg-[#4C9FE8] shadow-[0_2px_10px_rgba(76,159,232,0.45)]"
              : "bg-slate-100 hover:bg-slate-200/80 dark:bg-white/10 dark:hover:bg-white/20"
          }`}
          onClick={() => set_isHeadingTrackON(!isHeadingTrackON)}
        >
          <Image
            src={HeadingIcon}
            alt="Heading"
            width={44}
            height={44}
            className={`translate scale-[155%] transform-origin-center transition-all ${
              isHeadingTrackON
                ? "brightness-100"
                : "brightness-0 opacity-70 dark:brightness-100 dark:opacity-100"
            }`}
          />
        </button>
      </div>
    </>
  );
};

export default MapControls;
