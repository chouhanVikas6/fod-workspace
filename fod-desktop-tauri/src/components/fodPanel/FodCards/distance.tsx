import React, { useEffect, useRef, useState } from 'react';
import { config } from "@/config/clientConfig";
import { useSelector } from 'react-redux';
import { distanceBwCollectorAndFod } from '@/utils/MapUtils';
import { RootState } from '@/store';
function Distance({fod}:any) {
    const { FodSize, distanceUpdatedTimeInterval } = config.FodCard;
    const [distance, setDistance] = useState<any>(null);
    const selfLocation = useSelector((state:RootState) => state.SystemHealth.RtkData.data);
    const selfLocationRef = useRef(selfLocation);
    useEffect(() => {
        const updateDistance = () => {
            const currentLocation = selfLocationRef.current;
            const distance = distanceBwCollectorAndFod(fod, currentLocation);
            setDistance(distance);
        };
    
        updateDistance(); // Call it initially to set the state immediately
        const intervalId = setInterval(updateDistance, distanceUpdatedTimeInterval || 2000);
    
        return () => clearInterval(intervalId); // Clear interval on cleanup
      }, [fod, distanceUpdatedTimeInterval]);
      useEffect(() => {
        selfLocationRef.current = selfLocation;
      }, [selfLocation]);
    return (
        <div>
            <p className="text-shadow text-sm">{distance ? distance : "N/A"}</p>
        </div>
    )
}

export default Distance