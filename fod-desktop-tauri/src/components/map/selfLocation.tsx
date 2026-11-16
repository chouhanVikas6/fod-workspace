import React, { useEffect, useRef } from "react";
import { validateSelfLocation } from "../../utils/MapUtils";
import { useSelector } from "react-redux";
import mapboxgl from "mapbox-gl"; // eslint-disable-line import/no-webpack-loader-syntax
import "mapbox-gl/dist/mapbox-gl.css";
import { RootState } from "@/store";

const SelfLocation = ({ map }) => {
  const self_marker = useRef<mapboxgl.Marker | null>(null);
  const selfLocation = useSelector((state: RootState) => state.SystemHealth.RtkData.data);

  // Update self location marker
  useEffect(() => {
    if (!map.current || !selfLocation) return;
    const validatedSelfLocation = validateSelfLocation(selfLocation);
    if (!validatedSelfLocation) {
      if (self_marker.current) {
        self_marker.current.remove();
        self_marker.current = null;
      }
      return;
    }

    const { coord, heading } = validatedSelfLocation;
    const fix = (selfLocation as any)?.fix || "GPS";
    const title = `Self Location: ${coord[1].toFixed(6)}, ${coord[0].toFixed(6)} (${fix})`;

    if (!self_marker.current) {
      const el = document.createElement("div");
      el.className = "self-icon";
      el.title = title;
      self_marker.current = new mapboxgl.Marker(el);
      self_marker.current.setRotationAlignment("map");
      self_marker.current.setLngLat([coord[0], coord[1]]).addTo(map.current);
    } else {
      self_marker.current.getElement().title = title;
      self_marker.current.setLngLat([coord[0], coord[1]]);
    }

    self_marker.current.setRotation(heading);
  }, [selfLocation, map]);

  useEffect(() => {
    return () => {
      if (self_marker.current) {
        self_marker.current.remove();
        self_marker.current = null;
      }
    };
  }, []);

  return null; // This component doesn't render any visible UI
};

export default SelfLocation;
