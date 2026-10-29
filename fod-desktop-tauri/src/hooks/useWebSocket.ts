import { useEffect, useRef, useState } from 'react';
import getSocketServer from '@/utils/SocketClient/socketClient';
import { config } from '@/config/clientConfig';
import { useDispatch, useSelector } from 'react-redux';
import { accept_Fod, add_ToClearedFod, pushFod, reject_Fod } from '@/store/slices/fodReducer-slice';
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

const useSocket = (eventHandlers: { [eventName: string]: EventHandler } = {}) => {
  // const { isOpen, fod,isFilteredFod } = useSelector((state: RootState) => state.FodDetailedView);
  const mission = useSelector((store: any) => store.MissionState);
  const missionState = useSelector((store: RootState) => store.MissionState);
  const missionRef = useRef(mission);
  missionRef.current = mission;

  const [isConnected, setIsConnected] = useState(false);
  const dispatch = useDispatch();
  const socketClientRef = useRef<any>(null);

  useEffect(() => {
    // Initialize socket client when component mounts
    socketClientRef.current = getSocketServer(url, eventHandlers, {});
    const socketClient = socketClientRef.current;
    let timeout: NodeJS.Timeout;
    // Event handlers
    const handleFod = (payload: PayloadAction) => {
      // if (missionState.missionNumber != payload.missionId) return;
      if (missionState.isNotificationOn) {
        timeout = setTimeout(() => {
          clearTimeout(timeout);
          new Audio(notificationSound).play();
        }, 3000)

        navigator.vibrate(500);
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
        if (currentMissionId && String(data.missionNumber) === String(currentMissionId)) {
          toast("This mission is stopped by admin, exit in 3 sec.");
          setTimeout(() => {
            dispatch(set_Terminate());
          }, 3000);
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

    // Clean up on unmount
    return () => {
      ['connect', 'disconnect', 'fod', 'health', 'diffMissionNumber', 'update'].forEach(event => socketClient.removeEventHandler(event));
    };
  }, [dispatch, eventHandlers]);

  return { isConnected, socketClient: socketClientRef.current };
};

export default useSocket;
