import { ServerBase } from '@/config/clientConfig';

// Renderer HTTP transport. Pre-Tauri this funnelled every call through an
// Electron IPC bridge exposed on `window`; the app is now a plain web page
// talking straight to the Node sidecar on ServerBase
// (http://localhost:7985 — see docs/electron-to-tauri-migration-plan.md
// Phase 1). This is the ONE place that speaks HTTP for the "REST" API; SSE
// (EventSource) and socket.io have their own clients elsewhere but also
// resolve against the same ServerBase.
//
// Contract preserved from the old IPC implementation (callers/toast layer
// depend on this exactly):
//   - success: resolves { data, status, statusText, headers, config }
//   - failure (status >= 400, or a network/parse failure): rejects with an
//     Error that also carries `.status` and `.data` (data is the parsed
//     error body, e.g. { error } / { message }, when available)

function parseBody(text: string, contentType: string): any {
  if (!text) return null;
  const looksJson = contentType.includes('application/json') || text[0] === '{' || text[0] === '[';
  if (looksJson) {
    try {
      return JSON.parse(text);
    } catch {
      // Fall through to raw text — some handlers res.end() a plain string
      // (e.g. the 405 branch) without a JSON content-type.
    }
  }
  return text;
}

export default function axiosClient(config: any): Promise<any> {
  try {
    config = config || {};
    const headers: Record<string, string> = { ...(config.headers || {}) };
    // Method names uppercased: fetch() only auto-normalises the handful of
    // standard verbs, and the sidecar route table branches on exact-case
    // req.method, so normalise explicitly rather than relying on that.
    const method = (config.method || 'GET').toString().toUpperCase();

    // Extract query parameters from URL if present
    let url = config.url || '';
    let queryParams: any = {};
    if (url.includes('?')) {
      const parts = url.split('?');
      url = parts[0];
      const queryStr = parts[1];
      queryStr.split('&').forEach((param: string) => {
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
    const fullUrl = `${ServerBase}${url}${qs ? `?${qs}` : ''}`;

    const hasBody = method !== 'GET' && method !== 'HEAD' && config.data !== undefined;
    if (hasBody && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }

    return fetch(fullUrl, {
      method,
      headers,
      body: hasBody ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : undefined,
    })
      .then(async (res: Response) => {
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();
        const data = parseBody(text, contentType);

        // Mirror axios semantics: reject on HTTP errors so call-site catches
        // actually fire. Callers read err.status and err.data ({error|message}).
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
          headers: res.headers,
          config,
        };
      })
      .catch((err: any) => {
        console.error('Error in axiosClient HTTP transport:', err);
        throw err;
      });
  } catch (err) {
    console.error('Error in axiosClient:', err);
    return Promise.reject(err);
  }
}

// A handful of legacy call sites (src/ApiCalls/LoadOperatons.js,
// src/ApiCalls/MissionControls.js) built their own axios.request(config)
// calls with a fully-qualified url instead of going through axiosClient
// above. The 'axios' npm package is not a renderer dependency post-migration
// (docs/electron-to-tauri-migration-plan.md Appendix B — it moves to the
// sidecar only), so this tiny shim preserves the same request-in
// ({method,url,headers,data}) / response-out ({status,data}, throws on
// non-2xx) shape those call sites already expect, without touching axios.
export async function rawHttpRequest(requestConfig: any): Promise<{ status: number; data: any }> {
  const { method, url, headers, data } = requestConfig || {};
  const res = await fetch(url, {
    method: (method || 'GET').toString().toUpperCase(),
    headers,
    body: data,
  });
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  const parsed = parseBody(text, contentType);

  if (!res.ok) {
    const err: any = new Error(`Request failed with status code ${res.status}`);
    err.status = res.status;
    err.data = parsed;
    throw err;
  }

  return { status: res.status, data: parsed };
}
