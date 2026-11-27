import { RootState } from '@/store';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { getDistance } from 'geolib';
import { RxChevronDown, RxChevronUp } from 'react-icons/rx';

function SelectedLineDistance({ refrenceLine, map }: { refrenceLine?: any; map?: any }) {
  const selfLocation = useSelector((state: RootState) => state.SystemHealth.RtkData.data);
  const [distanceFromSelectedFod, setSelectedFodDistance] = useState<[number, number]>([0, 0]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const typedSelfLocation = selfLocation as { lat?: number; lon?: number };
    if (
      typedSelfLocation &&
      typeof typedSelfLocation.lat === 'number' &&
      typeof typedSelfLocation.lon === 'number' &&
      Array.isArray(refrenceLine) &&
      !!refrenceLine[0] &&
      !!refrenceLine[1]
    ) {
      const distance0 = getDistance(
        refrenceLine[0],
        { latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon },
        0.001
      );
      const distance1 = getDistance(
        refrenceLine[1],
        { latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon },
        0.001
      );
      setSelectedFodDistance([distance0, distance1]);
    }
  }, [refrenceLine, selfLocation]);

  const latDisplay = `${distanceFromSelectedFod[0].toFixed(6)}° N`;
  const lonDisplay = `${distanceFromSelectedFod[1].toFixed(6)}° E`;

  return (
    <></>
  );
}

export default SelectedLineDistance;
