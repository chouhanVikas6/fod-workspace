import React, { useEffect, useRef, useMemo, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store";
import { updateSelectedFod } from "@/store/actions/SelectedFod";
import { setSideBarVisibility } from "@/store/slices/selectedFod-slice";
import { AppDispatch } from "@/store";

type Fod = {
  id?: number;
  FodId: number;
  FodPoint: string;
  status?: string;
  imgModal?: boolean;
  groupStatus?: string;
  groupId: number;
  sysid?: string;
};

// --- Grid-based spatial index helpers ---
const CELL_SIZE = 100; // pixels
function buildGridIndex(markers) {
  const grid = {};
  markers.forEach(marker => {
    const x = Math.floor(marker.pixelCoords.x / CELL_SIZE);
    const y = Math.floor(marker.pixelCoords.y / CELL_SIZE);
    const key = `${x},${y}`;
    if (!grid[key]) grid[key] = [];
    grid[key].push(marker);
  });
  return grid;
}
function getMarkersNear(grid, x, y, radius = 20) {
  const cx = Math.floor(x / CELL_SIZE);
  const cy = Math.floor(y / CELL_SIZE);
  let candidates = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${cx + dx},${cy + dy}`;
      if (grid[key]) {
        candidates = candidates.concat(grid[key]);
      }
    }
  }
  return candidates.filter(marker => {
    const dx = marker.pixelCoords.x - x;
    const dy = marker.pixelCoords.y - y;
    return Math.sqrt(dx * dx + dy * dy) <= radius;
  });
}
// --- End grid helpers ---

// Debounce helper
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Place drawMarker here so it is available for drawMarkers
const drawMarker = (context, fod, pixelCoords, pulseRadius = 20) => {
  const crossColor =
    fod.groupStatus === "CLEARED"
      ? "white"
      : fod.groupStatus === "ACCEPTED"
        ? "white"
        : fod.groupStatus === "REJECTED"
          ? "white"
          : "black";
  context.globalCompositeOperation = "source-over";
  // Draw white border circle
  context.beginPath();
  context.arc(pixelCoords.x, pixelCoords.y, pulseRadius + 5, 0, Math.PI * 2, true);
  context.strokeStyle = "white";
  context.lineWidth = 3;
  context.stroke();
  context.closePath();
  // Draw main circle
  context.beginPath();
  context.arc(pixelCoords.x, pixelCoords.y, pulseRadius, 0, Math.PI * 2, true);
  context.fillStyle =
    fod.groupStatus === "CLEARED"
      ? "rgba(0,128,0,0.5)" // semi-transparent green
      : fod.groupStatus === "ACCEPTED"
        ? "rgba(255,0,0,0.5)" // semi-transparent red
        : fod.groupStatus === "REJECTED"
          ? "rgba(128,128,128,0.5)" // semi-transparent gray
          : "rgba(255,255,0,0.5)"; // semi-transparent yellow
  context.fill();
  context.closePath();
  // Draw cross
  const crossLength = 12;
  context.beginPath();
  context.moveTo(pixelCoords.x - crossLength, pixelCoords.y - crossLength);
  context.lineTo(pixelCoords.x + crossLength, pixelCoords.y + crossLength);
  context.moveTo(pixelCoords.x + crossLength, pixelCoords.y - crossLength);
  context.lineTo(pixelCoords.x - crossLength, pixelCoords.y + crossLength);
  context.strokeStyle = crossColor;
  context.lineWidth = 3;
  context.stroke();
  context.closePath();
};

const FodMarkersCanvasCopy = ({ map }) => {
  const dispatch = useDispatch<AppDispatch>();
  const fods = useSelector((state: RootState) => state.FodReducer.fods);
  const selectedFod = useSelector((state: RootState) => state.SelectedFod.fod) as Partial<Fod>;
  const selectedFrame = useSelector((state: RootState) => state.SelectedFod.selectedFrame) as Partial<Fod> | null;
  const selectedQueue = useSelector((state: RootState) => state.MapReducer.selectedQueue);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const markerMap = useRef(new Map());
  const currentAnimationRef = useRef(null);
  const gridRef = useRef({});

  // 1. Memoize filtered markers
  const fodsToRender = useMemo(() => {
    return fods.filter((fod) => {
      if(!['ACCEPTED','NEW','CLEARED'].includes(fod.groupStatus) && selectedQueue.includes('REJECTED')){
        return true;
      }
      return selectedQueue.includes(fod.groupStatus)
    });
  }, [fods, selectedQueue]);

  // 2. Efficient batch drawing and grid index
  const drawMarkers = useCallback((context, fodsToRender, selectedFod) => {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    markerMap.current.clear();
    let markerObjs = [];
    // Draw all unselected markers first
    fodsToRender.forEach((fod) => {
      if (selectedFod && fod.groupId === selectedFod.groupId) return;
      const location =
        typeof fod.location === "string" ? JSON.parse(fod.location) : fod.location;
      if (!location) return;
      const pixelCoords = map.current.project([location.lon, location.lat]);
      drawMarker(context, fod, pixelCoords);
      const markerObj = { ...fod, location, pixelCoords, groupStatus: fod.groupStatus };
      markerMap.current.set(fod.groupId, markerObj);
      markerObjs.push(markerObj);
    });
    // Draw the selected marker last, with a highlight
    if (selectedFod) {
      const fod = fodsToRender.find(f => f.groupId === selectedFod.groupId);
      if (fod) {
        const location =
          typeof fod.location === "string" ? JSON.parse(fod.location) : fod.location;
        if (location) {
          const pixelCoords = map.current.project([location.lon, location.lat]);
          // Draw a highlight border (e.g., thicker, colored, or semi-transparent)
          context.save();
          context.beginPath();
          context.arc(pixelCoords.x, pixelCoords.y, 28, 0, Math.PI * 2, true);
          context.strokeStyle = 'rgba(0, 123, 255, 0.5)'; // blue highlight
          context.lineWidth = 8;
          context.globalAlpha = 0.7;
          context.stroke();
          context.globalAlpha = 1.0;
          context.restore();
          // Draw the marker itself
          drawMarker(context, fod, pixelCoords);
          const markerObj = { ...fod, location, pixelCoords, groupStatus: fod.groupStatus };
          markerMap.current.set(fod.groupId, markerObj);
          markerObjs.push(markerObj);
        }
      }
    }
    // Build grid index for fast click detection
    gridRef.current = buildGridIndex(markerObjs);
  }, [map]);

  // 3. Debounced updateCanvas
  const updateCanvas = useCallback(() => {
    if (!canvasRef.current) return;
    const context = canvasRef.current.getContext("2d");
    if (!context) return;
    drawMarkers(context, fodsToRender, selectedFod);
  }, [fodsToRender, selectedFod, drawMarkers]);
  const debouncedUpdateCanvas = useMemo(() => updateCanvas, [updateCanvas]);

  // 4. Only create canvas once and reuse
  useEffect(() => {
    if (!map.current) return;
    if (canvasRef.current) return; // Only create once
    const canvas = document.createElement("canvas");
    canvas.width = map.current.getCanvas().width;
    canvas.height = map.current.getCanvas().height;
    canvas.style.position = "absolute";
    map.current.getCanvasContainer().appendChild(canvas);
    canvasRef.current = canvas;
    const context = canvas.getContext("2d");
    if (context) {
      drawMarkers(context, fodsToRender, selectedFod);
    }
    // Click handler using grid index
    canvas.addEventListener("click", (e) => {
      if (!context) return;
      const bounds = canvas.getBoundingClientRect();
      const x = e.clientX - bounds.left;
      const y = e.clientY - bounds.top;
      const found = getMarkersNear(gridRef.current, x, y, 20);
      // Pick the closest marker
      let closestMarker = null;
      let minDistance = Infinity;
      for (const marker of found) {
        const dx = marker.pixelCoords.x - x;
        const dy = marker.pixelCoords.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          minDistance = distance;
          closestMarker = marker;
        }
      }
      if (closestMarker && selectedFod?.groupId !== closestMarker.groupId) {
        const originalFod = fods.find(f => f.groupId === closestMarker.groupId);
        if (originalFod) {
          dispatch(setSideBarVisibility(true));
          dispatch(updateSelectedFod(originalFod) as any);
        }
      }
    });
    // Debounced redraws
    map.current.on("move", debouncedUpdateCanvas);
    map.current.on("resize", debouncedUpdateCanvas);
    return () => {
      map.current.off("move", debouncedUpdateCanvas);
      map.current.off("resize", debouncedUpdateCanvas);
      if (canvasRef.current) {
        canvasRef.current.remove();
        canvasRef.current = null;
      }
    };
    // eslint-disable-next-line
  }, [map, debouncedUpdateCanvas]);

  // Redraw when fodsToRender or selectedFod changes
  useEffect(() => {
    updateCanvas();
  }, [updateCanvas]);

  //it changes location of fod marker with its selected frame location
  useEffect(() => {
    if (!selectedFrame || !map.current) return;
    updateMarkerById(selectedFrame.groupId, (selectedFrame as any).location);
  }, [selectedFrame]);

  //add animation on selected fod
  useEffect(()=>{
    if (!selectedFod || !map.current) return;
    currentAnimationRef.current = null;
    animatePulse(selectedFod.groupId!, true);
    return () => {
      currentAnimationRef.current = null; 
    };
  },[selectedFod])

  // Restore updateMarkerById and animatePulse above their usage
  const updateMarkerById = (id, newLocation) => {
    if (!canvasRef.current) return;
    const context = canvasRef.current.getContext("2d");
    if (!context) return;
    const markerData = markerMap.current.get(id);
    if (!markerData) return;
    const { groupStatus } = markerData;
    const { pixelCoords } = markerData;
    // Clear the old marker
    context.clearRect(pixelCoords.x - 30, pixelCoords.y - 30, 60, 60);
    // Update location
    const newPixelCoords = map.current.project([newLocation.lon, newLocation.lat]);
    markerMap.current.set(id, { location: newLocation, pixelCoords: newPixelCoords, groupStatus });
    // Redraw marker at the new location
    drawMarker(context, { groupId: id, location: newLocation, groupStatus }, newPixelCoords);
    updateCanvas();
  };
  const animatePulse = (id, flag = true) => {
    if (!selectedFod || selectedFod.groupId !== id) {
      return;
    }
    if (!canvasRef.current) return;
    const context = canvasRef.current.getContext("2d");
    if (!context) return;
    const markerData = markerMap.current.get(id);
    if (!markerData) return;
    const { location, groupStatus, pixelCoords } = markerData;
    // Clear the old marker
    context.clearRect(pixelCoords.x - 30, pixelCoords.y - 30, 60, 60);
    // Redraw marker at the new location
    const radius = flag ? 20 : 23;
    drawMarker(context, { groupId: id, location, groupStatus }, pixelCoords, radius);
    currentAnimationRef.current = id;
    setTimeout(() => {
      if (currentAnimationRef.current === id) {
        animatePulse(id, !flag);
      }
    }, 200);
    updateCanvas();
  };

  return null;
};

export default FodMarkersCanvasCopy;
