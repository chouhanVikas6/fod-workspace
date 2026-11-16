import React, { useRef, useEffect, useState } from "react";
import mapboxgl from 'mapbox-gl'; // eslint-disable-line import/no-webpack-loader-syntax
import "mapbox-gl/dist/mapbox-gl.css";
import FodMarkers from "./fodMarker";
import SelfLocation from "./selfLocation";
import { config } from "@/config/clientConfig";

mapboxgl.accessToken =
  config.map.mapboxToken ||
  (import.meta as any).env?.VITE_MAPBOX_TOKEN ||
  (import.meta as any).env?.NEXT_PUBLIC_MAPBOX_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  '';

function getFodCoordinates(fod: any): [number, number] | null {
  if (!fod) return null;

  const lon = Number(
    fod.lon ?? fod.lng ?? fod.longitude ?? fod.long ?? fod.coordinates?.[0]
  );
  const lat = Number(
    fod.lat ?? fod.latitude ?? fod.coordinates?.[1]
  );

  if (!isFinite(lon) || !isFinite(lat) || (lon === 0 && lat === 0)) {
    return null;
  }

  return [lon, lat];
}

interface ExploreMapProps {
  fods?: any[];
  selectedFod?: any;
  selectedGroupId?: string | number | null;
  onSelectFod?: ((fod: any) => void) | null;
}

const ExploreMap = ({
  fods = [],
  selectedFod = null,
  selectedGroupId = null,
  onSelectFod = null,
}: ExploreMapProps) => {
  const mapContainer = useRef<any>(null);
  const map = useRef<any>(null);
  const selectedMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [isMapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (map.current) return;

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
        zoom: 19,
      },
      attributionControl: false,
    });

    map.current.setMaxPitch(0);
    map.current.setMinPitch(0);

    const kickResize = () => {
      try {
        map.current && map.current.resize();
      } catch {}
    };
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(kickResize)
        : null;
    if (ro && mapContainer.current) ro.observe(mapContainer.current);
    setTimeout(kickResize, 100);
    setTimeout(kickResize, 400);

    setMapReady(true);

    return () => {
      if (ro) ro.disconnect();
      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.remove();
        selectedMarkerRef.current = null;
      }
    };
  }, []);

  // Fly to and highlight the selected FOD with #4C9FE8
  useEffect(() => {
    if (!map.current) return;

    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove();
      selectedMarkerRef.current = null;
    }

    if (!selectedFod) return;

    const coords = getFodCoordinates(selectedFod);
    if (!coords) return;

    map.current.flyTo({
      center: coords,
      zoom: Math.max(map.current.getZoom() || 19, 20),
      duration: 650,
      essential: true,
    });

    const el = document.createElement('div');
    el.className = 'pointer-events-none flex flex-col items-center';
    const fodLabel = selectedFod.groupId ?? selectedFod.id;
    el.innerHTML = `
      <div style="
        position: relative;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          border: 2px solid #4C9FE8;
          background: rgba(76, 159, 232, 0.22);
        "></span>
        <span style="
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: #4C9FE8;
          border: 2px solid #ffffff;
          box-shadow: 0 0 8px rgba(0,0,0,0.6);
        "></span>
      </div>
      <div style="
        margin-top: 2px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(15, 23, 42, 0.88);
        color: #4C9FE8;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
        border: 1px solid rgba(76, 159, 232, 0.5);
      ">
        FOD #${fodLabel}
      </div>
    `;

    selectedMarkerRef.current = new mapboxgl.Marker({
      element: el,
      anchor: 'center',
    })
      .setLngLat(coords)
      .addTo(map.current);
  }, [selectedFod]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="absolute w-full h-full" />
      {isMapReady && map.current && (
        <>
          <FodMarkers
            map={map}
            fods={fods}
            selectedFod={selectedFod}
            selectedGroupId={selectedGroupId}
            onSelectFod={onSelectFod}
          />
          <SelfLocation map={map} />
        </>
      )}
    </div>
  );
};

export default ExploreMap;
