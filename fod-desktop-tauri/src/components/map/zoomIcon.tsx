import React from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { useDispatch } from "react-redux";
import Addition from "@/assets/images/svg/map/Addition.svg";
import Substract from "@/assets/images/svg/map/Substract.svg";
import Image from "next/image";

const ZoomIcon = ({ map }) => {
  const dispatch = useDispatch();

  const MapZoomIn = () => {
    if (!map) return;
    map.current.zoomIn();
  };

  const MapZoomOut = () => {
    if (!map) return;
    map.current.zoomOut();
  };

  return (
    <div className=" h-[90%] flex  items-center bg-[grey]  rounded-[10px] overflow-hidden active:scale-105">
     
      <button onClick={MapZoomIn} className="active:bg-blue-600 active:scale-95 active:shadow w-[50px] h-full pl-1">
           <Image src={Addition} height={35} width={35} alt={""} />
      </button>

      <div className="h-[60%] w-[1px] bg-gray-800"></div>

      <button className="active:bg-blue-600 active:scale-95 active:shadow w-[50px] h-full pl-2">
           <Image src={Substract} height={35} width={35} alt={""} onClick={MapZoomOut}/>
      </button>
      
     

    </div>
  );
};

export default ZoomIcon;
