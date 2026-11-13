import React, { useRef, useEffect, useState, useMemo } from "react";
import mapboxgl from 'mapbox-gl'; // eslint-disable-line import/no-webpack-loader-syntax
import "mapbox-gl/dist/mapbox-gl.css";
import SelfLocation from "./selfLocation";
import FodMarkers from "./fodMarker";
import MapControls from "./mapControl";
import CarLocation from "./carLocation";
import SelectedFodDistance from "./selectedFodDistance";
import { config } from "@/config/clientConfig";
import { mapArea } from "@/helper/mapHelper";
import SelectedLineDistance from "./selectedLineDistance";

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
  const [refrenceIndex, setRefrenceIndex] = useState<number>(0);

  const linesCoordinatesData = useMemo(() => {
    return mapArea(
      config.map.boundaryPoints,
      config.map.lateraldistance,
      config.map.OFFSET,
      config.map.pathDirection || 'OPTIMAL',
      config.map.reversePath || false
    );
  }, [
    config.map.boundaryPoints,
    config.map.lateraldistance,
    config.map.OFFSET,
    config.map.pathDirection,
    config.map.reversePath,
  ]);

  const coordinates = config.map.boundaryPoints.map((point) => [
    point.lon,
    point.lat,
  ]);
  coordinates.push(coordinates[0]);

  useEffect(() => {
    if (map.current) return;

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
        center: [76.27697671171512, 9.941217376520802],
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

    map.current.on("load", () => {
      map.current.addSource("lines", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.current.addLayer({
        id: 'polygon',
        type: 'line',
        source: {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [coordinates],
            },
          },
        },
        paint: {
          'line-color': 'red',
          'line-width': 1,
        },
      });

      map.current.addLayer({
        id: "lines-layer",
        type: "line",
        source: "lines",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#ff0000",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15, 0.5,
            16, 1,
            17, 1,
            18, 3,
            19, 3,
            20, 3,
            21, 4,
            22, 7,
          ],
          "line-dasharray": [2, 3],
        },
      });

      linesCoordinatesData.forEach((lineCoordinates, index) => {
        map.current.addSource(`route${index}`, {
          type: 'geojson',
          data: {
            type: 'LineString',
            coordinates: lineCoordinates,
          },
        });

        map.current.addLayer({
          id: `route${index}`,
          type: 'line',
          source: `route${index}`,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              15, 0.5,
              16, 1,
              17, 1,
              18, 3,
              19, 3,
              20, 3,
              21, 4,
              22, 7,
            ],
            "line-dasharray": [2, 3],
          },
        });
      });

      map.current.on('click', (e: any) => {
        const bboxPadding = config.map.boundingBoxPadding;
        const bbox = [
          [e.point.x - bboxPadding, e.point.y - bboxPadding],
          [e.point.x + bboxPadding, e.point.y + bboxPadding],
        ];

        const features = map.current.queryRenderedFeatures(bbox, {
          layers: linesCoordinatesData.map((_, index) => `route${index}`),
        });

        if (features.length) {
          const clickedFeature = features[0];
          const lineIndex = parseInt(
            clickedFeature.layer.id.split('route')[1],
            10
          );
          setRefrenceIndex(lineIndex);
        }
      });
    });

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
        </>
      )}
    </div>
  );
};

export default ExploreMap;