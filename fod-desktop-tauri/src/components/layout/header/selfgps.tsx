import React, { useEffect, useState, useMemo } from "react";
import GpsIcon from "@/assets/images/svg/header/gps_health.svg";
import Image from "next/image";
import { useSelector } from "react-redux";
import GPS from "./gps";
import { RootState } from "@/store";

const SelfGpsInfo = ({ isToolTipVisible }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const { RtkData } = useSelector((state:RootState) => state.SystemHealth);

    const handleHover = (val) => setShowTooltip(val);
    const handleClick = () => setShowTooltip((prev) => !prev);

    const allGpsStatus = useMemo(() => {
        const { fix = null } = (RtkData?.data as { fix?: string }) || {};
        if (fix === "RTK") return "health-Status-Ok";
        if (fix === "GPS") return "health-Status-Problem";
        return "health-Status-Error";
    }, [RtkData]);

    useEffect(() => {
        if (!isToolTipVisible) setShowTooltip(false);
    }, [isToolTipVisible]);

    return (
        <div
            className="healthbar-component"
            onMouseEnter={() => handleHover(true)}
            onMouseLeave={() => handleHover(false)}
            onClick={handleClick}
        >
            <span className="text-sm my-auto">Tablet </span>
            <div className="healthbar-icon active:scale-95">
                <Image src={GpsIcon} alt="" />
                <div className={`health-Status ${allGpsStatus}`}></div>
            </div>
            {showTooltip && (
                <div className="tool-tip gps">
                    {RtkData.data && <GPS nodeData={RtkData.data} nodeId={'SELF'} />}
                </div>
            )}
        </div>
    );
};

export default SelfGpsInfo;
