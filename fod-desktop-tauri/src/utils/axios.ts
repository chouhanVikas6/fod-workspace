import { invoke } from '@tauri-apps/api/core';

// Renderer Tauri IPC transport.
// Replaces HTTP fetch calls to the legacy sidecar with in-process Tauri IPC
// `invoke('api_request', ...)` calls.
//
// Contract preserved for all callers and Redux/toast layers:
//   - success: resolves { data, status, statusText, headers, config }
//   - failure (status >= 400, or an IPC/parse failure): rejects with an
//     Error that also carries `.status` and `.data`

interface IpcResponse {
  status: number;
  ok: boolean;
  statusText: string;
  data: any;
  text: string;
}

export default function axiosClient(config: any): Promise<any> {
  try {
    config = config || {};
    const headers: Record<string, string> = { ...(config.headers || {}) };
    if (!headers['Authorization'] && !headers['authorization']) {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('TOKEN_KEY') : null;
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      } catch {}
    }

    const method = (config.method || 'GET').toString().toUpperCase();

    // Extract query parameters from URL if present
    let url = config.url || '';
    const queryParams: Record<string, string> = {};
    if (url.includes('?')) {
      const parts = url.split('?');
      url = parts[0];
      const queryStr = parts[1];
      queryStr.split('&').forEach((param: string) => {
        if (!param) return;
        const [key, val] = param.split('=');
        queryParams[key] = decodeURIComponent(val || '');
      });
    }

    const allParams = { ...(config.params || {}), ...queryParams };
    const search = new URLSearchParams();
    Object.keys(allParams).forEach((key) => {
      const val = allParams[key];
      if (val === undefined || val === null) return;
      search.append(key, String(val));
    });
    const qs = search.toString();
    const fullPath = `${url}${qs ? `?${qs}` : ''}`;

    const hasBody = method !== 'GET' && method !== 'HEAD' && config.data !== undefined;
    let bodyPayload: any = null;
    if (hasBody) {
      if (typeof config.data === 'string') {
        try {
          bodyPayload = JSON.parse(config.data);
        } catch {
          bodyPayload = config.data;
        }
      } else {
        bodyPayload = config.data;
      }
    }

    return invoke<IpcResponse>('api_request', {
      method,
      url: fullPath,
      headers,
      body: bodyPayload,
    })
      .then((res) => {
        const data = res.data;

        if (res.status >= 400) {
          const httpError: any = new Error(
            data?.error || data?.message || `Request failed with status ${res.status}`
          );
          httpError.status = res.status;
          httpError.data = data;
          throw httpError;
        }

        return {
          data,
          status: res.status,
          statusText: res.statusText || (res.status === 200 ? 'OK' : 'Error'),
          headers: {},
          config,
        };
      })
      .catch((err: any) => {
        console.error('Error in axiosClient Tauri IPC transport:', err);
        throw err;
      });
  } catch (err) {
    console.error('Error in axiosClient:', err);
    return Promise.reject(err);
  }
}

export async function rawHttpRequest(requestConfig: any): Promise<{ status: number; data: any }> {
  const { method, url, headers, data } = requestConfig || {};
  let bodyPayload: any = null;
  if (data !== undefined && data !== null) {
    if (typeof data === 'string') {
      try {
        bodyPayload = JSON.parse(data);
      } catch {
        bodyPayload = data;
      }
    } else {
      bodyPayload = data;
    }
  }

  const res = await invoke<IpcResponse>('api_request', {
    method: (method || 'GET').toString().toUpperCase(),
    url: url || '/',
    headers: headers || {},
    body: bodyPayload,
  });

  if (!res.ok) {
    const err: any = new Error(`Request failed with status code ${res.status}`);
    err.status = res.status;
    err.data = res.data;
    throw err;
  }

  return { status: res.status, data: res.data };
}
