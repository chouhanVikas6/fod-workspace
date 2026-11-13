import React, { useEffect, useRef, useState, startTransition } from "react";
import FilterBar from "./filterBar";
import FodDisplay from "./fodDisplay";
import { useDispatch, useSelector } from "react-redux";
import { syncFod, resetFods } from "@/store/slices/fodReducer-slice";
import { CircleLoader } from "../commen/loader";
import { RootState } from "@/store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { config } from "@/config/clientConfig";

const INGEST_CHUNK_SIZE = 2000;
const DEBOUNCE_MS = 250;
const MAX_WAIT_MS = 500;
const CHUNK_FLUSH_DELAY_MS = 100;

const FodPanel = ({ open }) => {
  const [fodLoading, setFodLoading] = useState(true);
  const [streamingCount, setStreamingCount] = useState(0);
  const missionNumber = useSelector((store: RootState) => store.MissionState.missionNumber);
  const isMapOpen = useSelector((store: RootState) => store.MapReducer.isMapOpen);
  const dispatch = useDispatch();
  const pendingMapRef = useRef<Map<string | number, any>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstQueuedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!missionNumber) return;
    dispatch(resetFods());
    setFodLoading(true);
    setStreamingCount(0);
    pendingMapRef.current.clear();
    firstQueuedAtRef.current = 0;
    let disposed = false;
    let unlistenFn: (() => void) | null = null;
    const subId = `fod-panel-${missionNumber}-${Date.now()}`;

    const clearFlushTimer = () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };

    const flushPendingChunks = () => {
      flushTimerRef.current = null;
      if (disposed) return;

      const pending = pendingMapRef.current;
      if (pending.size === 0) {
        firstQueuedAtRef.current = 0;
        setStreamingCount(0);
        return;
      }

      const chunk: any[] = [];
      for (const [key, value] of pending) {
        chunk.push(value);
        pending.delete(key);
        if (chunk.length >= INGEST_CHUNK_SIZE) break;
      }

      const remaining = pending.size;
      firstQueuedAtRef.current = remaining > 0 ? Date.now() : 0;

      startTransition(() => {
        dispatch(syncFod(chunk));
        setFodLoading(false);
        setStreamingCount(remaining);
      });

      if (remaining > 0 && !disposed) {
        flushTimerRef.current = setTimeout(flushPendingChunks, CHUNK_FLUSH_DELAY_MS);
      }
    };

    const scheduleFlush = () => {
      if (disposed) return;
      const now = Date.now();
      if (firstQueuedAtRef.current === 0) {
        firstQueuedAtRef.current = now;
      }
      const elapsed = now - firstQueuedAtRef.current;
      const delay = elapsed >= MAX_WAIT_MS ? 0 : Math.min(DEBOUNCE_MS, MAX_WAIT_MS - elapsed);

      clearFlushTimer();
      flushTimerRef.current = setTimeout(flushPendingChunks, delay);
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
          const pending = pendingMapRef.current;
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            const key = row.groupId ?? row.id ?? `idx-${i}-${pending.size}`;
            if (pending.has(key) || pending.size < maxPending) {
              pending.set(key, row);
            }
          }
          scheduleFlush();
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
      pendingMapRef.current.clear();
      firstQueuedAtRef.current = 0;
      clearFlushTimer();
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
    
    </div>
  );
};

export default FodPanel;
