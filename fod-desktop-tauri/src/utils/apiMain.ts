import axios, { Method } from 'axios';
import { handleApiRequest } from '../mainApiRouter';

interface FetchOptions {
  method: Method;
  endpoint: string;
  data?: any;
  headers?: any;
  timeout?: number;
  maxBodyLength?: number;
}

async function makeRequest(baseUrl: string, options: FetchOptions) {
  const { method, endpoint, data, headers, timeout, maxBodyLength } = options;

  const config: any = {
    method,
    url: baseUrl + endpoint,
    data,
    headers,
    timeout: timeout || 10000,
    adapter: 'http',
  };

  if (maxBodyLength) {
    config.maxBodyLength = maxBodyLength;
  }

  const response = await axios(config);
  return response;
}

export async function apiToMain(options: FetchOptions) {
  const mainServer = process.env.NEXT_PUBLIC_SERVER_URL || 'http://127.0.0.1:6969';

  try {
    const response = await makeRequest(mainServer, options);
    if (response.status >= 200 && response.status < 300) {
      return response.data;
    } else {
      console.error(`Main server failed with status: ${response.status}`);
    }
  } catch (error: any) {
    console.warn(`Main server failed, falling back to local handlers: ${options.endpoint}`, error.message);
  }

  // Fallback: Invoke the local handler directly within the Electron Main process!
  try {
    console.log(`[Local Schedular Fallback] Routing ${options.method} ${options.endpoint} locally`);
    
    // Extract query parameters from endpoint if any
    let endpoint = options.endpoint;
    let queryParams: any = {};
    if (endpoint.includes('?')) {
      const parts = endpoint.split('?');
      endpoint = parts[0];
      const queryStr = parts[1];
      queryStr.split('&').forEach((param: string) => {
        const [key, val] = param.split('=');
        queryParams[key] = decodeURIComponent(val || '');
      });
    }

    const result = await handleApiRequest(
      endpoint,
      options.method,
      options.data,
      options.headers,
      queryParams
    );

    if (result.status >= 200 && result.status < 300) {
      return result.data;
    } else {
      console.error(`Local handler fallback failed with status: ${result.status}`);
    }
  } catch (error: any) {
    console.error(`Local handler fallback failed completely for: ${options.endpoint}`, error);
  }

  return null;
}
