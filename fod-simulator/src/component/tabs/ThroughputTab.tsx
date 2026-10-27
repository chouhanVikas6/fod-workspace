import { useSimulatorStore } from '../../store';
import { Gauge, ShieldAlert, Sparkles } from 'lucide-react';

export default function ThroughputTab() {
  const { config, random, custom, updateConfig, updateRandom, updateCustom } = useSimulatorStore();

  const presetFrequencies = [0.5, 1.0, 5.0, 10.0, 20.0, 50.0, 100.0, 150.0, 200.0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 select-none transition-colors">
      {/* Column 1: Throughput & Volume Controls */}
      <div className="flex flex-col gap-6">
        {/* Card: Throughput Rate */}
        <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] rounded-xl p-5 shadow-xs dark:shadow-md transition-colors">
          <div className="flex items-center gap-2 mb-4 text-cyan-600 dark:text-cyan-400 font-semibold text-sm">
            <Gauge className="w-4 h-4" />
            <span>FOD THROUGHPUT FREQUENCY</span>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="flex justify-between items-center mb-1.5 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Throughput Rate:</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-50 dark:bg-[#141b29] border border-slate-300 dark:border-[#253248] rounded px-2 py-0.5 focus-within:border-cyan-500">
                    <input
                      type="number"
                      min="0.1"
                      max="200"
                      step="0.5"
                      value={config.throughput_hz}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          updateConfig({ throughput_hz: Math.min(200, Math.max(0.1, val)) });
                        }
                      }}
                      className="w-14 bg-transparent font-mono text-xs font-bold text-cyan-700 dark:text-cyan-300 text-right outline-none"
                    />
                    <span className="font-mono text-xs text-slate-400 ml-1">Hz</span>
                  </div>
                  <span className="font-mono font-medium text-slate-500 dark:text-slate-400 text-xs">
                    ({Math.round(config.throughput_hz * config.batch_size)} det/s)
                  </span>
                </div>
              </div>
              <input
                type="range"
                min="0.1"
                max="200.0"
                step="0.5"
                value={config.throughput_hz}
                onChange={(e) => updateConfig({ throughput_hz: parseFloat(e.target.value) })}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
                <span>0.1 Hz</span>
                <span>50 Hz</span>
                <span>100 Hz</span>
                <span>150 Hz</span>
                <span>200 Hz (Max)</span>
              </div>
            </div>

            {/* Frequency Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-1">Presets:</span>
              {presetFrequencies.map((f) => (
                <button
                  key={f}
                  onClick={() => updateConfig({ throughput_hz: f })}
                  className={`px-2 py-0.5 rounded text-xs font-mono font-medium border cursor-pointer transition-colors ${
                    config.throughput_hz === f
                      ? 'bg-cyan-50 border-cyan-400 text-cyan-700 dark:bg-cyan-950 dark:border-cyan-500 dark:text-cyan-300'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 dark:bg-[#161f30] dark:border-[#243147] dark:text-slate-300 dark:hover:bg-[#1e2a40]'
                  }`}
                >
                  {f} Hz
                </button>
              ))}
            </div>

            {/* Batch Size */}
            <div className="pt-3 border-t border-slate-100 dark:border-[#1a2333]">
              <div className="flex justify-between items-center mb-1 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Detections per Batch:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{config.batch_size}</span>
              </div>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={config.batch_size}
                onChange={(e) => updateConfig({ batch_size: parseInt(e.target.value) })}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Packs {config.batch_size} detections into each gRPC DetectionBatch message.
              </span>
            </div>

            {/* Quota Limiter */}
            <div className="pt-3 border-t border-slate-100 dark:border-[#1a2333]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Total Data Sent Target:</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.total_target_count === null}
                    onChange={(e) =>
                      updateConfig({ total_target_count: e.target.checked ? null : 1000 })
                    }
                    className="accent-cyan-500"
                  />
                  Infinite Stream
                </label>
              </div>

              {config.total_target_count !== null && (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    step="100"
                    value={config.total_target_count}
                    onChange={(e) =>
                      updateConfig({ total_target_count: parseInt(e.target.value) || 100 })
                    }
                    className="w-40 bg-slate-50 border border-slate-300 dark:bg-[#151c2a] dark:border-[#253247] px-3 py-1.5 rounded-lg text-sm font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                  />
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Automatically stops when target is reached.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card: Custom Payload & Fault Injection */}
        <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] rounded-xl p-5 shadow-xs dark:shadow-md transition-colors">
          <div className="flex items-center gap-2 mb-3 text-amber-600 dark:text-amber-400 font-semibold text-sm">
            <ShieldAlert className="w-4 h-4" />
            <span>CUSTOM PAYLOAD & FAULT INJECTION</span>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={custom.use_custom}
                onChange={(e) => updateCustom({ use_custom: e.target.checked })}
                className="accent-amber-500"
              />
              <span className="font-semibold">Enable Custom Overrides</span>
            </label>

            {custom.use_custom && (
              <div className="flex flex-col gap-3 p-3.5 bg-slate-50 border border-slate-200 dark:bg-[#151c2a] dark:border-[#253247] rounded-lg">
                <div>
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1 font-medium">
                    Fixed Classification Override:
                  </label>
                  <input
                    type="text"
                    value={custom.custom_class || ''}
                    onChange={(e) => updateCustom({ custom_class: e.target.value || null })}
                    placeholder="e.g. CustomBolt_M8 or Organic"
                    className="w-full bg-white border border-slate-300 dark:bg-[#101624] dark:border-[#222c3f] px-2.5 py-1.5 rounded text-xs font-mono text-slate-900 dark:text-white outline-none"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-slate-200 dark:border-[#222c3f]">
                  <label className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={custom.corrupt_image}
                      onChange={(e) => updateCustom({ corrupt_image: e.target.checked })}
                      className="accent-rose-500"
                    />
                    <span>Inject Corrupted JPEG Bytes (Tests CAS resilience)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={custom.force_invalid_coords}
                      onChange={(e) => updateCustom({ force_invalid_coords: e.target.checked })}
                      className="accent-rose-500"
                    />
                    <span>Force Invalid Coordinates: (lat, lon) = (-1.0, -1.0)</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Column 2: Randomization Distributions */}
      <div className="bg-white border border-slate-200 dark:bg-[#0f1422] dark:border-[#1e293b] rounded-xl p-5 shadow-xs dark:shadow-md flex flex-col gap-5 transition-colors">
        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-semibold text-sm">
          <Sparkles className="w-4 h-4" />
          <span>FOD RANDOMIZATION & BOUNDS</span>
        </div>

        {/* Size Range */}
        <div>
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">Object Size Bounds:</span>
            <span className="font-mono text-purple-700 dark:text-purple-300 text-xs font-semibold">
              {random.min_size_cm.toFixed(1)} cm – {random.max_size_cm.toFixed(1)} cm
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block mb-0.5">Min Size (cm):</span>
              <input
                type="number"
                min="0.1"
                max="50.0"
                step="0.5"
                value={random.min_size_cm}
                onChange={(e) => updateRandom({ min_size_cm: parseFloat(e.target.value) || 0.5 })}
                className="w-full bg-slate-50 border border-slate-300 dark:bg-[#151c2a] dark:border-[#253247] px-2.5 py-1 rounded text-xs font-mono text-slate-900 dark:text-white outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block mb-0.5">Max Size (cm):</span>
              <input
                type="number"
                min="1.0"
                max="100.0"
                step="0.5"
                value={random.max_size_cm}
                onChange={(e) => updateRandom({ max_size_cm: parseFloat(e.target.value) || 20.0 })}
                className="w-full bg-slate-50 border border-slate-300 dark:bg-[#151c2a] dark:border-[#253247] px-2.5 py-1 rounded text-xs font-mono text-slate-900 dark:text-white outline-none"
              />
            </div>
          </div>
        </div>

        {/* Confidence Range */}
        <div>
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">Confidence Score Bounds:</span>
            <span className="font-mono text-purple-700 dark:text-purple-300 text-xs font-semibold">
              {(random.min_confidence * 100).toFixed(0)}% – {(random.max_confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block mb-0.5">Min Confidence:</span>
              <input
                type="number"
                min="0.50"
                max="0.99"
                step="0.05"
                value={random.min_confidence}
                onChange={(e) => updateRandom({ min_confidence: parseFloat(e.target.value) || 0.7 })}
                className="w-full bg-slate-50 border border-slate-300 dark:bg-[#151c2a] dark:border-[#253247] px-2.5 py-1 rounded text-xs font-mono text-slate-900 dark:text-white outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block mb-0.5">Max Confidence:</span>
              <input
                type="number"
                min="0.70"
                max="1.00"
                step="0.01"
                value={random.max_confidence}
                onChange={(e) => updateRandom({ max_confidence: parseFloat(e.target.value) || 0.99 })}
                className="w-full bg-slate-50 border border-slate-300 dark:bg-[#151c2a] dark:border-[#253247] px-2.5 py-1 rounded text-xs font-mono text-slate-900 dark:text-white outline-none"
              />
            </div>
          </div>
        </div>

        {/* Classification Probability Weights */}
        <div className="pt-3 border-t border-slate-100 dark:border-[#1a2333]">
          <span className="text-xs text-slate-600 dark:text-slate-300 font-semibold block mb-2">
            Classification Distribution Weights:
          </span>
          <div className="flex flex-col gap-2.5 text-xs">
            <div>
              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                <span className="text-rose-600 dark:text-red-400 font-semibold">Metallic (Bolts, Wire, Tools):</span>
                <span className="font-mono">{random.weight_metallic}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={random.weight_metallic}
                onChange={(e) => updateRandom({ weight_metallic: parseFloat(e.target.value) })}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">Non-Metallic (Rubber, Plastic):</span>
                <span className="font-mono">{random.weight_non_metallic}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={random.weight_non_metallic}
                onChange={(e) => updateRandom({ weight_non_metallic: parseFloat(e.target.value) })}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Organic (Wildlife, Leaves):</span>
                <span className="font-mono">{random.weight_organic}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={random.weight_organic}
                onChange={(e) => updateRandom({ weight_organic: parseFloat(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                <span className="text-amber-600 dark:text-amber-400 font-semibold">Rocks & Asphalt Aggregate:</span>
                <span className="font-mono">{random.weight_rock}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={random.weight_rock}
                onChange={(e) => updateRandom({ weight_rock: parseFloat(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
