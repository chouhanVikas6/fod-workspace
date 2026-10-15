import { config } from '@/config/clientConfig'
import axiosClient from '@/utils/axios'
import React from 'react'

function CamPause({handleClick, selectedCam}: {handleClick?: () => void, selectedCam: number}) {
  const giveMeCameraName=(id:number)=>{
    let result=null;
    Object.keys(config.cameraMap).forEach((name)=>{
      if(config.cameraMap[name]==id){
        result= name;
      }
    })
    return result;
  }
  const pause=()=>{
    const name=giveMeCameraName(selectedCam);
    if(!!name)axiosClient({
      method: 'get',
      //the endpoint will be moved in some config file
      url: `/api/camera-feed/pause/${name}`,
  })
  }
  return (
    <div data-dial-init className=" group">
    <button onClick={handleClick ?? pause} type="button" data-dial-toggle="speed-dial-menu-text-inside-button-square" aria-controls="speed-dial-menu-text-inside-button-square" aria-expanded="false" className="flex items-center justify-center text-white bg-red-700 rounded-lg w-14 h-14 hover:bg-red-800  focus:ring-4 focus:ring-red-300 focus:outline-none ">
        <svg className="w-6 h-6 transition-transform rotate-45" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 18">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 1v16M1 9h16"/>
        </svg>
        <span className="sr-only">Open actions menu</span>
    </button>
</div>
  )
}

export default CamPause