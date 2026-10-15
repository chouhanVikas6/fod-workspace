import React, { useState, useEffect, useMemo } from "react";
import CameraIcon from "@/assets/images/svg/header/Camera.svg";
import Image from "next/image";
import { useSelector } from "react-redux";
import { config } from "@/config/clientConfig";
import { RootState } from "@/store";

const PathSelector = ({ isToolTipVisible }) => {
    const AI_THRESHOLD = useMemo(() => Number(process.env.AI_THRESHOLD) || 25, []);
    const [cameraDetail, setCameraDetail] = useState("");
    const [showTooltipOnHover, setShowTooltipOnHover] = useState(false);
    const [showTooltipOnClick, setShowTooltipOnClick] = useState(false);
    
    const health = useSelector((state: RootState) => state.SystemHealth.AiHealth.data) as Array<{ CAMERA_CONNECTION?: boolean; INTR_FPS?: number }>;

    const camStatus = useMemo(() => {
        if (!Array.isArray(health) || health.length === 0) return 'health-Status-Error';
        let hasConnectionIssue = health.some(ele => !ele.CAMERA_CONNECTION);
        let hasLowFPS = health.some(ele => (ele.INTR_FPS ?? 100) < AI_THRESHOLD);
        if (hasConnectionIssue) return 'health-Status-Error';
        if (hasLowFPS) return 'health-Status-Problem';
        return 'health-Status-Ok';
    }, [health, AI_THRESHOLD]);

    useEffect(() => {
        if (!isToolTipVisible) {
            setShowTooltipOnClick(false);
        }
    }, [isToolTipVisible]);

    const fixedHealth = useMemo(() => {
        const fixed = new Array(26).fill(null);
        if (Array.isArray(health)) {
            health.forEach((h, idx) => {
                fixed[idx] = h;
            });
        }
        return fixed;
    }, [health]);

    const handleTooltipClick = (camera) => {
        setCameraDetail(JSON.stringify(camera));
        setTimeout(() => setCameraDetail(""), 4000);
    };

    return (
        <div 
            className="healthbar-component " 
            onMouseEnter={() => setShowTooltipOnHover(true)} 
            onMouseLeave={() => setShowTooltipOnHover(false)} 
            onClick={() => setShowTooltipOnClick(prev => !prev)}
        >
            <button className={`rounded-[50%]  filter-button px-2 py-3 ${false?"bg-blue-600":"bg-gray-400"}`}  >
            <Image className="fill-white" src={CameraIcon} width={35} height={30} alt="Camera Icon" />
        </button>
           
            {(showTooltipOnHover || showTooltipOnClick) && (
                <div className="absolute -top-36 left-[-10px] w-[280px] h-auto p-1 bg-white rounded-md text-sm z-40 shadow-md scale-110">
                    <div className="grid grid-cols-8 grid-rows-3 gap-3">
                        {fixedHealth.map((e, index) => (
                            <div key={index} className="flex justify-center items-center">
                                <div 
                                    onClick={() => handleTooltipClick(e)} 
                                    className={`w-5 h-5 ${e 
                                        ? (!e.CAMERA_CONNECTION ? "bg-red-500" 
                                          : (e.INTR_FPS < AI_THRESHOLD ? "bg-yellow-400" : "bg-green-500")) 
                                        : 'bg-gray-300'} rounded-full text-center`}
                                >
                                    {index + 1}
                                </div>
                            </div>
                        ))}
                        <div className="flex w-8 h-8 items-center p-1 border border-white rounded dark:border-gray-700">
                            <input  id="bordered-checkbox-2" type="checkbox" value=""  name="bordered-checkbox" className="w-16 h-16 text-gray-600 bg-gray-100 border-gray-300 rounded focus:ring-gray-500 " checked={true}   />
                            
                        </div>
                        <label htmlFor="bordered-checkbox-2" className="w-full py-4 ms-2  font-medium text-gray-900 text-nowrap">Select All</label>
                    </div>
                    {cameraDetail && <p className="whitespace-pre-wrap break-words">{cameraDetail}
                        </p>}
                </div>
            )}
        </div>
    );
};

export default PathSelector;
