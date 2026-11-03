import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const imageCache = new Map<string, string>();

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

const Image = ({ src, alt, className, width, height, onClick, style, draggable }: any) => {
  const rawSrc = src && typeof src === 'object' && 'src' in src ? src.src : src;

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

    let cancelled = false;
    invoke<string | null>('get_fod_image', { path: rawSrc })
      .then((dataUrl) => {
        if (dataUrl) {
          imageCache.set(rawSrc, dataUrl);
          if (!cancelled) {
            setResolvedSrc(dataUrl);
          }
        } else if (!cancelled && !isHexSha256(rawSrc)) {
          setResolvedSrc(rawSrc);
        }
      })
      .catch(() => {
        if (!cancelled && !isHexSha256(rawSrc)) {
          setResolvedSrc(rawSrc);
        }
      });

    return () => {
      cancelled = true;
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
    />
  );
};

export default Image;
