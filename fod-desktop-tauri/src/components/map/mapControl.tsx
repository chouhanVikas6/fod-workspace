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

const MapControls = ({ map }) => {
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

  function toggle() {
    setisfilterboxOpen((isfilterboxOpen) => !isfilterboxOpen);
  }

  function jump_target(target) {
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

  // Custom slider handler
  const minZoom = 15;
  const maxZoom = 22;
  const sliderHeight = 160;

  // Calculate thumb position from zoom value
  const getThumbPosition = () => {
    const percent = (zoom - minZoom) / (maxZoom - minZoom);

    return sliderHeight - percent * sliderHeight;
  };

  // Calculate zoom value from mouse position
  const getZoomFromPosition = (y) => {
    const rectY = Math.max(0, Math.min(sliderHeight, y));
    const percent = 1 - rectY / sliderHeight;

    return minZoom + percent * (maxZoom - minZoom);
  };

  // Drag state
  const [dragging, setDragging] = useState(false);

  const sliderRef = React.useRef(null);

  // Mouse/touch events
  const handleSliderMouseDown = (e) => {
    setDragging(true);
    handleSliderMove(e);
    e.preventDefault();
  };

  const handleSliderMove = (e) => {
    if (!sliderRef.current) return;

    let clientY;

    if (e.touches) {
      clientY = e.touches[0].clientY;
    } else {
      clientY = e.clientY;
    }

    const rect = sliderRef.current.getBoundingClientRect();
    const y = clientY - rect.top;

    const newZoom = getZoomFromPosition(y);

    setZoom(newZoom);

    if (map && map.current) {
      map.current.setZoom(newZoom);
    }
  };

  // Handle slider dragging
  useEffect(() => {
    if (!dragging) return;

    const move = (e) => handleSliderMove(e);
    const up = () => setDragging(false);

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move);
    window.addEventListener("touchend", up);

    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [dragging]);

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
      {/* VERTICAL ZOOM SLIDER - CENTER RIGHT */}
      <div className="absolute right-6 bottom-10 -translate-y-1/2 flex flex-col items-center z-20">
        <div
          style={{
            position: "relative",
            height: sliderHeight + 20,
            width: 60,
          }}
        >
          {/* Vertical slider track */}
          <div
            ref={sliderRef}
            style={{
              position: "absolute",
              left: "50%",
              top: 10,
              transform: "translateX(-50%)",
              width: 8,
              height: sliderHeight,
              background: "rgba(25, 118, 210, 0.2)",
              borderRadius: 4,
              zIndex: 1,
              cursor: "pointer",
              touchAction: "none",
            }}
            onMouseDown={handleSliderMouseDown}
            onTouchStart={handleSliderMouseDown}
          >
            {/* Track fill */}
            <div
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: "100%",
                height: sliderHeight - getThumbPosition(),
                background: "#1976d2",
                borderRadius: 4,
              }}
            />

            {/* Slider thumb */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: "translate(-50%, 0)",
                width: 28,
                height: 12,
                borderRadius: 2,
                background: "#fff",
                border: "2px solid #1976d2",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                top: getThumbPosition() - 6,
                zIndex: 2,
                cursor: "grab",
              }}
              onMouseDown={handleSliderMouseDown}
              onTouchStart={handleSliderMouseDown}
            />
          </div>

          {/* Zoom level label */}
          <div
            className="absolute left-1/2 -bottom-8 text-xs text-gray-400 whitespace-nowrap"
            style={{
              transform: "translateX(-50%)",
            }}
          >
            Zoom: {zoom.toFixed(1)}
          </div>
        </div>
      </div>

      {/* HORIZONTAL MAP BUTTONS - BOTTOM RIGHT */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-row items-center gap-4">
        {/* Locate / FOD tracking */}
        <button
          type="button"
          className={`w-[50px] h-[50px] flex items-center justify-center rounded-full ${
            isFodTrackON ? "bg-blue-600" : "bg-gray-400"
          } active:scale-95 transition-all`}
          onClick={() => {
            setGoToZoom(true);
            setIsFodTrackON(!isFodTrackON);
          }}
        >
          <Image
            src={TrackIcon}
            alt="FOD tracking"
            width={50}
            height={50}
            className="translate scale-[150%] transform-origin-center mr-[2px] mt-[2px]"
          />
        </button>

        {/* Heading */}
        <button
          type="button"
          className={`w-[50px] h-[50px] flex items-center justify-center rounded-full ${
            isHeadingTrackON ? "bg-blue-600" : "bg-gray-400"
          } active:scale-95 transition-all`}
          onClick={() => set_isHeadingTrackON(!isHeadingTrackON)}
        >
          <Image
            src={HeadingIcon}
            alt="Heading"
            width={50}
            height={50}
            className="translate scale-[170%] transform-origin-center"
          />
        </button>

        {/* Filter */}
        <div className="relative">
          <button
            type="button"
            className={`w-[50px] h-[50px] flex items-center justify-center rounded-full filter-button ${
              isfilterboxOpen ? "bg-blue-600" : "bg-gray-400"
            } active:scale-95 transition-all`}
            onClick={toggle}
          >
            <Image
              src={FilterIcon}
              alt="Filter"
              width={50}
              height={50}
              className="translate scale-[130%] transform-origin-center"
            />
          </button>

          {isfilterboxOpen && <FilterBox />}
        </div>
      </div>
    </>
  );
};

export default MapControls;