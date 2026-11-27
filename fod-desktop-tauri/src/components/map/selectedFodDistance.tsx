import { RootState } from '@/store';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import getDistance from 'geolib/es/getDistance';
import { RxChevronDown, RxChevronUp } from 'react-icons/rx';

function SelectedFodDistance({ map }: { map?: any }) {
  const [distance, setDistance] = useState<number | string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const { fod, selectedFrame } = useSelector((state: RootState) => state.SelectedFod);
  const selfLocation = useSelector(
    (state: RootState) => state.SystemHealth.RtkData.data
  ) as { lat?: number; lon?: number };

  const updateLine = (selfLoc: any, selectedFod: any) => {
    if (selfLoc && selectedFod && map?.current?.getSource('lines')) {
      const lineData = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [selfLoc.lon, selfLoc.lat],
                [selectedFod.location.lon, selectedFod.location.lat],
              ],
            },
          },
        ],
      };

      map.current.getSource('lines').setData(lineData);
    }
  };

  useEffect(() => {
    const typedSelfLocation = selfLocation as { lat?: number; lon?: number };
    let fodPointArr: Array<{ groupId: number; location: { lat: number; lon: number } }> = [];
    if (Array.isArray(fod?.FodPoint)) {
      fodPointArr = fod.FodPoint as Array<{ groupId: number; location: { lat: number; lon: number } }>;
    } else if (typeof fod?.FodPoint === 'string') {
      try {
        const parsed = JSON.parse(fod.FodPoint);
        if (Array.isArray(parsed)) {
          fodPointArr = parsed;
        } else if (parsed && typeof parsed === 'object') {
          fodPointArr = [parsed];
        }
      } catch (e) {
        // Ignore invalid JSON
      }
    }
    if (!!typedSelfLocation?.lat && !!typedSelfLocation?.lon && fodPointArr.length > 0) {
      const target =
        !!selectedFrame && selectedFrame.groupId == fodPointArr[0]?.groupId
          ? selectedFrame
          : fodPointArr[0];
      const payloadTarget = { latitude: target.location.lat, longitude: target.location.lon };
      const payloadSelf = { latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon };
      const d = getDistance(payloadTarget, payloadSelf, 0.001);
      setDistance(d.toFixed(2));
      updateLine(typedSelfLocation, target);
    } else {
      setDistance(-1);
    }
  }, [selfLocation, fod, selectedFrame]);

  const latDisplay =
    typeof selfLocation?.lat === 'number' && isFinite(selfLocation.lat)
      ? `${selfLocation.lat.toFixed(6)}° N`
      : '0.000000° N';

  const lonDisplay =
    typeof selfLocation?.lon === 'number' && isFinite(selfLocation.lon)
      ? `${selfLocation.lon.toFixed(6)}° E`
      : '0.000000° E';

  const hasValidDistance = distance !== null && Number(distance) >= 0;

  return (
    
    <></>
  );
}

export default SelectedFodDistance;
