import React, { useState, useEffect, useMemo } from "react";
import CameraIcon from "@/assets/images/svg/header/Camera.svg";
import Image from "next/image";
import { useSelector } from "react-redux";
import { config } from "@/config/clientConfig";
import { RootState } from "@/store";

const CamerasInfo = ({ isToolTipVisible }) => {
    const AI_THRESHOLD = useMemo(() => Number(process.env.AI_THRESHOLD) || 25, []);
    const [cameraDetail, setCameraDetail] = useState("");
    const [showTooltipOnHover, setShowTooltipOnHover] = useState(false);
    const [showTooltipOnClick, setShowTooltipOnClick] = useState(false);
    
    const rawHealth = useSelector((state: RootState) => state.SystemHealth.AiHealth.data);
    // Health may arrive as an array (bite SSE) or a sysid-keyed object from
    // older socket payloads — normalize so a bad shape can't crash the header.
    const health = useMemo(
        () => (Array.isArray(rawHealth) ? rawHealth : Object.values(rawHealth || {})) as Array<{ CAMERA_CONNECTION?: boolean; INTR_FPS?: number }>,
        [rawHealth]
    );

    const camStatus = useMemo(() => {
        if (!health || health.length === 0) return 'health-Status-Error';
        let hasConnectionIssue = health.some(ele => !ele?.CAMERA_CONNECTION);
        let hasLowFPSOrPause = health.some(ele => (ele?.INTR_FPS ?? 100) < AI_THRESHOLD || (ele as any)?.pause || (ele as any)?.PAUSE);
        if (hasConnectionIssue) return 'health-Status-Error';
        if (hasLowFPSOrPause) return 'health-Status-Problem';
        return 'health-Status-Ok';
    }, [health, AI_THRESHOLD]);

    useEffect(() => {
        if (!isToolTipVisible) {
            setShowTooltipOnClick(false);
        }
    }, [isToolTipVisible]);

    const fixedHealth = useMemo(() => {
        const fixed = new Array(26).fill(null);
        health.forEach((h, idx) => {
            const camId = (h as any)?.CAM_ID || (h as any)?.sysid;
            const camNum = camId && (config as any)?.cameraMap ? (config as any).cameraMap[camId] : undefined;
            if (camNum !== undefined && camNum >= 1 && camNum <= 26) {
                fixed[camNum - 1] = h;
            } else if (idx < 26 && !fixed[idx]) {
                fixed[idx] = h;
            }
        });
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
            <span className="text-md font-semibold">Camera & AI </span>
            <div className='healthbar-icon active:scale-95 '>
                <Image src={CameraIcon} alt="Camera Icon" />
                <div className={`health-Status ${camStatus}`}></div>
            </div>
            {(showTooltipOnHover || showTooltipOnClick) && (
                <div className="absolute top-12 left-[-10px] w-[280px] h-auto p-1 bg-white rounded-md text-sm z-40 shadow-md scale-110">
                    <div className="grid grid-cols-8 grid-rows-3 gap-3">
                        {fixedHealth.map((e, index) => {
                            const isPaused = Boolean((e as any)?.pause || (e as any)?.PAUSE);
                            const hasLowFPS = (e?.INTR_FPS ?? 100) < AI_THRESHOLD;
                            return (
                                <div key={index} className="flex justify-center items-center">
                                    <div 
                                        onClick={() => handleTooltipClick(e)} 
                                        className={`w-5 h-5 ${e 
                                            ? (!e?.CAMERA_CONNECTION ? "bg-red-500" 
                                              : (isPaused || hasLowFPS ? "bg-yellow-400" : "bg-green-500")) 
                                            : 'bg-gray-300'} rounded-full text-center`}
                                    >
                                        {index + 1}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {cameraDetail && <p className="whitespace-pre-wrap break-words">{cameraDetail}
                        </p>}
                </div>
            )}
        </div>
    );
};

export default CamerasInfo;
