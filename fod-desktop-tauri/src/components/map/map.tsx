import React, { useRef, useEffect, useState } from "react";
import mapboxgl from 'mapbox-gl'; // eslint-disable-line import/no-webpack-loader-syntax
import "mapbox-gl/dist/mapbox-gl.css";
import SelfLocation from "./selfLocation";
import FodMarkers from "./fodMarker";
import MapControls from "./mapControl";
import CarLocation from "./carLocation";
import SelectedFodDistance from "./selectedFodDistance";
import SelectedLineDistance from "./selectedLineDistance";
import { config } from "@/config/clientConfig";
mapboxgl.accessToken = config.map.mapboxToken || (import.meta as any).env?.VITE_MAPBOX_TOKEN || (import.meta as any).env?.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const Map = () => {
  const mapContainer = useRef<any>(null);
  const map = useRef<any>(null);
  const [isMapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (map.current) return; // initialize map only once
    map.current = new mapboxgl.Map({
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
        center: config.map.initialCenter as [number, number],
        zoom: 19, // Zoom level
      },
      attributionControl: false,
    });
    map.current.setMaxPitch(0);
    map.current.setMinPitch(0);

    const kickResize = () => { try { map.current && map.current.resize(); } catch {} };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(kickResize) : null;
    if (ro && mapContainer.current) ro.observe(mapContainer.current);
    setTimeout(kickResize, 100);
    setTimeout(kickResize, 400);

    setMapReady(true);

    // CLEANUP FUNCTION
    return () => {
      if (ro) ro.disconnect();
      if (!map.current) return;
      map.current.remove();
      map.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="absolute w-full h-full" />
      {isMapReady && map.current && (
        <>
          <FodMarkers map={map} />
          <SelfLocation map={map} />
          <CarLocation map={map} />
          <SelectedFodDistance map={map} />
          <SelectedLineDistance map={map} />
          <MapControls map={map} />
          {/* <MissedMarkers map={map}/> */}
        </>
      )}
    </div>
  );
};

export default Map;
