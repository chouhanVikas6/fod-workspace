import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { updateSystemHealth } from '@/store/actions/systemHealth';
import { AppDispatch } from '@/store';
import { ServerBase } from '@/config/clientConfig';

export function useByteData() {
  const dispatch = useDispatch<AppDispatch>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let eventSource: EventSource;

    const setupSSE = () => {
      // Create EventSource connection
      eventSource = new EventSource(`${ServerBase}/api/bite-data`);

      // Handle incoming messages
      eventSource.onmessage = (event) => {
        try {
          const newData = JSON.parse(event.data);
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
  }, [dispatch]);

  return {
    error,
    loading,
    refetch: async () => {
      setLoading(true);
      try {
        const response = await fetch(`${ServerBase}/api/bite-data`);
        const data = await response.json();
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