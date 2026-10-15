import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { update_SystemHealth } from '@/store/slices/system-health-slice';
import { update_BiteState } from '@/store/slices/bite-state.slice';
import { ServerBase } from '@/config/clientConfig';

export const useSSE = (url: string) => {
  const dispatch = useDispatch();

  useEffect(() => {
    // Callers pass a path relative to the sidecar (e.g. '/api/sse/health-data').
    // Resolve it against ServerBase so this works outside the old vite dev
    // proxy — a bare page origin has no idea where :7985 is.
    const absoluteUrl = url.startsWith('/') ? `${ServerBase}${url}` : url;
    const eventSource = new EventSource(absoluteUrl, { withCredentials: true });

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data) {
          dispatch(update_SystemHealth(data));
          // car_health (temp/volt/memory/space/rtk) powers the BITE tab.
          if (data.car_health) {
            dispatch(update_BiteState({ carData: data.car_health }));
          }
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    const handleError = (error: Event) => {
      console.error('SSE Error:', error);
      eventSource.close();
    };

    // Listen for both specific events and general messages
    eventSource.addEventListener('update', handleMessage);
    eventSource.onmessage = handleMessage;
    eventSource.onerror = handleError;

    // Cleanup on unmount
    return () => {
      eventSource.removeEventListener('update', handleMessage);
      eventSource.close();
    };
  }, [dispatch, url]);
  return null;
}; 