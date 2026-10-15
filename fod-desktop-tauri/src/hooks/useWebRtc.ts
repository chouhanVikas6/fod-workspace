import { useCallback, useEffect, useRef, useState } from 'react';
import getSocketServer from '@/utils/SocketClient/socketClient';
import { useDispatch, useSelector } from 'react-redux';
import { accept_Fod, add_ToClearedFod, pushFod, reject_Fod } from '@/store/slices/fodReducer-slice';
import { PayloadAction } from '@reduxjs/toolkit';
import { updateSystemHealth } from '@/store/actions/systemHealth';
import { handleServerError } from '@/utils/alerts';
import { RootState } from '@/store';
//@ts-ignore
import notificationSound from '../assets/audio/notification.mp3';

// Configuration
const url = `http://localhost:6969/broadcast`;

interface EventHandler {
  (payload: any): void;
}

const useWebRtc = (eventHandlers: { [eventName: string]: EventHandler } = {}) => {
  console.log("use broadcast was called")
  const [data, setData] = useState();
  const [isConnected, setIsConnected] = useState(false);
  const socketClientRef = useRef<any>(null);


  useEffect(() => {
    // Initialize socket client when component mounts
    socketClientRef.current = getSocketServer(url, eventHandlers, {});
    const socketClient = socketClientRef.current;
    let timeout: NodeJS.Timeout;
    // Event handlers
   


 
    // Add event listeners
    socketClient.addEventHandler('gui_frame', (message)=>setData(message));

    // Clean up on unmount
    return () => {
      ['video_frame'].forEach(event => socketClient.removeEventHandler(event));
    };
  }, [ eventHandlers]);

  return { isConnected, socketClient: socketClientRef.current,data };
};

export default useWebRtc;
