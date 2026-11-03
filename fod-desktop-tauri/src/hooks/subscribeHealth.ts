import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { update_SystemHealth } from '@/store/slices/system-health-slice';
import { update_BiteState } from '@/store/slices/bite-state.slice';

export const useSSE = (url: string) => {
  const dispatch = useDispatch();

  useEffect(() => {
    let disposed = false;
    let unlistenFn: (() => void) | null = null;

    const handleData = (data: any) => {
      if (disposed || !data) return;
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (parsed) {
          dispatch(update_SystemHealth(parsed));
          if (parsed.car_health) {
            dispatch(update_BiteState({ carData: parsed.car_health }));
          }
        }
      } catch (error) {
        console.error('Error parsing health IPC data:', error);
      }
    };

    // Fetch initial state immediately via Tauri IPC
    invoke('get_health_bite_state')
      .then((initial) => {
        if (initial && typeof initial === 'object' && Object.keys(initial as object).length > 0) {
          handleData(initial);
        }
      })
      .catch(() => {});

    // Subscribe to continuous 1s Tauri IPC broadcasts
    listen('sse:health-data', (event) => {
      handleData(event.payload);
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      })
      .catch((error) => {
        console.error('Failed to subscribe to sse:health-data IPC event:', error);
      });

    return () => {
      disposed = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [dispatch, url]);

  return null;
};
