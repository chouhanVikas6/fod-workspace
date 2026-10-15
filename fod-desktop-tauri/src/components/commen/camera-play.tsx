import { config } from '@/config/clientConfig';
import axiosClient from '@/utils/axios';
import React from 'react'

function CamPlay({ handleClick, selectedCam }: { handleClick?: () => void; selectedCam: number }) {
  const giveMeCameraName = (id: number) => {
    let result = null;
    Object.keys(config.cameraMap).forEach((name) => {
      if (config.cameraMap[name] == id) {
        result = name;
      }
    })
    return result;
  }
  const play = () => {
    const name = giveMeCameraName(selectedCam);
    if (!!name) axiosClient({
      method: 'get',
      //the endpoint will be moved in some config file
      url: `/api/camera-feed/play/${name}`,
    })
  }
  return (
    <div data-dial-init className=" end-24 group">
      <button onClick={handleClick ?? play} type="button" data-dial-toggle="speed-dial-menu-text-inside-button" aria-controls="speed-dial-menu-text-inside-button" aria-expanded="false" className="flex items-center justify-center text-white bg-green-500 rounded-full w-14 h-14 hover:bg-green-600  focus:ring-4 focus:ring-blue-300 focus:outline-none ">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="42"
          height="42"
          fill="currentColor"
          className="text-white-400 active:text-green-200"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
        <span className="sr-only">Open actions menu</span>
      </button>
    </div>
  )
}

export default CamPlay