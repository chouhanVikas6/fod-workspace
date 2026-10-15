import React, { useRef } from 'react';
import placeholder from "@/assets/images/svg/no-feed.svg"
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { config } from "@/config/clientConfig"; 


function toFixedNoRound(num, decimals) {
  const str = num.toString();
  const decimalIndex = str.indexOf('.');

  // If there's no decimal point, return the number as is
  if (decimalIndex === -1) {
    return str;
  }

  // Limit the number of decimal places without rounding
  return str.substring(0, decimalIndex + decimals + 1);
}


export default function VideoComponent({ currentLocation, selectedCam }) {
  const videoContainerRef = useRef(null);
  const imageRef = useRef(null); // Reference for the img element
  let camName = Object.keys(config.cameraMap)[selectedCam - 1];
  const fixedLocations = useSelector((state: RootState) => state.SystemHealth.camera);
  let parsedFixed = !!fixedLocations ? JSON.parse(typeof fixedLocations == "string" ? fixedLocations : JSON.stringify(fixedLocations)) : {}
  let camLocation = parsedFixed[camName] || [-1, -1];
  const distance = 0;


  return (
    <div className=''>
      <div ref={videoContainerRef}>
        <img
          // src={placeholder.src}
          className='max-h-[75vh]'
          ref={imageRef}
          alt="No Feed"
          style={{ width: '100%', height: 'auto' }} // Set styles for responsiveness
        />
      </div>
      <div className='absolute top-0 bg-gray-300 p-2'>Distance From Camera Focus: {!!distance ? distance : 0} m</div>
      <div className='absolute top-16 bg-gray-300 p-2 flex w-[600px] space-x-5'>
        <div className='flex flex-col text-3xl'>
          <div>{toFixedNoRound((parseFloat(currentLocation?.data?.lon) || -1.00), 8)}</div>
          <div>{toFixedNoRound((parseFloat(!!camLocation[1] ? camLocation[1] : -1) || -1.00), 8)}</div>
        </div>
        <div className='flex flex-col text-3xl'>
          <div>{toFixedNoRound(((parseFloat(currentLocation?.data?.lat)) || -1.00), 8)}</div>
          <div>{toFixedNoRound((parseFloat(!!camLocation[0] ? camLocation[0] : -1) || -1.00), 8)}</div>
        </div>
      </div>
    </div>
  );
};

