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
    if (carLocation && typeof carLocation === 'object' && 'coord' in carLocation) {
      setCarPath(prev => [...prev, carLocation.coord]);
    }
  }, [carLocation]);
  //update vehicle location
  useEffect(() => {
    const validatedCarLocation = validateCarLocation(carLocation);
    handleCarIcon(validatedCarLocation);
  }, [carLocation, selectedQueue]);

  useEffect(() => {
    if (!map.current || carPath.length < 2) return;
  
    // Remove existing path layer/source if present
    if (map.current.getLayer('car-path')) map.current.removeLayer('car-path');
    if (map.current.getSource('car-path')) map.current.removeSource('car-path');
  
    map.current.addSource('car-path', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: carPath,
        },
      },
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
