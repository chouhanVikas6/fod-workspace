import React, { useEffect, useRef, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

// Bounded true-LRU cache (180 items) so scrolling 10,000+ virtualized cards
// never bloats WebView RAM even when falling back to base64 data URLs.
const MAX_CACHE_SIZE = 180;
const MAX_MISSING_CACHE_SIZE = 5000;
const MISSING_RETRY_TTL_MS = 8000;
const RETRY_DELAYS_MS = [1500, 3500];
const imageCache = new Map<string, string>();
const missingImageCache = new Map<string, number>();

function cacheGet(key: string): string | undefined {
  const val = imageCache.get(key);
  if (val !== undefined) {
    // Refresh recency (true LRU)
    imageCache.delete(key);
    imageCache.set(key, val);
  }
  return val;
}

function cacheSet(key: string, val: string) {
  missingImageCache.delete(key);
  if (imageCache.has(key)) {
    imageCache.delete(key);
  } else if (imageCache.size >= MAX_CACHE_SIZE) {
    const oldest = imageCache.keys().next().value;
    if (oldest) imageCache.delete(oldest);
  }
  imageCache.set(key, val);
}

function isRecentlyMissing(key: string): boolean {
  const ts = missingImageCache.get(key);
  if (ts === undefined) return false;
  if (Date.now() - ts >= MISSING_RETRY_TTL_MS) {
    missingImageCache.delete(key);
    return false;
  }
  return true;
}

function cacheSetMissing(key: string) {
  if (missingImageCache.has(key)) {
    missingImageCache.delete(key);
  } else if (missingImageCache.size >= MAX_MISSING_CACHE_SIZE) {
    const oldest = missingImageCache.keys().next().value;
    if (oldest) missingImageCache.delete(oldest);
  }
  missingImageCache.set(key, Date.now());
}

export function clearMissionImageCache(missionId: number | string) {
  const needle = `/${missionId}/`;
  for (const key of Array.from(imageCache.keys())) {
    if (key.includes(needle)) {
      imageCache.delete(key);
    }
  }
  for (const key of Array.from(missingImageCache.keys())) {
    if (key.includes(needle)) {
      missingImageCache.delete(key);
    }
  }
}

  export function preloadFodImage(rawSrc: string | null | undefined, localPath?: string | null) {
    if (typeof rawSrc !== 'string' || !rawSrc) return;
    if (!needsIpcResolution(rawSrc)) return;
    if (typeof localPath === 'string' && localPath) {
      cacheSet(rawSrc, convertFileSrc(localPath));
      return;
    }
    if (imageCache.has(rawSrc) || isRecentlyMissing(rawSrc)) return;

          enqueueImageRequest(async () => {
            try {
              const res = await invoke<{ kind: 'path' | 'dataUrl'; value: string } | null>(
                'resolve_fod_image',
                { path: rawSrc },
              );
              if (res?.value) {
                return res.kind === 'path' ? convertFileSrc(res.value) : res.value;
              }
              return null;
            } catch {
              return invoke<string | null>('get_fod_image', { path: rawSrc });
            }
          }).promise
            .then((resolvedUrl) => {
              if (resolvedUrl) {
                cacheSet(rawSrc, resolvedUrl);
              } else {
                cacheSetMissing(rawSrc);
              }
            })
            .catch(() => {
              cacheSetMissing(rawSrc);
            });
        }

const MAX_CONCURRENT_REQUESTS = 12;
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

        const Image = ({ src, localPath, alt, className, width, height, onClick, style, draggable, onError, ...rest }: any) => {
          const rawSrc = src && typeof src === 'object' && 'src' in src ? src.src : src;
          const directLocalUrl =
            typeof localPath === 'string' && localPath ? convertFileSrc(localPath) : null;
          const onErrorRef = useRef(onError);
          onErrorRef.current = onError;

          const initialSrc = (() => {
            if (directLocalUrl) return directLocalUrl;
            if (typeof rawSrc !== 'string' || !rawSrc) return TRANSPARENT_PIXEL;
            if (rawSrc.startsWith('/9j/')) {
              return `data:image/jpeg;base64,${rawSrc}`;
            }
            if (needsIpcResolution(rawSrc)) {
              return cacheGet(rawSrc) || TRANSPARENT_PIXEL;
            }
            return rawSrc;
          })();

          const [resolvedSrc, setResolvedSrc] = useState<string>(initialSrc);
          const [hasFailed, setHasFailed] = useState<boolean>(false);
          const triedDataUrlFallbackRef = useRef<boolean>(false);

          useEffect(() => {
            setHasFailed(false);
            triedDataUrlFallbackRef.current = false;

            if (directLocalUrl) {
              if (typeof rawSrc === 'string' && rawSrc) {
                cacheSet(rawSrc, directLocalUrl);
              }
              setResolvedSrc(directLocalUrl);
              return;
            }

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

            const cached = cacheGet(rawSrc);
            if (cached) {
              setResolvedSrc(cached);
              return;
            }

            setResolvedSrc(TRANSPARENT_PIXEL);

            if (isRecentlyMissing(rawSrc)) {
              setHasFailed(true);
              if (typeof onErrorRef.current === 'function') {
                onErrorRef.current();
              }
              return;
            }

            let cancelled = false;
            let cancelQueueTask: (() => void) | null = null;
            let timer: number | null = null;

            const resolveOnce = async (): Promise<string | null> => {
              try {
                const res = await invoke<{ kind: 'path' | 'dataUrl'; value: string } | null>(
                  'resolve_fod_image',
                  { path: rawSrc },
                );
                if (res?.value) {
                  return res.kind === 'path' ? convertFileSrc(res.value) : res.value;
                }
                return null;
              } catch {
                // Backwards-compatible fallback if backend doesn't expose resolve_fod_image
                return invoke<string | null>('get_fod_image', { path: rawSrc });
              }
            };

            const runAttempt = (attempt: number) => {
              if (cancelled) return;
              const { promise, cancel } = enqueueImageRequest(resolveOnce);
              cancelQueueTask = cancel;

              promise
                .then((resolvedUrl) => {
                  if (cancelled) return;
                  if (resolvedUrl) {
                    cacheSet(rawSrc, resolvedUrl);
                    setHasFailed(false);
                    setResolvedSrc(resolvedUrl);
                    return;
                  }
                  if (attempt < RETRY_DELAYS_MS.length) {
                    timer = window.setTimeout(() => runAttempt(attempt + 1), RETRY_DELAYS_MS[attempt]);
                  } else {
                    cacheSetMissing(rawSrc);
                    setHasFailed(true);
                    if (typeof onErrorRef.current === 'function') {
                      onErrorRef.current();
                    }
                  }
                })
                .catch(() => {
                  if (cancelled) return;
                  if (attempt < RETRY_DELAYS_MS.length) {
                    timer = window.setTimeout(() => runAttempt(attempt + 1), RETRY_DELAYS_MS[attempt]);
                  } else {
                    cacheSetMissing(rawSrc);
                    setHasFailed(true);
                    if (typeof onErrorRef.current === 'function') {
                      onErrorRef.current();
                    }
                  }
                });
            };

            // Short 35ms debounce so fast virtualized scrolling skips IPC calls for rows that immediately unmount
            timer = window.setTimeout(() => runAttempt(0), 35);

            return () => {
              cancelled = true;
              if (timer !== null) {
                window.clearTimeout(timer);
              }
              if (cancelQueueTask) {
                cancelQueueTask();
              }
            };
          }, [rawSrc, directLocalUrl]);

          const handleImgError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
            // If an asset:// URL failed to load in WebView, fall back once to base64 IPC
            if (
              typeof rawSrc === 'string' &&
              needsIpcResolution(rawSrc) &&
              resolvedSrc !== TRANSPARENT_PIXEL &&
              !resolvedSrc.startsWith('data:') &&
              !triedDataUrlFallbackRef.current
            ) {
              triedDataUrlFallbackRef.current = true;
              imageCache.delete(rawSrc);
              invoke<string | null>('get_fod_image', { path: rawSrc })
                .then((dataUrl) => {
                  if (dataUrl) {
                    cacheSet(rawSrc, dataUrl);
                    setHasFailed(false);
                    setResolvedSrc(dataUrl);
                  } else {
                    cacheSetMissing(rawSrc);
                    setHasFailed(true);
                    if (typeof onErrorRef.current === 'function') {
                      onErrorRef.current(e);
                    }
                  }
                })
                .catch(() => {
                  cacheSetMissing(rawSrc);
                  setHasFailed(true);
                  if (typeof onErrorRef.current === 'function') {
                    onErrorRef.current(e);
                  }
                });
              return;
            }

            setHasFailed(true);
            if (typeof onErrorRef.current === 'function') {
              onErrorRef.current(e);
            }
          };

          const isPendingIpc =
            needsIpcResolution(rawSrc) && resolvedSrc === TRANSPARENT_PIXEL && !hasFailed;

          return (
            <img
              src={resolvedSrc || TRANSPARENT_PIXEL}
              alt={alt}
              className={`${className || ""} ${isPendingIpc ? "zoid-shimmer" : "transition-opacity duration-200"
                }`.trim()}
              width={width}
              height={height}
              onClick={onClick}
              style={style}
              draggable={draggable}
              onError={handleImgError}
              {...rest}
            />
          );
        };

        export default Image;
