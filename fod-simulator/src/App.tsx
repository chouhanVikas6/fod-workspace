import { useEffect } from 'react';
import { useSimulatorStore } from './store';
import Header from './component/Header';
import CommandTerminal from './component/CommandTerminal';
import ThroughputTab from './component/tabs/ThroughputTab';
import CamerasTab from './component/tabs/CamerasTab';
import HealthTab from './component/tabs/HealthTab';
import LocationTab from './component/tabs/LocationTab';
import ImagesTab from './component/tabs/ImagesTab';
import { Sliders, Camera, Activity, MapPin, Image as ImageIcon, AlertCircle } from 'lucide-react';

export default function App() {
  const {
    activeTab,
    setActiveTab,
    loadInitialState,
    setupListeners,
    cameras,
    folderImages,
    telemetry,
    theme,
    error,
  } = useSimulatorStore();

  useEffect(() => {
    // Sync initial theme
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }

    loadInitialState();
    let cleanup: (() => void) | undefined;
    setupListeners().then((unsub) => {
      cleanup = unsub;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [loadInitialState, setupListeners, theme]);

  const activeCamCount = cameras.filter((c) => c.enabled && c.connected).length;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100 text-slate-800 dark:bg-[#080c14] dark:text-slate-100 font-sans transition-colors">
      {/* Top Header & Master Action Bar */}
      <Header />

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 border-b border-rose-200 dark:bg-rose-950/80 dark:border-rose-700/60 px-6 py-2 text-xs text-rose-700 dark:text-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Tab Navigation Ribbon */}
      <div className="bg-white border-b border-slate-200 dark:bg-[#0c101a] dark:border-[#1a2333] px-6 flex items-center gap-2 select-none transition-colors">
        <button
          onClick={() => setActiveTab('throughput')}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'throughput'
              ? 'border-cyan-600 text-cyan-700 bg-cyan-50/60 dark:border-cyan-400 dark:text-cyan-300 dark:bg-[#121927]'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-[#101624]'
          }`}
        >
          <Sliders className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span>Throughput & Randomizer</span>
        </button>

        <button
          onClick={() => setActiveTab('cameras')}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'cameras'
              ? 'border-cyan-600 text-cyan-700 bg-cyan-50/60 dark:border-cyan-400 dark:text-cyan-300 dark:bg-[#121927]'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-[#101624]'
          }`}
        >
          <Camera className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>26-Camera Matrix</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#192336] dark:text-slate-300 dark:border-[#24334f] font-mono">
            {activeCamCount}/26
          </span>
        </button>

        <button
          onClick={() => setActiveTab('health')}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'health'
              ? 'border-cyan-600 text-cyan-700 bg-cyan-50/60 dark:border-cyan-400 dark:text-cyan-300 dark:bg-[#121927]'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-[#101624]'
          }`}
        >
          <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>BITE Health & RTK</span>
        </button>

        <button
          onClick={() => setActiveTab('location')}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'location'
              ? 'border-cyan-600 text-cyan-700 bg-cyan-50/60 dark:border-cyan-400 dark:text-cyan-300 dark:bg-[#121927]'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-[#101624]'
          }`}
        >
          <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Location Boundary & Radar</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#192336] dark:text-slate-300 dark:border-[#24334f] font-mono">
            {telemetry.current_heading.toFixed(0)}°
          </span>
        </button>

        <button
          onClick={() => setActiveTab('images')}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'images'
              ? 'border-cyan-600 text-cyan-700 bg-cyan-50/60 dark:border-cyan-400 dark:text-cyan-300 dark:bg-[#121927]'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-[#101624]'
          }`}
        >
          <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span>Images Feeder</span>
          {folderImages.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#192336] dark:text-slate-300 dark:border-[#24334f] font-mono">
              {folderImages.length}
            </span>
          )}
        </button>
      </div>

      {/* Main Tab Content View */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'throughput' && <ThroughputTab />}
        {activeTab === 'cameras' && <CamerasTab />}
        {activeTab === 'health' && <HealthTab />}
        {activeTab === 'location' && <LocationTab />}
        {activeTab === 'images' && <ImagesTab />}
      </main>

      {/* Inbound Command Terminal (Persistent in view) */}
      <CommandTerminal />
    </div>
  );
}