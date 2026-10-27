import { useRef, useEffect } from 'react';
import { useSimulatorStore } from '../../store';
import { MapPin, Compass, Route, Plane, RotateCcw, Crosshair } from 'lucide-react';

export default function LocationTab() {
  const { location, telemetry, theme, updateLocation } = useSimulatorStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Draw Visual Runway Radar with light/dark theme adaptation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const isDark = theme === 'dark';

    // Clear background
    ctx.fillStyle = isDark ? '#090d16' : '#f1f5f9';
    ctx.fillRect(0, 0, width, height);

    // Padding
    const pad = 40;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;

    const pts = [
      { lat: location.p1_lat ?? 9.9400, lon: location.p1_lon ?? 76.2700, label: 'P1' },
      { lat: location.p2_lat ?? 9.9400, lon: location.p2_lon ?? 76.2800, label: 'P2' },
      { lat: location.p3_lat ?? 9.9500, lon: location.p3_lon ?? 76.2800, label: 'P3' },
      { lat: location.p4_lat ?? 9.9500, lon: location.p4_lon ?? 76.2700, label: 'P4' },
    ];

    const minLat = Math.min(...pts.map((p) => p.lat));
    const maxLat = Math.max(...pts.map((p) => p.lat));
    const minLon = Math.min(...pts.map((p) => p.lon));
    const maxLon = Math.max(...pts.map((p) => p.lon));

    const latSpan = maxLat - minLat || 0.0005;
    const lonSpan = maxLon - minLon || 0.0005;

    // Add 15% visual margin so vertices do not touch radar canvas edge
    const padLat = latSpan * 0.15;
    const padLon = lonSpan * 0.15;
    const viewMinLat = minLat - padLat;
    const viewMaxLat = maxLat + padLat;
    const viewMinLon = minLon - padLon;
    const viewMaxLon = maxLon + padLon;
    const viewLatSpan = viewMaxLat - viewMinLat;
    const viewLonSpan = viewMaxLon - viewMinLon;

    const toCanvasX = (lon: number) => pad + ((lon - viewMinLon) / viewLonSpan) * plotW;
    const toCanvasY = (lat: number) => height - pad - ((lat - viewMinLat) / viewLatSpan) * plotH;

    // Radar subtle background box
    ctx.fillStyle = isDark ? '#101726' : '#ffffff';
    ctx.fillRect(pad, pad, plotW, plotH);
    ctx.strokeStyle = isDark ? '#1e293b' : '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, plotW, plotH);

    // Draw Grid lines
    ctx.strokeStyle = isDark ? '#182235' : '#f8fafc';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(pad + (plotW / 4) * i, pad);
      ctx.lineTo(pad + (plotW / 4) * i, height - pad);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pad, pad + (plotH / 4) * i);
      ctx.lineTo(width - pad, pad + (plotH / 4) * i);
      ctx.stroke();
    }

    // Draw 4-point Polygon Runway Boundary
    ctx.beginPath();
    ctx.moveTo(toCanvasX(pts[0].lon), toCanvasY(pts[0].lat));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toCanvasX(pts[i].lon), toCanvasY(pts[i].lat));
    }
    ctx.closePath();

    ctx.fillStyle = isDark ? 'rgba(6, 182, 212, 0.09)' : 'rgba(14, 165, 233, 0.09)';
    ctx.fill();

    ctx.strokeStyle = isDark ? '#06b6d4' : '#0284c7';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Determine long axis for sweep passes
    const dist = (pA: { lat: number; lon: number }, pB: { lat: number; lon: number }) =>
      Math.hypot(pA.lat - pB.lat, (pA.lon - pB.lon) * Math.cos((pA.lat * Math.PI) / 180));

    const d12 = dist(pts[0], pts[1]);
    const d23 = dist(pts[1], pts[2]);
    const d34 = dist(pts[2], pts[3]);
    const d41 = dist(pts[3], pts[0]);

    const lenAxisA = (d12 + d34) / 2; // lengthwise along sides 1-2 & 4-3
    const lenAxisB = (d41 + d23) / 2; // lengthwise along sides 4-1 & 2-3

    // Draw Sweep Lanes inside polygon
    const passes = location.sweep_passes || 3;
    ctx.strokeStyle = isDark ? '#38bdf888' : '#0284c788';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.8;
    ctx.beginPath();

    for (let p = 0; p < passes; p++) {
      const u = (p + 0.5) / passes;
      let sLat, sLon, eLat, eLon;
      if (lenAxisA >= lenAxisB) {
        sLat = pts[0].lat + u * (pts[3].lat - pts[0].lat);
        sLon = pts[0].lon + u * (pts[3].lon - pts[0].lon);
        eLat = pts[1].lat + u * (pts[2].lat - pts[1].lat);
        eLon = pts[1].lon + u * (pts[2].lon - pts[1].lon);
      } else {
        sLat = pts[0].lat + u * (pts[1].lat - pts[0].lat);
        sLon = pts[0].lon + u * (pts[1].lon - pts[0].lon);
        eLat = pts[3].lat + u * (pts[2].lat - pts[3].lat);
        eLon = pts[3].lon + u * (pts[2].lon - pts[3].lon);
      }

      const startX = toCanvasX(sLon);
      const startY = toCanvasY(sLat);
      const endX = toCanvasX(eLon);
      const endY = toCanvasY(eLat);

      if (p % 2 === 0) {
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
      } else {
        ctx.moveTo(endX, endY);
        ctx.lineTo(startX, startY);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Corner Vertices & Labels (P1, P2, P3, P4)
    pts.forEach((pt) => {
      const x = toCanvasX(pt.lon);
      const y = toCanvasY(pt.lat);

      // Outer glow
      ctx.fillStyle = isDark ? 'rgba(6, 182, 212, 0.25)' : 'rgba(2, 132, 199, 0.2)';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();

      // Vertex dot
      ctx.fillStyle = isDark ? '#06b6d4' : '#0284c7';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Corner label badge
      ctx.fillStyle = isDark ? '#38bdf8' : '#0369a1';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(pt.label, x + 7, y - 5);
    });

    // Draw Vehicle Dot & Heading Vector
    const fallbackLat = (pts[0].lat + pts[2].lat) / 2;
    const fallbackLon = (pts[0].lon + pts[2].lon) / 2;
    const carLat = telemetry.current_lat || fallbackLat;
    const carLon = telemetry.current_lon || fallbackLon;
    const carX = toCanvasX(carLon);
    const carY = toCanvasY(carLat);
    const headingRad = (telemetry.current_heading || 0) * (Math.PI / 180);

    // Heading Arrow Vector
    const arrowLen = 24;
    const endX = carX + arrowLen * Math.sin(headingRad);
    const endY = carY - arrowLen * Math.cos(headingRad);

    ctx.strokeStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(carX, carY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Vehicle Core Circle
    ctx.fillStyle = isDark ? '#06b6d4' : '#0284c7';
    ctx.beginPath();
    ctx.arc(carX, carY, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Coordinate axis labels
    ctx.fillStyle = isDark ? '#64748b' : '#64748b';
    ctx.font = '10px monospace';
    ctx.fillText(`${minLat.toFixed(4)}°N`, 4, height - pad + 4);
    ctx.fillText(`${maxLat.toFixed(4)}°N`, 4, pad + 10);
    ctx.fillText(`${minLon.toFixed(4)}°E`, pad, height - 8);
    ctx.fillText(`${maxLon.toFixed(4)}°E`, width - pad - 60, height - 8);
  }, [location, telemetry.current_lat, telemetry.current_lon, telemetry.current_heading, theme]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 select-none transition-colors">
      {/* Column 1: Coordinate Inputs & Trajectory Config */}
      <div className="flex flex-col gap-6">
        {/* Mission Boundary 4 Points Card */}
        <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] rounded-xl p-5 shadow-xs dark:shadow-md flex flex-col gap-4 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-400 font-semibold text-sm">
              <MapPin className="w-4 h-4" />
              <span>MISSION LOCATION BOUNDARY (4 POINTS QUAD)</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800">
              Boundary Enforced
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Define 4 perimeter corner points. FOD detections and simulated vehicle patrols will strictly spawn inside this boundary only.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Point 1 */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-[#212b3d] bg-slate-50/70 dark:bg-[#131926] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
                  Point 1 (P1 - SW)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] block mb-0.5 font-medium">Latitude:</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={location.p1_lat}
                    onChange={(e) => updateLocation({ p1_lat: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 dark:bg-[#192131] dark:border-[#29374e] px-2.5 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] block mb-0.5 font-medium">Longitude:</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={location.p1_lon}
                    onChange={(e) => updateLocation({ p1_lon: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 dark:bg-[#192131] dark:border-[#29374e] px-2.5 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Point 2 */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-[#212b3d] bg-slate-50/70 dark:bg-[#131926] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
                  Point 2 (P2 - SE)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] block mb-0.5 font-medium">Latitude:</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={location.p2_lat}
                    onChange={(e) => updateLocation({ p2_lat: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 dark:bg-[#192131] dark:border-[#29374e] px-2.5 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] block mb-0.5 font-medium">Longitude:</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={location.p2_lon}
                    onChange={(e) => updateLocation({ p2_lon: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 dark:bg-[#192131] dark:border-[#29374e] px-2.5 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Point 3 */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-[#212b3d] bg-slate-50/70 dark:bg-[#131926] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
                  Point 3 (P3 - NE)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] block mb-0.5 font-medium">Latitude:</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={location.p3_lat}
                    onChange={(e) => updateLocation({ p3_lat: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 dark:bg-[#192131] dark:border-[#29374e] px-2.5 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] block mb-0.5 font-medium">Longitude:</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={location.p3_lon}
                    onChange={(e) => updateLocation({ p3_lon: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 dark:bg-[#192131] dark:border-[#29374e] px-2.5 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Point 4 */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-[#212b3d] bg-slate-50/70 dark:bg-[#131926] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
                  Point 4 (P4 - NW)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] block mb-0.5 font-medium">Latitude:</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={location.p4_lat}
                    onChange={(e) => updateLocation({ p4_lat: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 dark:bg-[#192131] dark:border-[#29374e] px-2.5 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] block mb-0.5 font-medium">Longitude:</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={location.p4_lon}
                    onChange={(e) => updateLocation({ p4_lon: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 dark:bg-[#192131] dark:border-[#29374e] px-2.5 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#1d2738]">
            <span className="text-slate-400 dark:text-slate-500 text-[11px] font-medium">Boundary Presets:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  updateLocation({
                    p1_lat: 9.9400,
                    p1_lon: 76.2700,
                    p2_lat: 9.9400,
                    p2_lon: 76.2800,
                    p3_lat: 9.9500,
                    p3_lon: 76.2800,
                    p4_lat: 9.9500,
                    p4_lon: 76.2700,
                  })
                }
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-[#182030] dark:hover:bg-[#202b40] dark:text-slate-300 transition-colors cursor-pointer border border-slate-200 dark:border-[#28354c]"
              >
                <RotateCcw className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                Default Box
              </button>
              <button
                type="button"
                onClick={() =>
                  updateLocation({
                    p1_lat: 9.9415,
                    p1_lon: 76.2690,
                    p2_lat: 9.9475,
                    p2_lon: 76.2835,
                    p3_lat: 9.9505,
                    p3_lon: 76.2820,
                    p4_lat: 9.9445,
                    p4_lon: 76.2675,
                  })
                }
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-[#182030] dark:hover:bg-[#202b40] dark:text-slate-300 transition-colors cursor-pointer border border-slate-200 dark:border-[#28354c]"
              >
                <Crosshair className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                Angled Runway (09/27)
              </button>
            </div>
          </div>
        </div>

        {/* Trajectory & Speed Config */}
        <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] rounded-xl p-5 shadow-xs dark:shadow-md flex flex-col gap-4 transition-colors">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-semibold text-sm">
            <Route className="w-4 h-4" />
            <span>PATROL TRAJECTORY & SWEEP PATTERN</span>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium">Vehicle Velocity:</span>
              <span className="font-mono font-bold text-cyan-700 dark:text-cyan-300">
                {location.vehicle_speed_kmh.toFixed(1)} km/h
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="45"
              step="1"
              value={location.vehicle_speed_kmh}
              onChange={(e) => updateLocation({ vehicle_speed_kmh: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
              <span>5 km/h (Slow Scan)</span>
              <span>25 km/h (Standard Sweep)</span>
              <span>45 km/h (Max Survey)</span>
            </div>
          </div>

          {/* Sweep Passes */}
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-300 block mb-1.5 font-medium">Runway Sweep Passes:</label>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((pass) => (
                <button
                  key={pass}
                  onClick={() => updateLocation({ sweep_passes: pass })}
                  className={`py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    location.sweep_passes === pass
                      ? 'bg-cyan-50 border-cyan-400 text-cyan-800 dark:bg-cyan-950 dark:border-cyan-500 dark:text-cyan-300'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 dark:bg-[#161d2b] dark:border-[#253145] dark:text-slate-400 dark:hover:bg-[#1e2638]'
                  }`}
                >
                  {pass} {pass === 1 ? 'Pass' : 'Passes'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Column 2: Visual Canvas Radar */}
      <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] rounded-xl p-5 shadow-xs dark:shadow-md flex flex-col gap-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
            <Plane className="w-4 h-4" />
            <span>REAL-TIME PATROL RADAR PREVIEW</span>
          </div>

          {/* Live Position Pill */}
          <div className="flex items-center gap-2 text-[11px] font-mono bg-slate-100 border border-slate-200 dark:bg-[#161d2b] dark:border-[#253145] px-2.5 py-1 rounded-md text-slate-700 dark:text-slate-300">
            <Compass className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>{telemetry.current_heading.toFixed(1)}°</span>
            <span className="text-slate-400">•</span>
            <span>
              {telemetry.current_lat.toFixed(5)}, {telemetry.current_lon.toFixed(5)}
            </span>
          </div>
        </div>

        {/* Canvas Display */}
        <div className="w-full aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 dark:border-[#212b3d] flex items-center justify-center bg-slate-50 dark:bg-[#0c1017]">
          <canvas ref={canvasRef} width={500} height={375} className="w-full h-full object-contain" />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 dark:bg-cyan-400 inline-block" /> Vehicle Position & Heading
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 border border-white inline-block" /> P1-P4 Perimeter Nodes
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 border-b border-dashed border-cyan-500 inline-block" /> Sweep Paths
          </div>
        </div>
      </div>
    </div>
  );
}
