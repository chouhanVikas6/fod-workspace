import { RootState } from '@/store';
import { distanceBwCollectorAndFod } from '@/utils/MapUtils';
import { getDistance } from 'geolib';
import React, { useEffect, useRef, useState } from 'react'
import {  useSelector } from 'react-redux';

function Distance({selectedFrame}) {
    const [distance, setDistance] = useState(null);
    const {fod } = useSelector((state: RootState) => state.FodDetailedView);
    const selfLocation = useSelector((state: RootState) => state.SystemHealth.RtkData.data);
    useEffect(() => {
      const typedSelfLocation = selfLocation as { lat: number; lon: number };
      if(!!typedSelfLocation.lat && !!typedSelfLocation.lon){
        let target=!!selectedFrame?selectedFrame:fod;
        let payloadTarget={ latitude: target.location.lat, longitude: target.location.lon }
        let payloadSelf={ latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon }
          const d = getDistance(payloadTarget, payloadSelf,0.001);
          setDistance(d.toFixed(5));
      }else{
        setDistance(-1)
      }
      
    }, [selfLocation, fod]);
  return (
    <>{distance}m</>
  )
}

export default Distance