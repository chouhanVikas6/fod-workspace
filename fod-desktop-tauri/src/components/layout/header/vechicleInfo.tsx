import React, { useState, useEffect, useMemo } from "react";
import CarIcon from "@/assets/images/svg/header/car.svg";
import Image from "next/image";
import { useSelector } from "react-redux";
import { RootState } from "@/store";

const VehicleInfo = ({ isToolTipVisible }) => {
    const carThresholds = useMemo(() => ({
        maxSpeed: 35,
        minSpeed: 20,
        maxDeviation: 10
    }), []);

    const [showTooltipOnHover, setShowTooltipOnHover] = useState(false);
    const [showTooltipOnClick, setShowTooltipOnClick] = useState(false);

    const { data } = useSelector((state: RootState) => state.SystemHealth.carData);
    const { primary_data } = data;

    const handleHover = (val) => {
        setShowTooltipOnHover(val);
    };

    const handleClick = () => {
        setShowTooltipOnClick((prev) => !prev);
    };

    const checkSpeed = useMemo(() => {
        const { vel } = (primary_data as { vel?: number }) || { vel: 111 };
        const { maxSpeed, minSpeed } = carThresholds;

        if (!vel || vel < 0) return 'health-Status-Error';

        if (isFinite(maxSpeed)) {
            if (vel <= maxSpeed && vel >= (minSpeed || 0)) {
                return 'health-Status-Ok';
            } else if (vel < minSpeed) {
                return 'health-Status-Problem';
            } else {
                return 'health-Status-Error';
            }
        } else {
            return vel >= (minSpeed || 0) ? 'health-Status-Ok' : 'health-Status-Problem';
        }
    }, [primary_data, carThresholds]);

    const carSpeed = useMemo(() => {
        const { vel } = (primary_data as { vel?: number }) || { vel: 111 };
        if (!vel || vel < 0 || !isFinite(vel)) return "0Km/h";
        return `${Math.min(vel, 999).toFixed(0)}Km/h`;
    }, [primary_data]);

    useEffect(() => {
        if (!isToolTipVisible) {
            setShowTooltipOnClick(false);
        }
    }, [isToolTipVisible]);

    return (
        <div className="healthbar-component" onMouseEnter={() => handleHover(true)} onMouseLeave={() => handleHover(false)} onClick={handleClick}>
            <span>Vehicle</span>
            <div className='healthbar-icon'>
                <Image src={CarIcon} alt="Car" />
                <div className={`health-Status ${checkSpeed}`}></div>
            </div>
            {(showTooltipOnHover || showTooltipOnClick) && (
                <div className="tool-tip vehicle">
                    <div className="vehiclestatuscard">
                        <span className="w-[50px] text-[#717171] text-[14px] text-left">Speed</span>
                        <div className="w-[50px] text-[#717171] text-[14px] text-left">{carSpeed}</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VehicleInfo;
