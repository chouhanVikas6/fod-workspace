import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { validateCarLocation } from "../../utils/MapUtils";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { RootState } from "@/store";

const CarLocation = ({ map }) => {
  const carMarker = useRef(null);
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

  //update vehicle location
  useEffect(() => {
    const validatedCarLocation = validateCarLocation(carLocation);
    handleCarIcon(validatedCarLocation);
  }, [carLocation, selectedQueue]);

  return null;
};

export default CarLocation;
