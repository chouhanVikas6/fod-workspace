import React, { useEffect, useState } from "react";

import "mapbox-gl/dist/mapbox-gl.css";

import { useSelector } from "react-redux";

import TrackIcon from "@/assets/images/svg/map/trackbutton.svg";
import FilterIcon from "@/assets/images/svg/map/filter.svg";
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

  const selectedFod = useSelector(
    (state: RootState) => state.SelectedFod.fod
  );

  const selfLocation = useSelector(
    (state: RootState) => state.SystemHealth.RtkData.data
  );

  const [zoom, setZoom] = useState(19);
  const [showPath, setShowPath] = useState(true);

  const minZoom = 15;
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

  // Initialize path layer on map init
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
          id: "navpath-layer",
          type: "line",
          source: "navpath",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#4596e6",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10, 3,
              11, 3,
              12, 3,
              13, 3,
              14, 3,
              15, 3,
              16, 3,
              17, 3,
              18, 3,
              19, 3,
              20, 3,
              21, 4,
              22, 7,
            ],
          },
        });
      }
    };

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

    if (validatedSelfLocation && selectedFodLocation) {
      try {
        const linesSource = map.current.getSource("navpath");

        if (linesSource && selectedFod) {
          const start_point = {
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
          };

          linesSource.setData(start_point);
        }
      } catch (error) {
        console.warn("error in plotting nav line ", error);
      }
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

  // Update heading on toggle
  useEffect(() => {
    if (!map || !map.current) return;

    const validatedSelfLocation = validateSelfLocation(
      selfLocation as { heading: number }
    );

    if (!validatedSelfLocation) return;

    if (isHeadingTrackON) {
      const target = {
        center: validatedSelfLocation.coord,
        bearing: (selfLocation as { heading: number }).heading,
      };

      jump_target(target);
    }
  }, [isHeadingTrackON, selfLocation, map]);

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

  return (
    <>
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
      <div className="absolute bottom-5 right-5 z-20 flex items-center gap-2 p-1.5 rounded-2xl bg-white/95 dark:bg-[#1E2228]/90 backdrop-blur-md border border-slate-200/90 dark:border-white/15 shadow-lg transition-colors">
        {/* 1. Filter (Leftmost) */}
        <div className="relative">
          <button
            type="button"
            title="Filter FODs"
            className={`w-11 h-11 flex items-center justify-center rounded-xl filter-button transition-all active:scale-95 cursor-pointer ${
              isfilterboxOpen
                ? "bg-[#4C9FE8] shadow-[0_2px_10px_rgba(76,159,232,0.45)]"
                : "bg-slate-100 hover:bg-slate-200/80 dark:bg-white/10 dark:hover:bg-white/20"
            }`}
            onClick={toggle}
          >
            <Image
              src={FilterIcon}
              alt="Filter"
              width={44}
              height={44}
              className={`translate scale-[125%] transform-origin-center transition-all ${
                isfilterboxOpen
                  ? "brightness-100"
                  : "brightness-0 opacity-70 dark:brightness-100 dark:opacity-100"
              }`}
            />
          </button>

          {isfilterboxOpen && <FilterBox />}
        </div>

        {/* 2. Locate / FOD Tracking */}
        <button
          type="button"
          title="Track Location / FOD"
          className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all active:scale-95 cursor-pointer ${
            isFodTrackON
              ? "bg-[#4C9FE8] shadow-[0_2px_10px_rgba(76,159,232,0.45)]"
              : "bg-slate-100 hover:bg-slate-200/80 dark:bg-white/10 dark:hover:bg-white/20"
          }`}
          onClick={() => {
            setGoToZoom(true);
            setIsFodTrackON(!isFodTrackON);
          }}
        >
          <Image
            src={TrackIcon}
            alt="FOD tracking"
            width={44}
            height={44}
            className={`translate scale-[140%] transform-origin-center mr-[1px] mt-[1px] transition-all ${
              isFodTrackON
                ? "brightness-100"
                : "brightness-0 opacity-70 dark:brightness-100 dark:opacity-100"
            }`}
          />
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