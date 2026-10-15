import { RootState } from '@/store';
import { distanceBwCollectorAndFod } from '@/utils/MapUtils';
import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import { getDistance } from 'geolib';
function SelectedLineDistance({refrenceLine}) {
  const selfLocation = useSelector((state:RootState) => state.SystemHealth.RtkData.data);
    const [distanceFromSelectedFod, setSelectedFodDistance] = useState([0,0]);

    //calculate and update distance from refrence line 
    useEffect(() => {
        const typedSelfLocation = selfLocation as { lat: number; lon: number };
        if (
          typedSelfLocation &&
          typeof typedSelfLocation.lat === 'number' &&
          typeof typedSelfLocation.lon === 'number' &&
          !!refrenceLine[0] &&
          !!refrenceLine[1]
        ) {
          const distance0 = getDistance(refrenceLine[0], { latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon },0.001);
          const distance1 = getDistance(refrenceLine[1], { latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon },0.001);
          setSelectedFodDistance([distance0,distance1]);
        }
      }, [refrenceLine, selfLocation]);

  return (
    <div className="absolute top-[5px] right-[15px] h-[55px] w-[100px] bg-white z-[0] border-[1px] border-black flex flex-col  opacity-[70%] p-1">
        <div>{distanceFromSelectedFod[0].toFixed(4)}</div>
        <hr/>
        <div>{distanceFromSelectedFod[1].toFixed(4)}</div>
    </div>
  )
}

export default SelectedLineDistance