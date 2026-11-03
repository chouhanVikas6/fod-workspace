import React, { useEffect, useState } from "react";
import FilterBar from "./filterBar";
import FodDisplay from "./fodDisplay";
import { useDispatch, useSelector } from "react-redux";
import { syncFod } from "@/store/slices/fodReducer-slice";
import FilteredFods from "./filteredFod";
import { CircleLoader } from "../commen/loader";
import { RootState } from "@/store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const FodPanel = ({ open }) => {
  const [fodLoading, setFodLoading] = useState(true);
  const missionNumber = useSelector((store: RootState) => store.MissionState.missionNumber);
  const isMapOpen = useSelector((store: RootState) => store.MapReducer.isMapOpen);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!missionNumber) return;
    let disposed = false;
    let unlistenFn: (() => void) | null = null;
    const subId = `fod-panel-${missionNumber}-${Date.now()}`;

    function getRealtimeData(data: any) {
      if (disposed) return;
      try {
        const rows = typeof data === "string" ? JSON.parse(data) : data;
        if (Array.isArray(rows)) {
          dispatch(syncFod(rows));
          setFodLoading(false);
        }
      } catch (err) {
        console.error("Failed to parse IPC retrive-data:", err);
      }
    }

    listen(`sse:retrive-data:${subId}`, (event: any) => {
      const payload = event.payload;
      if (payload?.event === "update") {
        getRealtimeData(payload.data);
      }
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenFn = unlisten;
        return invoke("start_retrive_stream", {
          subId,
          missionId: Number(missionNumber),
        });
      })
      .catch((err) => {
        console.error("IPC retrive-data stream error:", err);
      });

    return () => {
      disposed = true;
      if (unlistenFn) {
        unlistenFn();
      }
      invoke("stop_retrive_stream", { subId }).catch(() => {});
    };
  }, [dispatch, missionNumber]);

  return (
    <div className={`relative h-full w-full flex flex-col z-9 overflow-hidden ${isMapOpen || !open ? "hidden" : ""}`}>
      <div className="h-full w-full flex flex-col px-5 pt-3 pb-2 relative overflow-hidden">
        <div className="w-full shrink-0 mb-3">
          <FilterBar />
        </div>
        <div className="flex-1 w-full min-h-0 relative">
          {fodLoading ? (
            <div className="h-full w-full flex items-center justify-center">
              <CircleLoader />
            </div>
          ) : (
            <FodDisplay />
          )}
        </div>
      </div>
      <FilteredFods />
    </div>
  );
};

export default FodPanel;
