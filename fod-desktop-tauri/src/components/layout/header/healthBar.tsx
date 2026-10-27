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
    <div className="healthbar flex items-center space-x-2.5 h-full">
      {/* Communication capsule */}
      <div className="flex items-center space-x-2 px-3 py-1 bg-slate-50/90 hover:bg-slate-100/90 border border-slate-200/80 rounded-xl transition-colors">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Comm</span>
        <CommunicationInfo />
      </div>

      {/* GNSS capsule */}
      <div className="flex items-center space-x-2.5 px-3 py-1 bg-slate-50/90 hover:bg-slate-100/90 border border-slate-200/80 rounded-xl transition-colors">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">GNSS</span>
        <SelfGpsInfo isToolTipVisible={isToolTipVisible} />
        <div className="w-[1px] h-4 bg-slate-200"></div>
        <GpsInfo isToolTipVisible={isToolTipVisible} />
      </div>

      {/* Camera & AI capsule */}
      <div className="flex items-center px-3 py-1 bg-slate-50/90 hover:bg-slate-100/90 border border-slate-200/80 rounded-xl transition-colors">
        <CamerasInfo isToolTipVisible={isToolTipVisible} />
      </div>
    </div>
  );
};

export default HealthBar;