import { startTransition, useEffect, useRef, useState } from 'react';
import getSocketServer from '@/utils/SocketClient/socketClient';
import { config } from '@/config/clientConfig';
import { useDispatch, useSelector } from 'react-redux';
import { accept_Fod, add_ToClearedFod, reject_Fod, syncFod, undo_fod } from '@/store/slices/fodReducer-slice';
import { PayloadAction } from '@reduxjs/toolkit';
import { updateSystemHealth } from '@/store/actions/systemHealth';
import { handleServerError } from '@/utils/alerts';
import { RootState } from '@/store';
//@ts-ignore
import notificationSound from '../assets/audio/notification.mp3';
import { set_Terminate } from '@/store/slices/missionState-slice';
import { toast } from 'react-toastify';

// Configuration
// Connect to the internal GUI socket server hosted by the Electron main process
// (see src/pages/api/socket.ts). NEXT_PUBLIC_SECONDARY_SERVER_URL is the ATC
// backend, which has no socket.io server — and env vars are not injected into
// the vite renderer anyway, so it resolved to "undefined/gui".
const url = `http://${config.ServerIP}:${config.ServerPort}/gui`;

interface EventHandler {
  (payload: any): void;
}

const EMPTY_HANDLERS: { [eventName: string]: EventHandler } = {};

const useSocket = (eventHandlers: { [eventName: string]: EventHandler } = EMPTY_HANDLERS) => {
  // const { isOpen, fod,isFilteredFod } = useSelector((state: RootState) => state.FodDetailedView);
  const mission = useSelector((store: any) => store.MissionState);
  const missionState = useSelector((store: RootState) => store.MissionState);
  const missionRef = useRef(mission);
  missionRef.current = mission;

  const [isConnected, setIsConnected] = useState(true);
  const dispatch = useDispatch();
  const socketClientRef = useRef<any>(null);

  useEffect(() => {
    // Initialize socket client when component mounts
    socketClientRef.current = getSocketServer(url, eventHandlers, {});
    const socketClient = socketClientRef.current;
    let timeout: NodeJS.Timeout | undefined;
    let fodFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let firstQueuedAt = 0;
    const pendingFodMap = new Map<string | number, any>();
    const FOD_DEBOUNCE_MS = 250;
    const FOD_MAX_WAIT_MS = 500;

    const flushFods = () => {
      fodFlushTimer = null;
      firstQueuedAt = 0;
      if (pendingFodMap.size === 0) return;
      const batch = Array.from(pendingFodMap.values());
      pendingFodMap.clear();
      startTransition(() => {
        dispatch(syncFod(batch));
      });
    };

    // Event handlers
    const handleFod = (payload: any) => {
      // if (missionState.missionNumber != payload.missionId) return;
      if (missionRef.current?.isNotificationOn) {
        if (!timeout) {
          timeout = setTimeout(() => {
            timeout = undefined;
            new Audio(notificationSound).play().catch(() => {});
          }, 3000);
        }

        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(500);
        }
      }
      if (!payload) return;
      const key = payload.groupId ?? payload.id ?? `ws-${pendingFodMap.size}`;
      pendingFodMap.set(key, payload);

      const now = Date.now();
      if (firstQueuedAt === 0) firstQueuedAt = now;
      const elapsed = now - firstQueuedAt;
      const delay = elapsed >= FOD_MAX_WAIT_MS ? 0 : Math.min(FOD_DEBOUNCE_MS, FOD_MAX_WAIT_MS - elapsed);
      if (fodFlushTimer !== null) clearTimeout(fodFlushTimer);
      fodFlushTimer = setTimeout(flushFods, delay);
    };

    const handleSystemHealth = (payload: PayloadAction) => {
      dispatch(updateSystemHealth(payload) as any);
    };

    const handleConnect = () => {
      console.log("Socket connected");
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log("Socket disconnected");
      setIsConnected(false);
    };

    const handleUpdates = (data: any) => {
      console.log({ useSocketData: data });
      if (data.type == 'fodGroup') {
        let { groupId, missionId, status } = data.message;
        if (!groupId && !missionId) {
          return;
        }
        const currentMissionId = missionRef.current?.missionNumber;
        if (currentMissionId && String(currentMissionId) !== String(missionId)) {
          return;
        }
        const gid = Number(groupId);
        switch (status) {
          case 'ACCEPTED':
            dispatch(accept_Fod(gid));
            break;
          case 'REJECTED':
            dispatch(reject_Fod(gid));
            break;
          case 'CLEARED':
            dispatch(add_ToClearedFod(gid));
            break;
          case 'NEW':
            dispatch(undo_fod(gid));
            break;
        }
      } else if (data.type == 'terminate') {
        const currentMissionId = missionRef.current?.missionNumber;
        const termId = data.missionNumber || data.missionId || data.message?.missionId;
        if (!termId || (currentMissionId && String(termId) === String(currentMissionId))) {
          toast.warn("Mission terminated.");
          dispatch(set_Terminate());
        }
      }
    };

    // Add event listeners
    socketClient.addEventHandler('fod', handleFod);
    socketClient.addEventHandler('health', handleSystemHealth);
    socketClient.addEventHandler('diffMissionNumber', handleServerError);
    socketClient.addEventHandler('connect', handleConnect);
    socketClient.addEventHandler('disconnect', handleDisconnect);
    socketClient.addEventHandler('update', handleUpdates);
    setIsConnected(true);

    // Clean up on unmount
    return () => {
      if (timeout) clearTimeout(timeout);
      if (fodFlushTimer !== null) clearTimeout(fodFlushTimer);
      pendingFodMap.clear();
      ['connect', 'disconnect', 'fod', 'health', 'diffMissionNumber', 'update'].forEach(event => socketClient.removeEventHandler(event));
    };
  }, [dispatch, eventHandlers]);

  return { isConnected, socketClient: socketClientRef.current };
};

export default useSocket;
