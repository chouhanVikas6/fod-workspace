import React, { useEffect, useState } from "react";
import FilterBar from "./filterBar";
import FodDisplay from "./fodDisplay";
import axiosClient from "@/utils/axios";
import { useDispatch, useSelector } from "react-redux";
import { syncFod } from "@/store/slices/fodReducer-slice";
import FilteredFods from "./filteredFod";
import Loader, { CircleLoader } from "../commen/loader";
import { RootState } from "@/store";
import { toast } from "react-toastify";
import { ServerBase } from "@/config/clientConfig";

const FodPanel = ({ open }) => {
  const [fodLoading, setFodLoading] = useState(true);
  const missionNumber = useSelector((store: RootState) => store.MissionState.missionNumber);
  const isMapOpen = useSelector((store: RootState) => store.MapReducer.isMapOpen);
  const dispatch = useDispatch();
  //this will update data if mission changes
  useEffect(() => {
    if (!missionNumber) return;
    let sse: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let disconnectToastShown = false; // one warning per disconnect burst

    function getRealtimeData(data) {
      try {
        dispatch(syncFod(data));  // assuming you're syncing here
        setFodLoading(false);
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
      }
    }

    const connect = () => {
      if (disposed) return;
      sse = new EventSource(`${ServerBase}/api/sse/retrive-data?id=${missionNumber}`,
        { withCredentials: true });

      sse.addEventListener("update", (e: Event) => {
        getRealtimeData(JSON.parse((e as MessageEvent).data));
      });

      sse.onopen = () => {
        // Connected (or reconnected): allow the next disconnect to warn again.
        disconnectToastShown = false;
      };

      sse.onmessage = e => getRealtimeData(JSON.parse(e.data));

      sse.onerror = (err) => {
        console.error("SSE connection error:", err);
        if (!disconnectToastShown) {
          toast.warn('Live FOD stream disconnected — reconnecting…');
          disconnectToastShown = true;
        }
        sse?.close();
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      sse?.close();
    };
  }, [dispatch, missionNumber])

  console.log("Spinning FodPanel")
  return (
    <div className={`relative h-full w-full flex justify-center items-center border z-9 ${isMapOpen || !open ? "hidden" : ""}`} >
      <div className="relative h-full w-full flex justify-center items-center">
        <div className="absolute left-[6vw] h-[90%] w-[85%] flex flex-wrap ">
          <FilterBar />
          {fodLoading ? <CircleLoader /> : <FodDisplay />}
        </div>
      </div>
      <FilteredFods />
    </div>
  );
}

export default FodPanel;
