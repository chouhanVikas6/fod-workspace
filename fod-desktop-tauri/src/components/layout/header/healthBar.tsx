import React ,{useEffect,useState} from "react";
import CommunicationInfo from "./communicationInfo";
import GpsInfo from "./gpsInfo";
import CamerasInfo from "./cameraInfo";
import SelfGpsInfo from "./selfgps";
import { useSSE } from "@/hooks/subscribeHealth";
// import { useSSE } from "@/hooks/subscribeHealth";
const HealthBar = () => {
useSSE('/api/sse/health-data');
const [isToolTipVisible,setToolTipsVisibility] = useState(false);

//runs single time on render and add click event listeners
  useEffect(() => {
    const handleClickOutside = (event:any) => {
      if (!event.target.closest(".healthbar")) {
        setToolTipsVisibility(false);
      }
      else{
        setToolTipsVisibility(true);
      
      }
    };

    const handleTouchOutside = (event:any) => {
      if (!event.touches[0].target.closest(".healthbar")) {
        setToolTipsVisibility(false);
      }
      else{
        setToolTipsVisibility(true);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleTouchOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleTouchOutside);
    };
  }, []);
 


  return (
    <div className="w-full flex justify-between border-r-2 border-black">
         <div className="w-full flex space-x-1">
          <div className="my-auto font-semibold text-md">Communication</div>
         <CommunicationInfo />
         </div>
         <div className="w-full  p-2 flex items-center justify-center space-x-3 border-x-2 border-black">
          <div className="text-md font-semibold">GNSS </div>
         <SelfGpsInfo isToolTipVisible = {isToolTipVisible} />
         <div className="w-[0.5px] h-8 bg-gray-200 rounded"></div>
         <GpsInfo isToolTipVisible = {isToolTipVisible} />
         </div>
         <div className="w-full flex items-center justify-center">
         <CamerasInfo isToolTipVisible = {isToolTipVisible} />
         </div>
    </div>
  );
};

export default HealthBar;