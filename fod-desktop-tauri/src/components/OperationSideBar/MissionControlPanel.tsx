import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";
import { BarLoader } from "../commen/loader";
import axiosClient from "@/utils/axios";
import {
  pause_resumeMission,
  toggleNotification,
} from "@/store/slices/missionState-slice";
import { exitMission, terminateMission } from "@/store/actions/MissionControls";
import { toggle_Mapview } from "@/store/slices/mapReducer-slice";
import { toast } from "react-toastify";
import {
  RxHome,
  RxSpeakerOff,
  RxGear,
  RxBell,
  RxPause,
  RxPlay,
  RxStop,
  RxExit,
  RxFileText,
} from "react-icons/rx";
import { HiOutlineMap } from "react-icons/hi";

const MissionControlPanel = ({ tab, setTab }: any) => {
  const dispatch = useDispatch<AppDispatch>();
  const mission = useSelector((store: any) => store.MissionState);
  const isMapOpen = useSelector(
    (store: RootState) => store.MapReducer.isMapOpen,
  );
  const { isPause, isNotificationOn, isPauseLoading } = mission;
  const { latency, availableCommunication } = useSelector(
    (store: RootState) => store.SystemHealth,
  );
  const isCarLive = Boolean(
    latency?.connected ||
    (availableCommunication as any[])?.some(
      (c: any) => c?.type === "car" || c?.type?.startsWith("car"),
    ),
  );

  // Keyboard shortcut listener
  useEffect(() => {
    function handleKeyDown(event: any) {
      if (event.keyCode === 120) {
        dispatch(toggle_Mapview());
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dispatch]);

  // Mission scan status toggle api
  async function handlePlayPause() {
    if (!isCarLive) {
      toast.error("Vehicle is not in communication");
      return;
    }
    try {
      let result = await axiosClient({
        method: "get",
        url:
          "/api/mission/toggle-scan" + `?type=${isPause ? "resume" : "pause"}`,
      });
      if (result?.data?.data) {
        dispatch(pause_resumeMission(result.data.data === "PAUSE"));
      } else {
        toast.error(
          result?.data?.error ||
            `Failed to ${isPause ? "resume" : "pause"} scan — no response from vehicle`,
        );
      }
    } catch (e: any) {
      toast.error(
        e?.data?.error || `Failed to ${isPause ? "resume" : "pause"} scan`,
      );
    }
  }

  async function syncPlayPause() {
    try {
      let response = await axiosClient({
        method: "get",
        url: "/api/mission/scan-status",
      });
      const s = response?.data?.scanStatus;
      const scanVal = typeof s === "string" ? s : s?.data;
      if (scanVal) {
        dispatch(pause_resumeMission(scanVal === "PAUSE"));
      }
    } catch (e) {
      console.log("scan-status poll failed", e);
    }
  }

  useEffect(() => {
    let interval = setInterval(() => {
      syncPlayPause();
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
   <div className="h-full min-h-0 w-full flex flex-col items-center justify-between py-3 bg-transparent border-t-0 mt-0">

<div className="flex flex-col items-center sm:gap-3 lg:gap-5">
      {/* 1. HOME */}
    {/* 1. HOME */}
<button
  type="button"
  onClick={() => {
    setTab("home");

    if (isMapOpen) {
      dispatch(toggle_Mapview());
    }
  }}
  title="Home"
  className={`w-14 h-14 flex flex-col items-center justify-center transition-all hover:text-white active:scale-95 cursor-pointer ${
    tab === "home" && !isMapOpen
      ? "bg-[#4C9FE8]/20 rounded-[10px] text-[#4C9FE8]"
      : "text-[#A8B0BA] hover:text-white"
  }`}
>
  <RxHome className="w-5 h-5 mb-0.5" />
  <span className="sm:text-[10px] lg:text-[12px] font-semibold tracking-wider">
    Home
  </span>
</button>

      {/* 2. SETUP */}
      <button
        type="button"
        onClick={() => setTab(tab === "setting" ? "dashboard" : "setting")}
        title="Settings"
        className={`w-14 h-14 flex flex-col items-center justify-center transition-all hover:text-white active:scale-95 cursor-pointer ${
          tab === "setting"
            ? " bg-[#4C9FE8]/20 rounded-[10px] text-[#4C9FE8] hover:text-white hover:border-[#3D4755]"
            : " text-[#A8B0BA]"
        }`}
      >
        <RxGear className="w-5 h-5 mb-0.5" />
        <span className="sm:text-[10px] lg:text-[12px] font-semibold tracking-wider">
          Setup
        </span>
      </button>

      {/* Divider */}
      <div className="w-7 h-[1px] bg-[#4A5059] my-0.5" />
      

      {/* 3. ALERTS (Active Dashboard Tab) */}
      <button
        type="button"
        onClick={() => {
          if (isMapOpen) dispatch(toggle_Mapview());
          setTab("dashboard");
        }}
        title="Live Alerts Dashboard"
        className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all hover:text-white active:scale-95 cursor-pointer ${
          tab === "dashboard" && !isMapOpen
            ? " bg-[#4C9FE8]/20 rounded-[10px] text-[#4C9FE8] hover:text-white hover:border-[#3D4755]"
            : " text-[#A8B0BA]"
        }`}
      >
        <RxBell className="w-5 h-5 mb-0.5" />
        <span className="sm:text-[10px] lg:text-[12px] font-semibold tracking-wider">
          Alerts
        </span>
      </button>

      {/* 4. MAP */}
      <button
        type="button"
        onClick={() => dispatch(toggle_Mapview())}
        title="Map Overview"
        className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 hover:text-white cursor-pointer ${
          isMapOpen
            ? " bg-[#4C9FE8]/20 rounded-[10px] text-[#4C9FE8] hover:text-white hover:border-[#3D4755]"
            : " text-[#A8B0BA]"
        }`}
      >
        <HiOutlineMap className="w-5 h-5 mb-0.5" />
        <span className="sm:text-[10px] lg:text-[12px] font-semibold tracking-wider">
          Map
        </span>
      </button>

      {/* 5. REPORTS */}
      <button
        type="button"
        onClick={() => {
          setTab("setting");
        }}
        title="Mission Reports"
        className="w-14 h-14  rounded-[10px] flex flex-col items-center justify-center text-[#A8B0BA] hover:text-white hover:border-[#3D4755] transition-all active:scale-95 cursor-pointer"
      >
        <RxFileText className="w-5 h-5 mb-0.5" />
        <span className="sm:text-[10px] lg:text-[12px] font-semibold tracking-wider">
          Reports
        </span>
      </button>

     
</div>

      
<div className="flex flex-col items-center sm:gap-3 lg:gap-5">
      {/* 6. PAUSE / RESUME */}
       {/* Divider */}
      <div className="w-7 h-[1px] bg-[#4A5059] my-0.5" />

      <button
        type="button"
        onClick={handlePlayPause}
        disabled={!isCarLive || (isPauseLoading && mission.isActive)}
        title={
          !isCarLive
            ? "Vehicle not in communication"
            : isPause
              ? "Resume scan"
              : "Pause scan"
        }
        className={`w-14 h-14 rounded-[10px] flex flex-col items-center justify-center text-[#F0B44A] hover:bg-[#F0B44A]/20 transition-all active:scale-95 cursor-pointer relative ${
          !isCarLive || (isPauseLoading && mission.isActive)
            ? "cursor-not-allowed"
            : ""
        }`}
      >
        {isPauseLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <BarLoader />
          </div>
        )}
        {isPause ? (
          <RxPlay className="w-5 h-5 mb-2 " />
        ) : (
          <RxPause className="w-5 h-5 mb-2" />
        )}
        <span className="sm:text-[10px] lg:text-[12px] font-bold uppercase tracking-wider">
          {isPause ? "PLAY" : "PAUSE"}
        </span>
      </button>

      {/* 7. STOP */}
      {/* {mission.isActive && ( */}
      <button
        type="button"
        disabled={!isCarLive}
        title={!isCarLive ? "Vehicle not in communication" : "Stop Mission"}
        onClick={() => {
          if (isCarLive) {
            dispatch(terminateMission);
          }
        }}
        className={`w-14 h-14 rounded-[10px] flex flex-col items-center justify-center text-[#FF5A6A] hover:bg-[#FF5A6A]/20 transition-all active:scale-95 cursor-pointer ${
          !isCarLive ? "cursor-not-allowed" : ""
        }`}
      >
        <RxStop className="w-5 h-5 mb-0.5" />
        <span className="sm:text-[10px] lg:text-[12px] font-semibold tracking-wider">
          STOP
        </span>
      </button>
      {/* )} */}

      {/* 8. EXIT */}
      <button
        type="button"
        onClick={() => dispatch(exitMission)}
        title="Exit Mission"
        className="w-14 h-14 rounded-[10px] flex flex-col items-center justify-center text-[#8C939C] hover:text-white hover:border-[#3D4755] transition-all active:scale-95 cursor-pointer"
      >
        <RxExit className="w-5 h-5 mb-2" />
        <span className="sm:text-[10px] lg:text-[12px] font-semibold tracking-wider">
          EXIT
        </span>
      </button>
    </div>
    </div>
  );
};

export default MissionControlPanel;

// import React, { useEffect } from 'react';
// import { useDispatch, useSelector } from "react-redux";
// import { AppDispatch, RootState } from "@/store";
// import { BarLoader } from '../commen/loader';
// import axiosClient from '@/utils/axios';
// import { pause_resumeMission, toggleNotification } from '@/store/slices/missionState-slice';
// import { exitMission, terminateMission } from '@/store/actions/MissionControls';
// import { toggle_Mapview } from '@/store/slices/mapReducer-slice';
// import { toast } from 'react-toastify';
// import {
//   RxSpeakerLoud,
//   RxSpeakerOff,
//   RxGear,
//   RxBell,
//   RxPause,
//   RxPlay,
//   RxStop,
//   RxExit,
//   RxFileText
// } from "react-icons/rx";
// import { HiOutlineMap } from "react-icons/hi";

// const MissionControlPanel = ({ tab, setTab }: any) => {
//   const dispatch = useDispatch<AppDispatch>();
//   const mission = useSelector((store: any) => store.MissionState);
//   const isMapOpen = useSelector((store: RootState) => store.MapReducer.isMapOpen);
//   const { isPause, isNotificationOn, isPauseLoading } = mission;
//   const { latency, availableCommunication } = useSelector((store: RootState) => store.SystemHealth);
//   const isCarLive = Boolean(
//     latency?.connected ||
//     (availableCommunication as any[])?.some((c: any) => c?.type === 'car' || c?.type?.startsWith('car'))
//   );

//   // Keyboard shortcut listener
//   useEffect(() => {
//     function handleKeyDown(event: any) {
//       if (event.keyCode === 120) {
//         dispatch(toggle_Mapview());
//       }
//     }
//     window.addEventListener('keydown', handleKeyDown);
//     return () => {
//       window.removeEventListener('keydown', handleKeyDown);
//     };
//   }, [dispatch]);

//   // Mission scan status toggle api
//   async function handlePlayPause() {
//     if (!isCarLive) {
//       toast.error("Vehicle is not in communication");
//       return;
//     }
//     try {
//       let result = await axiosClient({
//         method: "get",
//         url: "/api/mission/toggle-scan" + `?type=${isPause ? 'resume' : 'pause'}`
//       });
//       if (result?.data?.data) {
//         dispatch(pause_resumeMission(result.data.data === 'PAUSE'));
//       } else {
//         toast.error(result?.data?.error || `Failed to ${isPause ? 'resume' : 'pause'} scan — no response from vehicle`);
//       }
//     } catch (e: any) {
//       toast.error(e?.data?.error || `Failed to ${isPause ? 'resume' : 'pause'} scan`);
//     }
//   }

//   async function syncPlayPause() {
//     try {
//       let response = await axiosClient({
//         method: "get",
//         url: "/api/mission/scan-status"
//       });
//       const s = response?.data?.scanStatus;
//       const scanVal = typeof s === 'string' ? s : s?.data;
//       if (scanVal) {
//         dispatch(pause_resumeMission(scanVal === 'PAUSE'));
//       }
//     } catch (e) {
//       console.log('scan-status poll failed', e);
//     }
//   }

//   useEffect(() => {
//     let interval = setInterval(() => {
//       syncPlayPause();
//     }, 1500);
//     return () => clearInterval(interval);
//   }, []);

//   return (
//     <div className="w-full flex flex-col items-center gap-2.5 py-1">
//       {/* 1. SOUND */}
//       <button
//         type="button"
//         onClick={() => dispatch(toggleNotification(!isNotificationOn))}
//         title={isNotificationOn ? "Sound Alerts: ON" : "Sound Alerts: MUTED"}
//         className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
//           isNotificationOn
//             ? "border border-[#856404]/80 bg-[#22241A] text-[#FBBF24] shadow-xs"
//             : "border border-[#2B333E] bg-[#1C2129] text-[#7E8691] hover:text-white hover:border-[#3D4755]"
//         }`}
//       >
//         {isNotificationOn ? (
//           <RxSpeakerLoud className="w-5 h-5 mb-0.5" />
//         ) : (
//           <RxSpeakerOff className="w-5 h-5 mb-0.5 opacity-60" />
//         )}
//         <span className="text-[9px] font-bold uppercase tracking-wider">SOUND</span>
//       </button>

//       {/* 2. SETUP */}
//       <button
//         type="button"
//         onClick={() => setTab(tab === 'setting' ? 'dashboard' : 'setting')}
//         title="Settings"
//         className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
//           tab === 'setting'
//             ? "border-2 border-[#1E90FF] bg-[#16273B] text-[#388AEB] shadow-xs"
//             : "border border-[#2B333E] bg-[#1C2129] text-[#8C939C] hover:text-white hover:border-[#3D4755]"
//         }`}
//       >
//         <RxGear className="w-5 h-5 mb-0.5" />
//         <span className="text-[9px] font-bold uppercase tracking-wider">SETUP</span>
//       </button>

//       {/* Divider */}
//       <div className="w-7 h-[1px] bg-[#2C3440] my-0.5" />

//       {/* 3. ALERTS (Active Dashboard Tab) */}
//       <button
//         type="button"
//         onClick={() => {
//           if (isMapOpen) dispatch(toggle_Mapview());
//           setTab('dashboard');
//         }}
//         title="Live Alerts Dashboard"
//         className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
//           tab === 'dashboard' && !isMapOpen
//             ? "border-2 border-[#1E90FF] bg-[#16273B] text-[#388AEB] shadow-sm shadow-[#1E90FF]/20"
//             : "border border-[#2B333E] bg-[#1C2129] text-[#8C939C] hover:text-white hover:border-[#3D4755]"
//         }`}
//       >
//         <RxBell className="w-5 h-5 mb-0.5" />
//         <span className="text-[9px] font-bold tracking-wider">Alerts</span>
//       </button>

//       {/* 4. MAP */}
//       <button
//         type="button"
//         onClick={() => dispatch(toggle_Mapview())}
//         title="Map Overview"
//         className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
//           isMapOpen
//             ? "border-2 border-[#1E90FF] bg-[#16273B] text-[#388AEB] shadow-sm shadow-[#1E90FF]/20"
//             : "border border-[#2B333E] bg-[#1C2129] text-[#8C939C] hover:text-white hover:border-[#3D4755]"
//         }`}
//       >
//         <HiOutlineMap className="w-5 h-5 mb-0.5" />
//         <span className="text-[9px] font-bold tracking-wider">Map</span>
//       </button>

//       {/* 5. REPORTS */}
//       <button
//         type="button"
//         onClick={() => {
//           setTab('setting');
//         }}
//         title="Mission Reports"
//         className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center border border-[#2B333E] bg-[#1C2129] text-[#8C939C] hover:text-white hover:border-[#3D4755] transition-all active:scale-95 cursor-pointer"
//       >
//         <RxFileText className="w-5 h-5 mb-0.5" />
//         <span className="text-[9px] font-bold tracking-wider">Reports</span>
//       </button>

//       {/* Divider */}
//       <div className="w-7 h-[1px] bg-[#2C3440] my-0.5" />

//       {/* 6. PAUSE / RESUME */}
//       <button
//         type="button"
//         onClick={handlePlayPause}
//         disabled={!isCarLive || (isPauseLoading && mission.isActive)}
//         title={!isCarLive ? "Vehicle not in communication" : isPause ? "Resume scan" : "Pause scan"}
//         className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center border-2 border-[#F59E0B] bg-[#262115] text-[#F59E0B] hover:bg-[#332A18] transition-all active:scale-95 cursor-pointer relative ${
//           !isCarLive || (isPauseLoading && mission.isActive) ? "opacity-40 cursor-not-allowed" : ""
//         }`}
//       >
//         {isPauseLoading && <div className="absolute inset-0 flex items-center justify-center"><BarLoader /></div>}
//         {isPause ? (
//           <RxPlay className="w-5 h-5 mb-0.5" />
//         ) : (
//           <RxPause className="w-5 h-5 mb-0.5" />
//         )}
//         <span className="text-[9px] font-bold uppercase tracking-wider">{isPause ? "RESUME" : "PAUSE"}</span>
//       </button>

//       {/* 7. STOP */}
//       {mission.isActive && (
//         <button
//           type="button"
//           disabled={!isCarLive}
//           title={!isCarLive ? "Vehicle not in communication" : "Stop Mission"}
//           onClick={() => {
//             if (isCarLive) {
//               dispatch(terminateMission);
//             }
//           }}
//           className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center border-2 border-[#EF4444] bg-[#2B171A] text-[#EF4444] hover:bg-[#381B1F] transition-all active:scale-95 cursor-pointer ${
//             !isCarLive ? "opacity-40 cursor-not-allowed" : ""
//           }`}
//         >
//           <RxStop className="w-5 h-5 mb-0.5" />
//           <span className="text-[9px] font-bold uppercase tracking-wider">STOP</span>
//         </button>
//       )}

//       {/* 8. EXIT */}
//       <button
//         type="button"
//         onClick={() => dispatch(exitMission)}
//         title="Exit Mission"
//         className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center border border-[#2B333E] bg-[#1C2129] text-[#8C939C] hover:text-white hover:border-[#3D4755] transition-all active:scale-95 cursor-pointer"
//       >
//         <RxExit className="w-5 h-5 mb-0.5" />
//         <span className="text-[9px] font-bold uppercase tracking-wider">EXIT</span>
//       </button>
//     </div>
//   );
// };

// export default MissionControlPanel;
