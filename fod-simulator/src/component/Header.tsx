import { useSimulatorStore } from '../store';
import {
  Play,
  Pause,
  Square,
  Zap,
  FastForward,
  Radio,
  Server,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Sun,
  Moon,
} from 'lucide-react';

export default function Header() {
  const {
    config,
    telemetry,
    grpcConnected,
    theme,
    toggleTheme,
    startSimulation,
    pauseSimulation,
    resumeSimulation,
    stopSimulation,
    stepSingleFod,
    burstFods,
    testGrpcConnection,
    updateConfig,
  } = useSimulatorStore();

  const handleStartResume = () => {
    if (telemetry.paused) {
      resumeSimulation();
    } else {
      startSimulation();
    }
  };

  const formatUptime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const quotaPercent = config.total_target_count
    ? Math.min(100, Math.round((telemetry.total_sent / config.total_target_count) * 100))
    : null;

  return (
    <header className="bg-white border-b border-slate-200 dark:bg-[#0c101a] dark:border-[#1a2333] px-6 py-4 flex flex-col gap-4 select-none transition-colors">
      {/* Top Row: Title, Endpoint, Theme Switcher & Status */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-sm">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            ZOID FOD SIMULATOR
          </h1>
        </div>

        {/* Server Endpoint, Theme Toggle & Status Pill */}
        <div className="flex items-center gap-3">
          {/* Target gRPC */}
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 dark:bg-[#131926] dark:border-[#222d40] px-3 py-1.5 rounded-lg text-xs">
            <Server className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              value={config.grpc_endpoint}
              onChange={(e) => updateConfig({ grpc_endpoint: e.target.value })}
              className="bg-transparent text-slate-800 dark:text-slate-200 outline-none w-44 font-mono text-xs"
              placeholder="http://127.0.0.1:50051"
            />
            <button
              onClick={() => testGrpcConnection(config.grpc_endpoint)}
              title="Test Connection"
              className="px-2 py-0.5 rounded bg-white hover:bg-slate-200 border border-slate-300 text-[11px] font-medium text-slate-700 dark:bg-[#1a2336] dark:hover:bg-[#25324d] dark:border-[#2c3b54] dark:text-cyan-300 transition-colors cursor-pointer"
            >
              Ping
            </button>
            {grpcConnected === true && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ready
              </span>
            )}
            {grpcConnected === false && (
              <span className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5" /> Offline
              </span>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-[#131926] dark:hover:bg-[#1c2538] dark:border-[#222d40] dark:text-slate-300 transition-colors cursor-pointer text-xs font-medium"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-500" />
                <span>Dark</span>
              </>
            )}
          </button>

          {/* Status Badge */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider border ${
              telemetry.running
                ? telemetry.paused
                  ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/40 dark:border-amber-600/50 dark:text-amber-400'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-600/50 dark:text-emerald-400'
                : 'bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-900/60 dark:border-slate-700/80 dark:text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                telemetry.running
                  ? telemetry.paused
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-emerald-500 animate-pulse'
                  : 'bg-slate-400 dark:bg-slate-500'
              }`}
            />
            {telemetry.running ? (telemetry.paused ? 'PAUSED' : 'STREAMING') : 'IDLE'}
          </div>
        </div>
      </div>

      {/* Bottom Row: Controls & Stats Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-slate-50 border border-slate-200 dark:bg-[#111724] dark:border-[#1d273a] p-3 rounded-xl transition-colors">
        {/* Main Action Buttons */}
        <div className="flex items-center gap-2">
          {!telemetry.running || telemetry.paused ? (
            <button
              onClick={handleStartResume}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-sm cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              {telemetry.paused ? 'RESUME' : 'START SIM'}
            </button>
          ) : (
            <button
              onClick={pauseSimulation}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-all shadow-sm cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5 fill-white" />
              PAUSE
            </button>
          )}

          <button
            onClick={stopSimulation}
            disabled={!telemetry.running}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              telemetry.running
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm cursor-pointer'
                : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
            }`}
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            STOP
          </button>

          <div className="h-6 w-px bg-slate-300 dark:bg-slate-700/60 mx-1" />

          {/* Step & Burst Buttons */}
          <button
            onClick={stepSingleFod}
            title="Fire a single FOD detection packet"
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 dark:bg-[#182133] dark:hover:bg-[#212c44] dark:border-[#27354f] dark:text-slate-200 text-xs font-medium cursor-pointer transition-colors shadow-2xs"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-yellow-400" />
            Step 1
          </button>

          <button
            onClick={() => burstFods(10)}
            title="Instantly burst 10 FOD detections"
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 dark:bg-[#182133] dark:hover:bg-[#212c44] dark:border-[#27354f] dark:text-slate-200 text-xs font-medium cursor-pointer transition-colors shadow-2xs"
          >
            <FastForward className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            Burst 10
          </button>

          <button
            onClick={() => burstFods(50)}
            title="Instantly burst 50 FOD detections"
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 dark:bg-[#182133] dark:hover:bg-[#212c44] dark:border-[#27354f] dark:text-slate-200 text-xs font-medium cursor-pointer transition-colors shadow-2xs"
          >
            <FastForward className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            Burst 50
          </button>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-6 text-xs">
          {/* Sent / Target */}
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <div>
              <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider font-semibold">
                Dispatched
              </div>
              <div className="font-mono font-bold text-slate-900 dark:text-white">
                {telemetry.total_sent.toLocaleString()}{' '}
                {config.total_target_count && (
                  <span className="text-slate-400 dark:text-slate-500 font-normal">
                    / {config.total_target_count.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quota Gauge */}
          {quotaPercent !== null && (
            <div className="w-20 bg-slate-200 dark:bg-[#0c1018] h-2 rounded-full overflow-hidden border border-slate-300 dark:border-[#1d273a]">
              <div
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300"
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
          )}

          {/* Ingest Status */}
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider font-semibold">
                Accepted / Rej
              </div>
              <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {telemetry.total_accepted.toLocaleString()}{' '}
                <span className="text-rose-500 dark:text-rose-400 font-normal">({telemetry.total_rejected})</span>
              </div>
            </div>
          </div>

          {/* Rate */}
          <div>
            <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider font-semibold">
              Rate
            </div>
            <div className="font-mono font-bold text-cyan-700 dark:text-cyan-300">
              {config.throughput_hz.toFixed(1)} Hz
            </div>
          </div>

          {/* Uptime */}
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
              {formatUptime(telemetry.uptime_secs)}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
