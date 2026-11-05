import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { validateCarLocation } from "../../utils/MapUtils";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { RootState } from "@/store";

const CarLocation = ({ map }) => {
  const carMarker = useRef(null);
  const [carPath, setCarPath] = useState([]);
  const carLocation = useSelector((state: RootState) => state.SystemHealth.carData.data.primary_data);
  const { selectedQueue } = useSelector((state: RootState) => state.MapReducer);

  const handleCarIcon = (CarLocation) => {
    if (CarLocation) {
      if (!carMarker.current) {
        const carElement = document.createElement("div");
        carElement.className = "car-icon";
        carMarker.current = new mapboxgl.Marker(carElement);
        carMarker.current.setRotationAlignment("map");
        carMarker.current.setLngLat(CarLocation.coord);
        carMarker.current.addTo(map.current);
      } else {
        carMarker.current.setLngLat(CarLocation.coord);
      }
      carMarker.current.setRotation(CarLocation.heading);
    }
  };
  useEffect(() => {
    const validated = validateCarLocation(carLocation);
    if (validated && Array.isArray(validated.coord) && validated.coord.length === 2) {
      setCarPath((prev) => {
        const last = prev[prev.length - 1];
        if (last && last[0] === validated.coord[0] && last[1] === validated.coord[1]) {
          return prev;
        }
        const next = prev.length >= 2000 ? [...prev.slice(prev.length - 1999), validated.coord] : [...prev, validated.coord];
        return next;
      });
    }
  }, [carLocation]);
  //update vehicle location
  useEffect(() => {
    const validatedCarLocation = validateCarLocation(carLocation);
    handleCarIcon(validatedCarLocation);
  }, [carLocation, selectedQueue]);

  useEffect(() => {
    if (!map.current || carPath.length < 2) return;

    const geojsonData = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: carPath,
      },
    };

    const existingSource = map.current.getSource('car-path') as mapboxgl.GeoJSONSource | undefined;
    if (existingSource && typeof existingSource.setData === 'function') {
      existingSource.setData(geojsonData as any);
      return;
    }

    if (map.current.getLayer('car-path')) map.current.removeLayer('car-path');
    if (map.current.getSource('car-path')) map.current.removeSource('car-path');

    map.current.addSource('car-path', {
      type: 'geojson',
      data: geojsonData as any,
    });

    map.current.addLayer({
      id: 'car-path',
      type: 'line',
      source: 'car-path',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#007bff', 'line-width': 4 },
    });
  }, [carPath, map]);

  return null;
};

export default CarLocation;
