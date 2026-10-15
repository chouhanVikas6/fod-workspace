import React, { useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import mapboxgl from "mapbox-gl"; // eslint-disable-line import/no-webpack-loader-syntax
import { validateFodLocation } from "../../utils/MapUtils";
import { isValidLatitude, isValidLongitude } from "../../utils/FodParser";
import "mapbox-gl/dist/mapbox-gl.css";
import { RootState } from "@/store";

const ClearedReportMap = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const FodMarker = useRef(null);
  const CollectorMarker = useRef(null);
  const { fod } = useSelector((state:RootState) => state.ClearedFodDetailView);

  const validateCollectorLocation = () => {
    const collectorResponse = fod?.collectorResponse as { location?: { lat?: number; lon?: number; heading?: number } } | null;
    if (!collectorResponse?.location) return null;
    const { location } = collectorResponse;
    if (!location || typeof location !== "object") return null;
    const { lat, lon, heading } = location;
    if (isValidLatitude(lat) && isValidLongitude(lon)) {
      return { coord: [lon, lat], heading: heading || 0 };
    }
    return null;
  };

  useEffect(() => {
    if (map.current) return; // initialize map only once

    map.current = new mapboxgl.Map({
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
            id: "satellite",
            type: "raster",
            source: "satellite",
          },
        ],
      },
      zoom: 18,
      center: [76.27231992733236, 9.946394872156189],
      pitch: 0,
      dragPan: true,
    });

    map.current.setMaxPitch(0);
    map.current.setMinPitch(0);

    const kickResize = () => { try { map.current && map.current.resize(); } catch {} };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(kickResize) : null;
    if (ro && mapContainer.current) ro.observe(mapContainer.current);
    setTimeout(kickResize, 100);
    setTimeout(kickResize, 400);

    const fodLocation = validateFodLocation(fod);
    const collectorLocation = validateCollectorLocation();

    map.current.on("style.load", () => {
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
              10, 2,
              11, 2,
              12, 1,
              13, 1,
              14, 1,
              15, 1,
              16, 1.5,
              17, 1.5,
              18, 1.5,
              19, 1.5,
              20, 1.5,
              21, 1.5,
              22, 5,
            ],
          },
        });

        try {
          const linesSource = map.current.getSource("navpath");
          if (linesSource && fodLocation && collectorLocation) {
            let start_point = {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: { index: 0 },
                  geometry: {
                    type: "LineString",
                    coordinates: [collectorLocation.coord, fodLocation],
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
    });

    if (fodLocation && collectorLocation) {
      map.current.fitBounds([collectorLocation.coord, fodLocation], {
        padding: { top: 40, bottom: 40, left: 40, right: 40 },
        linear: true,
      });
    } else if (fodLocation && !collectorLocation) {
      const target = { center: fodLocation };
      map.current.easeTo({ ...target, duration: 600, essential: true });
    } else if (!fodLocation && collectorLocation) {
      const target = { center: collectorLocation.coord };
      map.current.easeTo({ ...target, duration: 600, essential: true });
    }

    if (collectorLocation) {
      if (!CollectorMarker.current) {
        const el = document.createElement("div");
        el.className = "self-icon";
        CollectorMarker.current = new mapboxgl.Marker(el);
        CollectorMarker.current.setRotationAlignment("map");
      }
      const { coord, heading } = collectorLocation;
      CollectorMarker.current.setLngLat(coord);
      CollectorMarker.current.setRotation(heading);
      CollectorMarker.current.addTo(map.current);
    }

    if (fodLocation) {
      if (!FodMarker.current) {
        const el = document.createElement("div");
        el.className = "cleared-marker";
        FodMarker.current = new mapboxgl.Marker(el);
        FodMarker.current.setRotationAlignment("map");
      }
      FodMarker.current.setLngLat(fodLocation);
      FodMarker.current.addTo(map.current);
    }

    return () => {
      if (ro) ro.disconnect();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  return (
    <div className="MapMaincontainer">
      <div ref={mapContainer} className="map-container" />
    </div>
  );
};

export default ClearedReportMap;
