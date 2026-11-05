import { useEffect, useRef, useState } from 'react';
import getSocketServer from '@/utils/SocketClient/socketClient';
import { config } from '@/config/clientConfig';
import { useDispatch, useSelector } from 'react-redux';
import { accept_Fod, add_ToClearedFod, pushFod, reject_Fod, undo_fod } from '@/store/slices/fodReducer-slice';
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
    // Event handlers
    const handleFod = (payload: PayloadAction) => {
      // if (missionState.missionNumber != payload.missionId) return;
      if (missionRef.current?.isNotificationOn) {
        timeout = setTimeout(() => {
          if (timeout) clearTimeout(timeout);
          new Audio(notificationSound).play().catch(() => {});
        }, 3000);

        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(500);
        }
      }
      dispatch(pushFod(payload));
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
      ['connect', 'disconnect', 'fod', 'health', 'diffMissionNumber', 'update'].forEach(event => socketClient.removeEventHandler(event));
    };
  }, [dispatch, eventHandlers]);

  return { isConnected, socketClient: socketClientRef.current };
};

export default useSocket;
