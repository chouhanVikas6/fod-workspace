import { RootState } from '@/store';
import { distanceBwCollectorAndFod } from '@/utils/MapUtils';
import { getDistance } from 'geolib';
import React, { useEffect, useRef, useState } from 'react'
import {  useSelector } from 'react-redux';

function Distance() {
    const [distance, setDistance] = useState(null);
    const {fod,selectedFrame} = useSelector((state: RootState) => state.SelectedFod);
    const selfLocation = useSelector((state: RootState) => state.SystemHealth.RtkData.data);
    useEffect(() => {
      const typedSelfLocation = selfLocation as { lat: number; lon: number };
      if(!!typedSelfLocation.lat && !!typedSelfLocation.lon && !!fod?.FodPoint){
        let target=!!selectedFrame?selectedFrame:fod?.FodPoint[0];
        let payloadTarget={ latitude: target.location.lat, longitude: target.location.lon }
        let payloadSelf={ latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon }
          const d = getDistance(payloadTarget, payloadSelf,0.001);
          setDistance((d*100).toFixed(2));
      }else{
        setDistance(-1)
      }
      
    }, [selfLocation, fod,selectedFrame]);
  return (
    <>{distance}cm</>
  )
}

export default Distance