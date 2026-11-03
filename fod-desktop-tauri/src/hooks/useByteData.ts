import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { updateSystemHealth } from '@/store/actions/systemHealth';
import { AppDispatch } from '@/store';

export function useByteData() {
  const dispatch = useDispatch<AppDispatch>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let unlistenFn: (() => void) | null = null;

    listen('sse:health-data', (event: any) => {
      if (disposed) return;
      try {
        const newData = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        dispatch(updateSystemHealth({
          byteData: {
            data: newData,
            eventStatus: true,
            dataStatus: true
          }
        }));
        setError(null);
        setLoading(false);
      } catch (err) {
        console.error('Error parsing byte data:', err);
        setError('Error processing data update');
      }
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      })
      .catch((err) => {
        console.error('IPC connection error:', err);
        setError('Connection error');
      });

    return () => {
      disposed = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [dispatch]);

  return {
    error,
    loading,
    refetch: async () => {
      setLoading(true);
      try {
        const data = await invoke('get_health_bite_state');
        dispatch(updateSystemHealth({
          byteData: {
            data,
            eventStatus: true,
            dataStatus: true
          }
        }));
        setError(null);
      } catch (err) {
        setError('Failed to refetch byte data');
        console.error('Error refetching data:', err);
      } finally {
        setLoading(false);
      }
    }
  };
}
