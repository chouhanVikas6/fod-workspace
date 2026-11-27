import React, { useCallback, useEffect, useRef, useState } from "react";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
export const DOUBLE_TAP_ZOOM = 2.5;
export const BUTTON_ZOOM_STEP = 0.5;

export interface ZoomTransform {
  zoom: number;
  x: number;
  y: number;
}

export interface UseImageZoomPanOptions {
  isOpen: boolean;
  onSwipeFrame?: (delta: number) => void;
  minZoom?: number;
  maxZoom?: number;
}

/** Clamp pan offsets so the zoomed image edge cannot be dragged inside the viewport bounds. */
export function clampPan(
  x: number,
  y: number,
  zoom: number,
  width: number,
  height: number,
): { x: number; y: number } {
  if (zoom <= 1 || width <= 0 || height <= 0) {
    return { x: 0, y: 0 };
  }
  const maxX = ((zoom - 1) * width) / 2;
  const maxY = ((zoom - 1) * height) / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}

function getTwoPointerMetrics(
  pointers: Map<number, { x: number; y: number }>,
): { dist: number; midX: number; midY: number } | null {
  if (pointers.size < 2) return null;
  const iter = pointers.values();
  const first = iter.next().value;
  const second = iter.next().value;
  if (!first || !second) return null;
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  return {
    dist: Math.hypot(dx, dy),
    midX: (first.x + second.x) / 2,
    midY: (first.y + second.y) / 2,
  };
}

/**
 * Provides smooth pinch-to-zoom, wheel/trackpad zoom, drag-to-pan,
 * double-tap/double-click zoom toggle, and 1x frame swipe support.
 */
export function useImageZoomPan({
  isOpen,
  onSwipeFrame,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
}: UseImageZoomPanOptions) {
  const [transform, setTransform] = useState<ZoomTransform>({ zoom: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [animateTransition, setAnimateTransition] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<ZoomTransform>({ zoom: 1, x: 0, y: 0 });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const didPinchRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const onSwipeFrameRef = useRef(onSwipeFrame);

  useEffect(() => {
    onSwipeFrameRef.current = onSwipeFrame;
  }, [onSwipeFrame]);

  const commitTransform = useCallback((next: ZoomTransform, animate: boolean) => {
    transformRef.current = next;
    setAnimateTransition(animate);
    setTransform(next);
  }, []);

  const applyZoomAtClientPoint = useCallback(
    (
      nextZoomRaw: number,
      clientX: number,
      clientY: number,
      animate: boolean,
      nextMidX?: number,
      nextMidY?: number,
    ) => {
      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, nextZoomRaw));
      const nextZoom = clampedZoom < 1.01 ? 1 : Number(clampedZoom.toFixed(4));
      const cur = transformRef.current;

      if (nextZoom <= 1) {
        commitTransform({ zoom: 1, x: 0, y: 0 }, animate);
        return;
      }

      const el = viewportRef.current;
      if (!el) {
        commitTransform({ zoom: nextZoom, x: 0, y: 0 }, animate);
        return;
      }

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const prevFocalX = clientX - centerX;
      const prevFocalY = clientY - centerY;
      const targetFocalX = (nextMidX ?? clientX) - centerX;
      const targetFocalY = (nextMidY ?? clientY) - centerY;

      const rawX = targetFocalX - ((prevFocalX - cur.x) / cur.zoom) * nextZoom;
      const rawY = targetFocalY - ((prevFocalY - cur.y) / cur.zoom) * nextZoom;
      const clamped = clampPan(rawX, rawY, nextZoom, rect.width, rect.height);

      commitTransform({ zoom: nextZoom, x: clamped.x, y: clamped.y }, animate);
    },
    [commitTransform, maxZoom, minZoom],
  );

  const zoomIn = useCallback(() => {
    const cur = transformRef.current;
    const nextZoom = Math.min(maxZoom, +(cur.zoom + BUTTON_ZOOM_STEP).toFixed(2));
    const el = viewportRef.current;
    if (!el) {
      commitTransform({ zoom: nextZoom, x: 0, y: 0 }, true);
      return;
    }
    const rect = el.getBoundingClientRect();
    applyZoomAtClientPoint(
      nextZoom,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      true,
    );
  }, [applyZoomAtClientPoint, commitTransform, maxZoom]);

  const zoomOut = useCallback(() => {
    const cur = transformRef.current;
    const nextZoom = Math.max(minZoom, +(cur.zoom - BUTTON_ZOOM_STEP).toFixed(2));
    const el = viewportRef.current;
    if (!el) {
      commitTransform({ zoom: nextZoom, x: 0, y: 0 }, true);
      return;
    }
    const rect = el.getBoundingClientRect();
    applyZoomAtClientPoint(
      nextZoom,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      true,
    );
  }, [applyZoomAtClientPoint, commitTransform, minZoom]);

  const resetZoom = useCallback(
    (animate = false) => {
      activePointersRef.current.clear();
      pinchRef.current = null;
      dragRef.current = null;
      didPinchRef.current = false;
      setIsDragging(false);
      commitTransform({ zoom: 1, x: 0, y: 0 }, animate);
    },
    [commitTransform],
  );

  useEffect(() => {
    if (!isOpen) return;
    const el = viewportRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const sensitivity = e.ctrlKey ? 0.012 : 0.0025;
      const clampedDelta = Math.max(-120, Math.min(120, e.deltaY));
      const factor = Math.exp(-clampedDelta * sensitivity);
      applyZoomAtClientPoint(
        transformRef.current.zoom * factor,
        e.clientX,
        e.clientY,
        false,
      );
    };

    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 || transformRef.current.zoom > 1) {
        e.preventDefault();
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      const cur = transformRef.current;
      if (cur.zoom <= 1) return;
      const rect = el.getBoundingClientRect();
      const clamped = clampPan(cur.x, cur.y, cur.zoom, rect.width, rect.height);
      if (clamped.x !== cur.x || clamped.y !== cur.y) {
        commitTransform({ zoom: cur.zoom, x: clamped.x, y: clamped.y }, false);
      }
    });

    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("gesturestart", preventGesture as EventListener, {
      passive: false,
    });
    el.addEventListener("gesturechange", preventGesture as EventListener, {
      passive: false,
    });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("gesturestart", preventGesture as EventListener);
      el.removeEventListener("gesturechange", preventGesture as EventListener);
      el.removeEventListener("touchmove", handleTouchMove);
      resizeObserver.disconnect();
    };
  }, [isOpen, applyZoomAtClientPoint, commitTransform]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore environments where pointer capture is unavailable
    }

    if (activePointersRef.current.size === 1) {
      didPinchRef.current = false;
      pinchRef.current = null;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
      };
      if (transformRef.current.zoom > 1) {
        setIsDragging(true);
        setAnimateTransition(false);
      }
    } else if (activePointersRef.current.size >= 2) {
      didPinchRef.current = true;
      setIsDragging(true);
      setAnimateTransition(false);
      pinchRef.current = getTwoPointerMetrics(activePointersRef.current);
    }
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size >= 2) {
        const metrics = getTwoPointerMetrics(activePointersRef.current);
        const prevPinch = pinchRef.current;
        if (metrics && prevPinch && prevPinch.dist > 1 && metrics.dist > 1) {
          const cur = transformRef.current;
          applyZoomAtClientPoint(
            cur.zoom * (metrics.dist / prevPinch.dist),
            prevPinch.midX,
            prevPinch.midY,
            false,
            metrics.midX,
            metrics.midY,
          );
        }
        if (metrics) {
          pinchRef.current = metrics;
        }
        return;
      }

      if (activePointersRef.current.size === 1 && dragRef.current) {
        const drag = dragRef.current;
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
          drag.moved = true;
        }
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;

        const cur = transformRef.current;
        if (cur.zoom > 1) {
          const el = viewportRef.current;
          const width = el?.clientWidth ?? 0;
          const height = el?.clientHeight ?? 0;
          const clamped = clampPan(cur.x + dx, cur.y + dy, cur.zoom, width, height);
          setIsDragging(true);
          commitTransform({ zoom: cur.zoom, x: clamped.x, y: clamped.y }, false);
        }
      }
    },
    [applyZoomAtClientPoint, commitTransform],
  );

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, isCancel: boolean) => {
      activePointersRef.current.delete(e.pointerId);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore capture release errors
      }

      if (activePointersRef.current.size === 1) {
        // Smooth transition from 2-finger pinch to 1-finger pan without triggering a swipe
        pinchRef.current = null;
        const remaining = activePointersRef.current.values().next().value;
        if (remaining) {
          dragRef.current = {
            startX: remaining.x,
            startY: remaining.y,
            lastX: remaining.x,
            lastY: remaining.y,
            moved: true,
          };
        }
        return;
      }

      if (activePointersRef.current.size === 0) {
        pinchRef.current = null;
        setIsDragging(false);

        const drag = dragRef.current;
        const didPinch = didPinchRef.current;
        dragRef.current = null;
        didPinchRef.current = false;

        if (isCancel || didPinch || !drag) {
          return;
        }

        const cur = transformRef.current;
        if (cur.zoom <= 1.01) {
          const totalDx = e.clientX - drag.startX;
          const totalDy = e.clientY - drag.startY;
          if (Math.abs(totalDx) >= 35 && Math.abs(totalDx) > Math.abs(totalDy)) {
            onSwipeFrameRef.current?.(totalDx < 0 ? 1 : -1);
            return;
          }
        }

        if (!drag.moved) {
          const now = Date.now();
          const prevTap = lastTapRef.current;
          if (
            prevTap &&
            now - prevTap.time <= 300 &&
            Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) <= 24
          ) {
            lastTapRef.current = null;
            if (cur.zoom > 1.01) {
              resetZoom(true);
            } else {
              applyZoomAtClientPoint(DOUBLE_TAP_ZOOM, e.clientX, e.clientY, true);
            }
          } else {
            lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
          }
        }
      }
    },
    [applyZoomAtClientPoint, resetZoom],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => handlePointerEnd(e, false),
    [handlePointerEnd],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => handlePointerEnd(e, true),
    [handlePointerEnd],
  );

  return {
    viewportRef,
    zoom: transform.zoom,
    pan: { x: transform.x, y: transform.y },
    isDragging,
    animateTransition,
    zoomIn,
    zoomOut,
    resetZoom,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
