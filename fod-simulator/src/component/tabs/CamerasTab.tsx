import { useSimulatorStore } from '../../store';
import { Camera, CheckSquare, XSquare, Play, Pause, Wifi, WifiOff } from 'lucide-react';

export default function CamerasTab() {
  const { cameras, updateCamera, setAllCamerasState } = useSimulatorStore();

  return (
    <div className="flex flex-col gap-6 select-none">
      {/* Master Action Header */}
      <div className="bg-[#121721] border border-[#212a3b] p-4 rounded-xl flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
          <Camera className="w-4 h-4" />
          <span>VEHICLE CAMERA RIG (26 CHANNELS)</span>
        </div>

        {/* Bulk Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <button
            onClick={() => setAllCamerasState(true, undefined, undefined)}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#192130] hover:bg-[#232f45] border border-[#27354d] text-slate-200 cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> Enable All
          </button>
          <button
            onClick={() => setAllCamerasState(false, undefined, undefined)}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#192130] hover:bg-[#232f45] border border-[#27354d] text-slate-200 cursor-pointer"
          >
            <XSquare className="w-3.5 h-3.5 text-rose-400" /> Disable All
          </button>
          <button
            onClick={() => setAllCamerasState(undefined, true, undefined)}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#192130] hover:bg-[#232f45] border border-[#27354d] text-slate-200 cursor-pointer"
          >
            <Wifi className="w-3.5 h-3.5 text-cyan-400" /> Connect All
          </button>
          <button
            onClick={() => setAllCamerasState(undefined, false, undefined)}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#192130] hover:bg-[#232f45] border border-[#27354d] text-slate-200 cursor-pointer"
          >
            <WifiOff className="w-3.5 h-3.5 text-rose-400" /> Disconnect All
          </button>
          <button
            onClick={() => setAllCamerasState(undefined, undefined, false)}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#192130] hover:bg-[#232f45] border border-[#27354d] text-slate-200 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" /> Resume All
          </button>
          <button
            onClick={() => setAllCamerasState(undefined, undefined, true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#192130] hover:bg-[#232f45] border border-[#27354d] text-slate-200 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5 text-amber-400" /> Pause All
          </button>
        </div>
      </div>

      {/* Grid of 26 Cameras */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {cameras.map((cam) => {
          const isFlir = cam.cam_id.startsWith('flir');
          return (
            <div
              key={cam.cam_id}
              className={`p-4 rounded-xl border transition-all ${
                !cam.enabled
                  ? 'bg-[#0e1219]/60 border-[#1a2130] opacity-60'
                  : cam.paused
                  ? 'bg-[#151722] border-amber-600/40 shadow-sm'
                  : cam.connected
                  ? 'bg-[#121824] border-[#222d42] hover:border-cyan-500/50 shadow-md'
                  : 'bg-[#1a1215] border-rose-600/40'
              }`}
            >
              {/* Card Header: Cam ID & Status */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                      isFlir ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                    }`}
                  >
                    {cam.cam_id}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-medium">
                    {isFlir ? 'FLIR Optical' : 'Lucid Wide'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                      !cam.enabled
                        ? 'bg-slate-800 text-slate-400'
                        : cam.paused
                        ? 'bg-amber-950 text-amber-400'
                        : cam.connected
                        ? 'bg-emerald-950 text-emerald-400'
                        : 'bg-rose-950 text-rose-400'
                    }`}
                  >
                    {!cam.enabled ? 'DISABLED' : cam.paused ? 'PAUSED' : cam.connected ? 'ONLINE' : 'DISCON'}
                  </span>
                </div>
              </div>

              {/* Toggles Row */}
              <div className="flex items-center justify-between mb-3 text-xs border-b border-[#1c2536] pb-2.5">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={cam.enabled}
                    onChange={(e) => updateCamera(cam.cam_id, { enabled: e.target.checked })}
                    className="accent-cyan-500"
                  />
                  <span>Active</span>
                </label>

                <button
                  onClick={() => updateCamera(cam.cam_id, { connected: !cam.connected })}
                  title="Toggle hardware link"
                  className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white cursor-pointer"
                >
                  {cam.connected ? (
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                  )}
                  <span>{cam.connected ? 'Linked' : 'No Link'}</span>
                </button>

                <button
                  onClick={() => updateCamera(cam.cam_id, { paused: !cam.paused })}
                  title="Toggle scan pause"
                  className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white cursor-pointer"
                >
                  {cam.paused ? (
                    <Play className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Pause className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{cam.paused ? 'Resume' : 'Pause'}</span>
                </button>
              </div>

              {/* Sliders: FPS and Offset */}
              <div className="flex flex-col gap-2.5 text-[11px]">
                <div>
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Inference FPS:</span>
                    <span className="font-mono text-cyan-300">{cam.intr_fps.toFixed(0)} FPS</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="1"
                    value={cam.intr_fps}
                    onChange={(e) => updateCamera(cam.cam_id, { intr_fps: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-500 cursor-pointer h-1"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Mounting Offset:</span>
                    <span className="font-mono text-slate-300">
                      {cam.lateral_offset_m >= 0 ? `+${cam.lateral_offset_m.toFixed(1)}m` : `${cam.lateral_offset_m.toFixed(1)}m`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-2.5"
                    max="2.5"
                    step="0.1"
                    value={cam.lateral_offset_m}
                    onChange={(e) => updateCamera(cam.cam_id, { lateral_offset_m: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer h-1"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
