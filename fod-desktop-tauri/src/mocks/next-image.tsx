import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const MAX_CACHE_SIZE = 300;
const MAX_MISSING_CACHE_SIZE = 5000;
const imageCache = new Map<string, string>();
const missingImageCache = new Set<string>();

function cacheSet(key: string, val: string) {
  if (imageCache.size >= MAX_CACHE_SIZE) {
    const oldest = imageCache.keys().next().value;
    if (oldest) imageCache.delete(oldest);
  }
  imageCache.set(key, val);
}

function cacheSetMissing(key: string) {
  if (missingImageCache.size >= MAX_MISSING_CACHE_SIZE) {
    const oldest = missingImageCache.values().next().value;
    if (oldest) missingImageCache.delete(oldest);
  }
  missingImageCache.add(key);
}

const MAX_CONCURRENT_REQUESTS = 6;
let activeRequests = 0;

interface QueuedTask {
  cancelled: boolean;
  execute: () => void;
}

const requestQueue: QueuedTask[] = [];

function pumpQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
    const next = requestQueue.shift();
    if (next && !next.cancelled) {
      next.execute();
    }
  }
}

function enqueueImageRequest<T>(fn: () => Promise<T>): { promise: Promise<T>; cancel: () => void } {
  let taskRef: QueuedTask | null = null;

  const promise = new Promise<T>((resolve, reject) => {
    const execute = () => {
      activeRequests++;
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeRequests--;
          pumpQueue();
        });
    };

    if (activeRequests < MAX_CONCURRENT_REQUESTS) {
      execute();
    } else {
      taskRef = { cancelled: false, execute };
      requestQueue.push(taskRef);
    }
  });

  const cancel = () => {
    if (taskRef) {
      taskRef.cancelled = true;
      const idx = requestQueue.indexOf(taskRef);
      if (idx !== -1) {
        requestQueue.splice(idx, 1);
      }
    }
  };

  return { promise, cancel };
}

function isHexSha256(str: string): boolean {
  const clean = str.replace(/\.jpg$/i, '').trim();
  return /^[0-9a-fA-F]{64}$/.test(clean);
}

function needsIpcResolution(src: unknown): src is string {
  if (typeof src !== 'string' || !src) return false;
  if (src.startsWith('data:') || src.startsWith('blob:')) return false;
  // Bundled static frontend assets (e.g. SVG icons or assets in /src/assets or /assets) are never camera FOD images
  if (
    src.includes('/assets/') ||
    src.startsWith('/src/') ||
    src.endsWith('.svg') ||
    src.includes('.svg?')
  ) {
    return false;
  }
  if (src.includes('/images/')) return true;
  if (isHexSha256(src)) return true;
  return false;
}

// 1x1 transparent GIF fallback so WebKit never fires a failed resource load
const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const Image = ({ src, alt, className, width, height, onClick, style, draggable, onError, ...rest }: any) => {
  const rawSrc = src && typeof src === 'object' && 'src' in src ? src.src : src;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const initialSrc = (() => {
    if (typeof rawSrc !== 'string' || !rawSrc) return TRANSPARENT_PIXEL;
    if (rawSrc.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${rawSrc}`;
    }
    if (needsIpcResolution(rawSrc)) {
      return imageCache.get(rawSrc) || TRANSPARENT_PIXEL;
    }
    return rawSrc;
  })();

  const [resolvedSrc, setResolvedSrc] = useState<string>(initialSrc);

  useEffect(() => {
    if (typeof rawSrc !== 'string' || !rawSrc) {
      setResolvedSrc(rawSrc || TRANSPARENT_PIXEL);
      return;
    }
    if (rawSrc.startsWith('/9j/')) {
      setResolvedSrc(`data:image/jpeg;base64,${rawSrc}`);
      return;
    }
    if (!needsIpcResolution(rawSrc)) {
      setResolvedSrc(rawSrc);
      return;
    }

    const cached = imageCache.get(rawSrc);
    if (cached) {
      setResolvedSrc(cached);
      return;
    }

    if (missingImageCache.has(rawSrc)) {
      if (typeof onErrorRef.current === 'function') {
        onErrorRef.current();
      }
      return;
    }

    let cancelled = false;
    let cancelQueueTask: (() => void) | null = null;

    // Short 35ms debounce so fast virtualized scrolling skips IPC calls for rows that immediately unmount
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const { promise, cancel } = enqueueImageRequest(() =>
        invoke<string | null>('get_fod_image', { path: rawSrc })
      );
      cancelQueueTask = cancel;

      promise
        .then((dataUrl) => {
          if (dataUrl) {
            cacheSet(rawSrc, dataUrl);
            if (!cancelled) {
              setResolvedSrc(dataUrl);
            }
          } else {
            cacheSetMissing(rawSrc);
            if (!cancelled && typeof onErrorRef.current === 'function') {
              onErrorRef.current();
            }
          }
        })
        .catch(() => {
          cacheSetMissing(rawSrc);
          if (!cancelled && typeof onErrorRef.current === 'function') {
            onErrorRef.current();
          }
        });
    }, 35);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (cancelQueueTask) {
        cancelQueueTask();
      }
    };
  }, [rawSrc]);

  return (
    <img
      src={resolvedSrc || TRANSPARENT_PIXEL}
      alt={alt}
      className={className}
      width={width}
      height={height}
      onClick={onClick}
      style={style}
      draggable={draggable}
      onError={onError}
      {...rest}
    />
  );
};

export default Image;
