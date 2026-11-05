import React, { useEffect, useRef, useState, startTransition } from "react";
import FilterBar from "./filterBar";
import FodDisplay from "./fodDisplay";
import { useDispatch, useSelector } from "react-redux";
import { syncFod, resetFods } from "@/store/slices/fodReducer-slice";
import FilteredFods from "./filteredFod";
import { CircleLoader } from "../commen/loader";
import { RootState } from "@/store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { config } from "@/config/clientConfig";

const INGEST_CHUNK_SIZE = 1250;

const FodPanel = ({ open }) => {
  const [fodLoading, setFodLoading] = useState(true);
  const [streamingCount, setStreamingCount] = useState(0);
  const missionNumber = useSelector((store: RootState) => store.MissionState.missionNumber);
  const isMapOpen = useSelector((store: RootState) => store.MapReducer.isMapOpen);
  const dispatch = useDispatch();
  const pendingQueueRef = useRef<any[]>([]);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!missionNumber) return;
    dispatch(resetFods());
    setFodLoading(true);
    setStreamingCount(0);
    pendingQueueRef.current = [];
    let disposed = false;
    let unlistenFn: (() => void) | null = null;
    const subId = `fod-panel-${missionNumber}-${Date.now()}`;

    const flushPendingChunks = () => {
      rafIdRef.current = null;
      if (disposed) return;
      const queue = pendingQueueRef.current;
      if (queue.length === 0) {
        setStreamingCount(0);
        return;
      }

      const chunk = queue.splice(0, INGEST_CHUNK_SIZE);
      const remaining = queue.length;

      startTransition(() => {
        dispatch(syncFod(chunk));
        setFodLoading(false);
        setStreamingCount(remaining);
      });

      if (remaining > 0 && !disposed) {
        rafIdRef.current = window.requestAnimationFrame(flushPendingChunks);
      }
    };

    function getRealtimeData(data: any) {
      if (disposed) return;
      try {
        const rows = typeof data === "string" ? JSON.parse(data) : data;
        if (Array.isArray(rows)) {
          if (rows.length === 0) {
            setFodLoading(false);
            return;
          }
          const maxPending = config?.FodListsLimit ?? 25000;
          if (pendingQueueRef.current.length < maxPending) {
            pendingQueueRef.current.push(...rows);
          }
          if (rafIdRef.current === null) {
            rafIdRef.current = window.requestAnimationFrame(flushPendingChunks);
          }
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
      pendingQueueRef.current = [];
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (unlistenFn) {
        unlistenFn();
      }
      invoke("stop_retrive_stream", { subId }).catch(() => {});
    };
  }, [dispatch, missionNumber]);

  return (
    <div className={`relative h-full w-full flex flex-col z-9 overflow-hidden ${isMapOpen || !open ? "hidden" : ""}`}>
      <div className="h-full w-full flex flex-col px-5 pt-3 pb-2 relative overflow-hidden">
        <div className="w-full shrink-0 mb-3 flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <FilterBar />
          </div>
          {streamingCount > 0 && (
            <div className="shrink-0 mb-4 px-2.5 py-1 rounded-md bg-[#13273D] border border-[#1E90FF]/40 text-[#4CA5FF] text-[11px] font-mono font-semibold animate-pulse">
              Syncing +{streamingCount.toLocaleString()} FODs…
            </div>
          )}
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
