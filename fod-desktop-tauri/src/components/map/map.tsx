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
mapboxgl.accessToken = config.map.mapboxToken || (import.meta as any).env?.VITE_MAPBOX_TOKEN || (import.meta as any).env?.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const Map = () => {
  const mapContainer = useRef<any>(null);
  const map = useRef<any>(null);
  const [isMapReady, setMapReady] = useState(false);
  const [refrenceIndex, setRefrenceIndex] = useState<number>(0);
  const linesCoordinatesData = useMemo(() => {
    return mapArea(config.map.boundaryPoints, config.map.lateraldistance, config.map.OFFSET);
  }, [config.map.boundaryPoints, config.map.lateraldistance, config.map.OFFSET]);
  // Making mission polygon
  const coordinates = config.map.boundaryPoints.map(point => [point.lon, point.lat]);
  coordinates.push(coordinates[0]); // Close the polygon

  // Example MultiPolygon coordinates (array of polygons, each polygon is an array of linear rings)
  const multiPolygonCoordinates = [
    [
      [
        [76.27197793, 9.94589874],
        [76.27201364, 9.94633155],
        [76.27219814, 9.94597276],
        [76.27201829, 9.94584171],
        [76.27197793, 9.94589874],
      ],
    ],
    [
      [
        [76.278, 9.943],
        [76.279, 9.943],
        [76.279, 9.944],
        [76.278, 9.944],
        [76.278, 9.943],
      ],
    ],
  ];

  // Merge polygons using Turf.js
  // const mergedPolygon = mergePolygonJson.data;
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
        // center: [76.2673, 9.9312], // Coordinates for Kochi (Longitude, Latitude)
        center: [76.27697671171512, 9.941217376520802],
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

    // Store references to custom sources, layers, and listeners for cleanup
    const customSources: string[] = ["lines"];
    const customLayers: string[] = ["polygon", "lines-layer"];
    const routeSources: string[] = [];
    const routeLayers: string[] = [];
    const clickHandlers: ((e: any) => void)[] = [];

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

      customLayers.push('polygon');
      customLayers.push('lines-layer');

      let lineLayer = map.current.addLayer({
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
            22, 7, // Maximum line width when zoom is 22
          ],
          "line-dasharray": [2, 3],
        },
      });

      // Add arrow lines
      linesCoordinatesData.forEach((lineCoordinates, index) => {
        const routeSourceId = `route${index}`;
        const routeLayerId = `route${index}`;
        map.current.addSource(routeSourceId, {
          type: 'geojson',
          data: {
            type: 'LineString',
            coordinates: lineCoordinates,
          },
        });
        routeSources.push(routeSourceId);
        map.current.addLayer({
          id: routeLayerId,
          type: 'line',
          source: routeSourceId,
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
              22, 7, // Maximum line width when zoom is 22
            ],
            "line-dasharray": [2, 3],
          },
        });
        routeLayers.push(routeLayerId);

        // Click handler for each route layer
        const clickHandler = (e: any) => {
          let bboxPadding = config.map.boundingBoxPadding;
          const bbox = [
            [e.point.x - bboxPadding, e.point.y - bboxPadding],
            [e.point.x + bboxPadding, e.point.y + bboxPadding],
          ];
          const features = map.current.queryRenderedFeatures(bbox, {
            layers: linesCoordinatesData.map((_, idx) => `route${idx}`),
          });
          if (features.length) {
            const clickedFeature = features[0];
            const lineIndex = parseInt(clickedFeature.layer.id.split('route')[1], 10);
            console.log('Clicked Line Index:', lineIndex);
            setRefrenceIndex(lineIndex);
          }
        };
        map.current.on('click', clickHandler);
        clickHandlers.push(clickHandler);
      });
    });

    setMapReady(true);

    // CLEANUP FUNCTION
    return () => {
      if (ro) ro.disconnect();
      if (!map.current) return;
      // Remove click handlers
      clickHandlers.forEach((handler) => {
        map.current.off('click', handler);
      });
      // Remove custom route layers and sources
      routeLayers.forEach((layerId) => {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });
      routeSources.forEach((sourceId) => {
        if (map.current.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      });
      // Remove main custom layers and sources
      customLayers.forEach((layerId) => {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });
      customSources.forEach((sourceId) => {
        if (map.current.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      });
      // Remove the map instance
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
          <SelectedFodDistance  {...{ map }} />
          <SelectedLineDistance refrenceLine={linesCoordinatesData[refrenceIndex]} {...{ map }} />
          <MapControls map={map} />
          {/* <MissedMarkers map={map}/> */}
        </>
      )}
    </div>
  );
};

export default Map;