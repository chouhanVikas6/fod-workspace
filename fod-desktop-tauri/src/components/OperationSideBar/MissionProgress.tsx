import { RootState } from "@/store";
import axiosClient from "@/utils/axios";
import React, { useEffect, useMemo, useState } from "react";
import {useSelector} from 'react-redux';


const formatElapsed = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const MissionProgress = () => {
  const [groupCount,setGroupCount]=useState(0);
  const {missionNumber,duration,isStart} = useSelector((state:RootState) => state.MissionState)
  // Waypoint progress is only defined for template/search-area missions; there
  // is no source for free-run missions, so this stays null ("--"). Wire to the
  // mission's waypoint field here once the template planner provides one.
  const waypoint: string | null = null;

  // duration is the elapsed-ms baseline captured at start/join; tick locally
  // from there (the vehicle accumulates authoritative time in the DB).
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    if (!missionNumber) { setElapsed(null); return; }
    const base = typeof duration === 'number' ? duration : 0;
    const joinedAt = Date.now();
    setElapsed(base);
    if (!isStart) return; // explore mode: show frozen recorded duration
    const t = setInterval(() => setElapsed(base + (Date.now() - joinedAt)), 1000);
    return () => clearInterval(t);
  }, [missionNumber, duration, isStart]);
  const fods=useSelector((state:RootState)=>state.FodReducer.fods)
  const count=useMemo(()=>{
    return fods.reduce((prvs,current)=>{
    if(current.groupStatus=='NEW')prvs++;
    return prvs;
  },0)},[fods])

  //runs on Mission change to set fodgroup count for matching to ui
  useEffect(() => {
    // Set up an interval to fetch the group count every 1.5 seconds
    const interval = setInterval(() => {
      // Use async function inside the setInterval to make the API call
      const fetchData = async () => {
        try {
          const res = await axiosClient({
            method: "GET",
            url: `/api/fod-group/count/${missionNumber}`,
          });
          setGroupCount(res?.data || 0); 
        } catch (e) {
          console.error("Error fetching group count", e);
          setGroupCount(0); // Set group count to 0 if API call fails
        }
      };

      fetchData(); // Execute the API call
    }, 3000); // 1.5 second interval

    // Clean up interval on component unmount
    return () => clearInterval(interval);
  }, [missionNumber]);
  return (
    <div className="w-full px-1 py-3 flex flex-col items-center space-y-3.5 border-t border-slate-200/80">
      <div className="flex flex-col items-center w-full">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Alerts</span>
        <span className={`font-mono font-bold text-lg leading-tight mt-0.5 ${groupCount === fods.length ? 'text-emerald-600' : 'text-amber-500'}`}>
          {count}
        </span>
      </div>
      
      <div className="flex flex-col items-center w-full px-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Mission</span>
        <span className="font-mono font-bold text-xs leading-tight mt-0.5 text-slate-700 truncate max-w-full" title={missionNumber ? String(missionNumber) : 'NA'}>
          {missionNumber ? missionNumber : 'NA'}
        </span>
      </div>

      <div className="flex flex-col items-center w-full">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Duration</span>
        <span className="font-mono font-bold text-xs leading-tight mt-0.5 text-slate-700">
          {elapsed != null ? formatElapsed(elapsed) : 'NA'}
        </span>
      </div>

      <div className="flex flex-col items-center w-full">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">WayPoint</span>
        <span className="font-mono font-bold text-xs leading-tight mt-0.5 text-slate-500">
          {waypoint ?? "--"}
        </span>
      </div>
    </div>
  );
};

export default MissionProgress;
