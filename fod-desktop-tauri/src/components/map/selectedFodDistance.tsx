import { RootState } from '@/store';
import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import getDistance from 'geolib/es/getDistance';

function SelectedFodDistance({map}) {
  const [distance, setDistance] = useState(null);
  const {fod,selectedFrame} = useSelector((state:RootState) => state.SelectedFod);
  const selfLocation = useSelector((state:RootState) => state.SystemHealth.RtkData.data) as { lat: number; lon: number };

    const updateLine = (selfLocation, selectedFod) => {
      if (selfLocation && selectedFod && map.current.getSource("lines")) {
        const lineData = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [selfLocation.lon, selfLocation.lat], // From selfLocation
                  [selectedFod.location.lon, selectedFod.location.lat],   // To selectedFod
                ],
              },
            },
          ],
        };
        
        // Update the lines source data
        map.current.getSource("lines").setData(lineData);
      }
    };

   //render line between self location and selected fod
    useEffect(() => {
      const typedSelfLocation = selfLocation as { lat: number; lon: number };
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
          // Not a JSON string, ignore
        }
      }
      if (!!typedSelfLocation.lat && !!typedSelfLocation.lon && fodPointArr.length > 0) {
        let target = !!selectedFrame && (selectedFrame.groupId == fodPointArr[0]?.groupId) ? selectedFrame : fodPointArr[0];
        let payloadTarget = { latitude: target.location.lat, longitude: target.location.lon }
        let payloadSelf = { latitude: typedSelfLocation.lat, longitude: typedSelfLocation.lon }
        const d = getDistance(payloadTarget, payloadSelf, 0.001);
        setDistance(d.toFixed(5));
        updateLine(typedSelfLocation, target);
      } else {
        setDistance(-1)
      }
    }, [selfLocation, fod, selectedFrame]);

  return (
    <div className="absolute top-[5px] left-[5px] h-[25px] w-[100px] bg-white z-[2] border-[1px] border-black flex items-center opacity-[70%] p-[5px]">{distance}m</div>
  )
}

export default SelectedFodDistance