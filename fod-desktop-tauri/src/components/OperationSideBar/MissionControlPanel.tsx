import React, { useEffect } from 'react';
import MapMode from '@/assets/images/svg/MissionControl/MapMode.svg';
import SoundOn from "@/assets/images/svg/MissionControl/soundOn.svg";
import Slash from "@/assets/images/svg/MissionControl/slash.svg";
import Settings from "@/assets/images/svg/MissionControl/settings.svg";
import Line from "@/assets/images/svg/MissionControl/line.svg";
import ResumeButton from "@/assets/images/svg/MissionControl/play.svg";
import PauseButton from "@/assets/images/svg/MissionControl/pause.svg";
import Terminate from "@/assets/images/svg/MissionControl/stop.svg";
import ExitMissionIcon from "@/assets/images/svg/MissionControl/exit.svg";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch } from "@/store";
import Image from 'next/image';
import { BarLoader } from '../commen/loader';
import axiosClient from '@/utils/axios';
import { pause_resumeMission, toggleNotification } from '@/store/slices/missionState-slice';
import { exitMission, terminateMission } from '@/store/actions/MissionControls';
import { toggle_Mapview } from '@/store/slices/mapReducer-slice';
import { toast } from 'react-toastify';

const MissionControlPanel = ({ tab, setTab }) => {
  const dispatch = useDispatch<AppDispatch>();
  const mission = useSelector((store: any) => store.MissionState)
  const { isPause, isNotificationOn, isPauseLoading } = mission;

  function handleKeyDown(event: any) {
    // Check if the pressed key is F9, F7, or F4
    if (event.keyCode === 120) {
      // dispatch(toggelMapView);
    }
  }

  useEffect(() => {
    // Add event listener for key press events
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup function 
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []); //runs only once

  //mission scan status toggle api
  async function handlePlayPause() {
    try {
      let result = await axiosClient({
        method: "get",
        url: "/api/mission/toggle-scan" + `?type=${isPause ? 'resume' : 'pause'}`
      });
      if (result?.data?.data) {
        dispatch(pause_resumeMission(result.data.data=='PAUSE'))
      } else {
        // apiToMain swallows backend failures into a 200 null — surface it.
        toast.error(result?.data?.error || `Failed to ${isPause ? 'resume' : 'pause'} scan — no response from vehicle`)
      }
    } catch (e: any) {
      toast.error(e?.data?.error || `Failed to ${isPause ? 'resume' : 'pause'} scan`)
    }
  }

  async function syncPlayPause() {
    try {
      let response = await axiosClient({
        method: "get",
        url: "/api/mission/scan-status"
      })
      // scanStatus may be the car-backend envelope ({data:'PLAY'}) or a bare
      // string fallback — never assume the nested shape (background poll, no toast).
      const s = response?.data?.scanStatus;
      const scanVal = typeof s === 'string' ? s : s?.data;
      if (scanVal) {
        dispatch(pause_resumeMission(scanVal == 'PAUSE'))
      }
    } catch (e) {
      console.log('scan-status poll failed', e)
    }
  }

  useEffect(() => {
    let interval = setInterval(() => {
      syncPlayPause();
    }, 1500)
    return () => clearInterval(interval);
  }, [])

  return (
    <div className="h-1/2 w-full flex flex-col flex-nowrap justify-evenly items-center">
      <></>
      <Image className='active:scale-95' onClick={() => dispatch(toggle_Mapview())} src={MapMode} alt='' width={65} height={60} />
      <div
        onClick={() => dispatch(toggleNotification(!isNotificationOn))}
        className='cursor-pointer active:scale-95'>
        {isNotificationOn ? <Image src={SoundOn} alt='' width={40} height={40} /> :
          <div className='relative'>
            <Image src={Slash} alt='' width={40} height={40} className='absolute top-0 left-0' />
            <Image src={SoundOn} alt='' width={40} height={40} />
          </div>
        }
      </div>
      <Image onClick={() => setTab('setting')} className={`active:scale-95 ${tab == 'setting' ? "scale-110 shadow" : ""}`} src={Settings} alt='' width={40} height={40} />
      <Image src={Line} alt='' width={40} height={40} />
      <button
        onClick={handlePlayPause}
        className='relative active:scale-95 active:shadow' disabled={isPauseLoading && mission.isActive}>

        {isPauseLoading && <BarLoader />}
        {isPause ? <Image src={PauseButton} alt='' width={40} height={40} /> : <Image src={ResumeButton} alt='' width={40} height={40} />}
      </button>
      <Image className="active:scale-95" src={Terminate} alt='' width={40} height={40}
        onClick={() => mission.isActive && dispatch(terminateMission)}
      />
      <Image className="active:scale-95" src={ExitMissionIcon} alt='' width={55} height={40}
        onClick={() => dispatch(exitMission)}
      />
      <Image src={Line} alt='' width={40} height={40} />
    </div>
  );
};

export default MissionControlPanel;
