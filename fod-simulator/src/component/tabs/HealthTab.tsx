import { useSimulatorStore } from '../../store';
import { Cpu, Thermometer, Navigation, BatteryCharging, Radio, Flame, ShieldAlert, RotateCcw } from 'lucide-react';

export default function HealthTab() {
  const { health, updateHealth } = useSimulatorStore();

  const handleSimulateOverheat = () => {
    updateHealth({ temp_c: 94.0, cpu_pct: 95.0 });
  };

  const handleSimulateRtkLoss = () => {
    updateHealth({ gnss_fix: 'NO_GPS', gnss_sd: 4.8 });
  };

  const handleSimulateDegradedLink = () => {
    updateHealth({ ping_latency_ms: 280 });
  };

  const handleResetOptimal = () => {
    updateHealth({
      cpu_pct: 35.0,
      mem_pct: 42.0,
      disk_pct: 68.0,
      temp_c: 54.0,
      gnss_fix: 'RTK',
      gnss_sd: 0.015,
      voltage: 12.6,
      ping_latency_ms: 12,
    });
  };

  const getTempColor = (t: number) => {
    if (t >= 85) return 'text-rose-600 dark:text-rose-400';
    if (t >= 70) return 'text-amber-600 dark:text-amber-400';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 select-none transition-colors">
      {/* Column 1: PC Node Health */}
      <div className="flex flex-col gap-6">
        <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] rounded-xl p-5 shadow-xs dark:shadow-md flex flex-col gap-5 transition-colors">
          <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-400 font-semibold text-sm">
            <Cpu className="w-4 h-4" />
            <span>PC HOST TELEMETRY & HARDWARE HEALTH</span>
          </div>

          {/* CPU Slider */}
          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium">CPU Core Utilization:</span>
              <span className="font-mono font-bold text-cyan-700 dark:text-cyan-300">{health.cpu_pct.toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              value={health.cpu_pct}
              onChange={(e) => updateHealth({ cpu_pct: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500 cursor-pointer"
            />
          </div>

          {/* RAM Slider */}
          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium">RAM Usage:</span>
              <span className="font-mono font-bold text-blue-700 dark:text-blue-300">{health.mem_pct.toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={health.mem_pct}
              onChange={(e) => updateHealth({ mem_pct: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          {/* Disk Slider */}
          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium">NVMe SSD Storage Usage:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{health.disk_pct.toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              value={health.disk_pct}
              onChange={(e) => updateHealth({ disk_pct: parseFloat(e.target.value) })}
              className="w-full accent-slate-500 cursor-pointer"
            />
          </div>

          {/* Temperature Slider */}
          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5" /> Core Temperature:
              </span>
              <span className={`font-mono font-bold ${getTempColor(health.temp_c)}`}>
                {health.temp_c.toFixed(1)} °C
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="105"
              value={health.temp_c}
              onChange={(e) => updateHealth({ temp_c: parseFloat(e.target.value) })}
              className={`w-full cursor-pointer ${
                health.temp_c >= 85 ? 'accent-rose-500' : health.temp_c >= 70 ? 'accent-amber-500' : 'accent-emerald-500'
              }`}
            />
            <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
              <span>20°C (Idle)</span>
              <span>75°C (Warm)</span>
              <span className="text-rose-500 dark:text-rose-400 font-medium">95°C+ (Thermal Throttle)</span>
            </div>
          </div>
        </div>

        {/* Quick Stress Test Drills */}
        <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] rounded-xl p-5 shadow-xs dark:shadow-md transition-colors">
          <div className="flex items-center gap-2 mb-3 text-amber-600 dark:text-amber-400 font-semibold text-sm">
            <Flame className="w-4 h-4" />
            <span>ONE-CLICK STRESS DRILLS</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <button
              onClick={handleSimulateOverheat}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:border-rose-700/60 dark:text-rose-300 dark:hover:bg-rose-900/60 cursor-pointer font-medium transition-colors"
            >
              <Flame className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              Overheat (95°C)
            </button>

            <button
              onClick={handleSimulateRtkLoss}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:border-amber-700/60 dark:text-amber-300 dark:hover:bg-amber-900/60 cursor-pointer font-medium transition-colors"
            >
              <ShieldAlert className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              Simulate RTK Loss
            </button>

            <button
              onClick={handleSimulateDegradedLink}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:border-indigo-700/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60 cursor-pointer font-medium transition-colors"
            >
              <Radio className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              Lag Spike (280ms)
            </button>

            <button
              onClick={handleResetOptimal}
              className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:border-emerald-700/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 cursor-pointer font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              Reset to Optimal
            </button>
          </div>
        </div>
      </div>

      {/* Column 2: GNSS & Electrical Subsystems */}
      <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] rounded-xl p-5 shadow-xs dark:shadow-md flex flex-col gap-5 transition-colors">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-semibold text-sm">
          <Navigation className="w-4 h-4" />
          <span>GNSS RTK & SENSOR ACCURACY</span>
        </div>

        {/* RTK Fix Selector */}
        <div>
          <label className="text-xs text-slate-600 dark:text-slate-300 block mb-1.5 font-medium">GNSS Fix Type:</label>
          <div className="grid grid-cols-4 gap-2">
            {['RTK', 'GPS', 'Float', 'NO_GPS'].map((fix) => (
              <button
                key={fix}
                onClick={() => updateHealth({ gnss_fix: fix })}
                className={`py-2 px-3 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                  health.gnss_fix === fix
                    ? fix === 'RTK'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-500 dark:text-emerald-300'
                      : fix === 'GPS'
                      ? 'bg-blue-50 border-blue-400 text-blue-800 dark:bg-blue-950 dark:border-blue-500 dark:text-blue-300'
                      : fix === 'Float'
                      ? 'bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-950 dark:border-amber-500 dark:text-amber-300'
                      : 'bg-rose-50 border-rose-400 text-rose-800 dark:bg-rose-950 dark:border-rose-500 dark:text-rose-300'
                    : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 dark:bg-[#161d2b] dark:border-[#253145] dark:text-slate-400 dark:hover:bg-[#1d2638]'
                }`}
              >
                {fix}
              </button>
            ))}
          </div>
        </div>

        {/* Standard Deviation SD */}
        <div>
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">Standard Deviation SD (Accuracy Error):</span>
            <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
              {health.gnss_sd < 0.1 ? `${(health.gnss_sd * 100).toFixed(1)} cm` : `${health.gnss_sd.toFixed(2)} m`}
            </span>
          </div>
          <input
            type="range"
            min="0.005"
            max="3.000"
            step="0.005"
            value={health.gnss_sd}
            onChange={(e) => updateHealth({ gnss_sd: parseFloat(e.target.value) })}
            className="w-full accent-indigo-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
            <span>0.01m (RTK Precision)</span>
            <span>1.0m (Standard GPS)</span>
            <span className="text-rose-500 dark:text-rose-400 font-medium">3.0m+ (Degraded)</span>
          </div>
        </div>

        {/* Battery Voltage */}
        <div className="pt-3 border-t border-slate-100 dark:border-[#1a2333]">
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1.5">
              <BatteryCharging className="w-3.5 h-3.5 text-amber-500" /> Alternator / 12V Battery:
            </span>
            <span className="font-mono font-bold text-amber-700 dark:text-yellow-300">{health.voltage.toFixed(1)} V</span>
          </div>
          <input
            type="range"
            min="10.5"
            max="14.8"
            step="0.1"
            value={health.voltage}
            onChange={(e) => updateHealth({ voltage: parseFloat(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        {/* Ping Latency */}
        <div className="pt-3 border-t border-slate-100 dark:border-[#1a2333]">
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" /> Wireless Link Ping:
            </span>
            <span className="font-mono font-bold text-cyan-700 dark:text-cyan-300">{health.ping_latency_ms} ms</span>
          </div>
          <input
            type="range"
            min="1"
            max="300"
            step="1"
            value={health.ping_latency_ms}
            onChange={(e) => updateHealth({ ping_latency_ms: parseInt(e.target.value) })}
            className="w-full accent-cyan-500 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
