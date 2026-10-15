import { useState, useEffect } from 'react';
import { ServerBase } from '@/config/clientConfig';

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
    let eventSource: EventSource;

    const setupSSE = () => {
      // Create EventSource connection
      eventSource = new EventSource(`${ServerBase}/api/health/health-data`);

      // Handle incoming messages
      eventSource.onmessage = (event) => {
        try {
          const newData = JSON.parse(event.data);
          setData(newData.data);
          setError(null);
          setLoading(false);
        } catch (err) {
          console.error('Error parsing SSE data:', err);
          setError('Error processing data update');
        }
      };

      // Handle connection errors
      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err);
        setError('Connection error');
        eventSource.close();
        
        // Attempt to reconnect after a delay
        setTimeout(setupSSE, 5000);
      };
    };

    // Initial setup
    setupSSE();

    // Cleanup on unmount
    return () => {
      if (eventSource) {
        eventSource.close();
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
        const response = await fetch(`${ServerBase}/api/health/health-data`);
        const body = await response.json();
        setData(body.data);
        setError(null);
      } catch (err) {
        setError('Failed to refetch health data');
        console.error('Error refetching data:', err);
      } finally {
        setLoading(false);
      }
    }
  };
} 