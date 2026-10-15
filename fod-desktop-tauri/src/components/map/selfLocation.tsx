import React, { useEffect, useRef } from "react";
import { validateSelfLocation } from "../../utils/MapUtils";
import { useSelector } from "react-redux";
import mapboxgl from "mapbox-gl"; // eslint-disable-line import/no-webpack-loader-syntax
import "mapbox-gl/dist/mapbox-gl.css";
import { RootState } from "@/store";

const SelfLocation = ({ map }) => {
  const self_marker = useRef<mapboxgl.Marker | null>(null);
  const selfLocation = useSelector((state: RootState) => state.SystemHealth.RtkData.data);

//update self location
  useEffect(() => {
    if (!map.current || !selfLocation) return; // Ensure map and location data exist
    const validatedSelfLocation = validateSelfLocation(selfLocation);
    if (!validatedSelfLocation){
      return;
    };

    const { coord, heading } = validatedSelfLocation;
    // Initialize the marker if it doesn't exist
    if (!self_marker.current) {
      const el = document.createElement("div");
      el.className = "self-icon";
      self_marker.current = new mapboxgl.Marker(el);
      self_marker.current.setRotationAlignment("map");
      self_marker.current.setLngLat([coord[0], coord[1]]).addTo(map.current);
    }

    // Update the marker position and rotation
    self_marker.current.setLngLat([coord[0], coord[1]]).setRotation(heading).addTo(map.current);
    
   self_marker.current.setLngLat([coord[0], coord[1]]).setRotation(heading); 

  }, [selfLocation, map]);

  return null; // This component doesn't render any visible UI
};

export default SelfLocation;
