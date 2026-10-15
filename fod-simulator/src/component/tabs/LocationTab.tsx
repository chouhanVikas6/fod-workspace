import { useRef, useEffect } from 'react';
import { useSimulatorStore } from '../../store';
import { MapPin, Compass, Route, Plane } from 'lucide-react';

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
    const pad = 35;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;

    const minLat = Math.min(location.min_lat, location.max_lat);
    const maxLat = Math.max(location.min_lat, location.max_lat);
    const minLon = Math.min(location.min_lon, location.max_lon);
    const maxLon = Math.max(location.min_lon, location.max_lon);

    const latSpan = maxLat - minLat || 0.001;
    const lonSpan = maxLon - minLon || 0.001;

    const toCanvasX = (lon: number) => pad + ((lon - minLon) / lonSpan) * plotW;
    const toCanvasY = (lat: number) => height - pad - ((lat - minLat) / latSpan) * plotH;

    // Draw Boundary Box (Runway / Apron Area)
    ctx.strokeStyle = isDark ? '#1e293b' : '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, pad, plotW, plotH);

    ctx.fillStyle = isDark ? '#101726' : '#ffffff';
    ctx.fillRect(pad, pad, plotW, plotH);

    // Draw Grid lines
    ctx.strokeStyle = isDark ? '#182235' : '#f1f5f9';
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

    // Draw Sweep Lanes
    const passes = location.sweep_passes || 3;
    const latStep = latSpan / passes;

    ctx.strokeStyle = isDark ? '#2563eb88' : '#3b82f699';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let p = 0; p < passes; p++) {
      const curLat = minLat + p * latStep + latStep / 2;
      const y = toCanvasY(curLat);
      if (p % 2 === 0) {
        ctx.moveTo(toCanvasX(minLon), y);
        ctx.lineTo(toCanvasX(maxLon), y);
      } else {
        ctx.moveTo(toCanvasX(maxLon), y);
        ctx.lineTo(toCanvasX(minLon), y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Vehicle Dot & Heading Vector
    const carX = toCanvasX(telemetry.current_lat ? telemetry.current_lon : minLon + lonSpan / 2);
    const carY = toCanvasY(telemetry.current_lat || minLat + latSpan / 2);
    const headingRad = (telemetry.current_heading || 0) * (Math.PI / 180);

    // Heading Arrow Vector
    const arrowLen = 22;
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

    // Draw Labels
    ctx.fillStyle = isDark ? '#64748b' : '#64748b';
    ctx.font = '10px monospace';
    ctx.fillText(`${minLat.toFixed(4)}°N`, 4, height - pad);
    ctx.fillText(`${maxLat.toFixed(4)}°N`, 4, pad + 10);
    ctx.fillText(`${minLon.toFixed(4)}°E`, pad, height - 8);
    ctx.fillText(`${maxLon.toFixed(4)}°E`, width - pad - 60, height - 8);
  }, [location, telemetry.current_lat, telemetry.current_lon, telemetry.current_heading, theme]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 select-none transition-colors">
      {/* Column 1: Coordinate Inputs & Trajectory Config */}
      <div className="flex flex-col gap-6">
        {/* Mission Boundary Box */}
        <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] rounded-xl p-5 shadow-xs dark:shadow-md flex flex-col gap-4 transition-colors">
          <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-400 font-semibold text-sm">
            <MapPin className="w-4 h-4" />
            <span>MISSION LOCATION BOUNDARY (RUNWAY BOX)</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block mb-1 font-medium">Min Latitude:</span>
              <input
                type="number"
                step="0.0001"
                value={location.min_lat}
                onChange={(e) => updateLocation({ min_lat: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-50 border border-slate-300 dark:bg-[#151c2a] dark:border-[#253247] px-3 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block mb-1 font-medium">Max Latitude:</span>
              <input
                type="number"
                step="0.0001"
                value={location.max_lat}
                onChange={(e) => updateLocation({ max_lat: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-50 border border-slate-300 dark:bg-[#151c2a] dark:border-[#253247] px-3 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block mb-1 font-medium">Min Longitude:</span>
              <input
                type="number"
                step="0.0001"
                value={location.min_lon}
                onChange={(e) => updateLocation({ min_lon: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-50 border border-slate-300 dark:bg-[#151c2a] dark:border-[#253247] px-3 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block mb-1 font-medium">Max Longitude:</span>
              <input
                type="number"
                step="0.0001"
                value={location.max_lon}
                onChange={(e) => updateLocation({ max_lon: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-50 border border-slate-300 dark:bg-[#151c2a] dark:border-[#253247] px-3 py-1.5 rounded-lg font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500"
              />
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
            <span>{telemetry.current_lat.toFixed(5)}, {telemetry.current_lon.toFixed(5)}</span>
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
            <span className="w-4 border-b border-dashed border-blue-500 inline-block" /> Lawnmower Sweep Path
          </div>
        </div>
      </div>
    </div>
  );
}
