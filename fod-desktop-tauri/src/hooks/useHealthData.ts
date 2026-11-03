import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import axiosClient from '@/utils/axios';

interface HealthData {
  kafka_status: boolean;
  system_temp: number;
  type: 'car' | 'atc';
  pc_health: Array<{
    [key: string]: {
      temp: number;
      volt: number;
      connection: boolean;
      memory_gb: number;
      space_gb: number;
      devices_connected: {
        camera?: Array<{
          id: string;
          frame: string;
          status: string;
        }>;
        rtk?: {
          primary: {
            attitude: string;
            status: string;
            satellite: number;
          };
          secondary: {
            attitude: string;
            status: string;
            satellite: number;
          };
          timer_script_delay: number;
        };
        inverter?: {
          temp: number;
          voltage: number;
          battery: Array<{
            id: string;
            voltage: number;
            temperature: number;
            charge_percentage: number;
            status: string;
          }>;
        };
      };
    };
  }>;
  atc_health?: {
    pc_health: {
      temp: number;
      volt: number;
      connection: boolean;
      memory_gb: number;
      space_gb: number;
      devices_connected: Record<string, any>;
    };
    rtk: {
      attitude: string;
      status: string;
      satellite: number;
    };
  };
}

export function useHealthData() {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let unlistenFn: (() => void) | null = null;

    listen('sse:health-data', (event: any) => {
      if (disposed) return;
      try {
        const newData = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        setData(newData?.data ?? newData);
        setError(null);
        setLoading(false);
      } catch (err) {
        console.error('Error parsing health IPC data:', err);
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
        console.error('IPC health connection error:', err);
        setError('Connection error');
      });

    return () => {
      disposed = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  return {
    data,
    error,
    loading,
    refetch: async () => {
      setLoading(true);
      try {
        const res: any = await invoke('get_health_bite_state');
        setData(res?.data ?? res);
        setError(null);
      } catch (err) {
        try {
          const response = await axiosClient({ method: 'GET', url: '/api/health/health-data' });
          setData(response.data?.data ?? response.data);
          setError(null);
        } catch (innerErr) {
          setError('Failed to refetch health data');
          console.error('Error refetching data:', innerErr);
        }
      } finally {
        setLoading(false);
      }
    }
  };
}
