import { useState } from 'react';
import { useSimulatorStore } from '../store';
import { Terminal, Send, Trash2, Zap } from 'lucide-react';

export default function CommandTerminal() {
  const { commandLogs, config, updateConfig, injectMockCommand, clearCommandLogs } = useSimulatorStore();
  const [customCmd, setCustomCmd] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const handleInject = (cmdToInject?: string) => {
    const cmd = cmdToInject || customCmd;
    if (cmd.trim()) {
      injectMockCommand(cmd.trim());
      if (!cmdToInject) setCustomCmd('');
    }
  };

  const filteredLogs = commandLogs.filter((log) => {
    if (filter === 'all') return true;
    return log.command_type.toLowerCase() === filter.toLowerCase();
  });

  const getCmdColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'pause':
        return 'bg-amber-950/80 text-amber-300 border-amber-700/60';
      case 'resume':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60';
      case 'start':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60';
      case 'stop':
        return 'bg-rose-950/80 text-rose-300 border-rose-700/60';
      default:
        return 'bg-slate-900 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="bg-white border-t border-slate-200 dark:bg-[#0c101a] dark:border-[#1a2333] p-4 flex flex-col gap-3 select-none transition-colors">
      {/* Terminal Header & Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-xs font-bold text-slate-900 dark:text-white tracking-wider uppercase">
            INBOUND CAR & PPM COMMAND TERMINAL
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-[#161e2e] dark:text-cyan-300 dark:border-[#223048]">
            {commandLogs.length} events
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {/* Auto React Toggle */}
          <label className="flex items-center gap-2 cursor-pointer bg-slate-100 border border-slate-200 dark:bg-[#131926] dark:border-[#212c40] px-2.5 py-1 rounded-lg">
            <input
              type="checkbox"
              checked={config.auto_react}
              onChange={(e) => updateConfig({ auto_react: e.target.checked })}
              className="accent-emerald-500"
            />
            <span className="flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-200 font-semibold">
              <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              Auto-React Engine
            </span>
          </label>

          {/* Filter Dropdown */}
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
            <span>Filter:</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-slate-100 border border-slate-200 dark:bg-[#131926] dark:border-[#212c40] rounded px-2 py-0.5 text-slate-800 dark:text-slate-200 outline-none text-xs font-medium"
            >
              <option value="all">All Events</option>
              <option value="pause">Pause</option>
              <option value="resume">Resume</option>
              <option value="start">Start</option>
              <option value="stop">Stop</option>
            </select>
          </div>

          {/* Clear Logs */}
          <button
            onClick={clearCommandLogs}
            title="Clear Terminal Logs"
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Quick Mock Injections & Manual Input */}
      <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-200 dark:bg-[#101522] dark:border-[#1e273a] p-2 rounded-lg transition-colors">
        <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
          Test Injections:
        </span>
        <button
          onClick={() => handleInject('pause')}
          className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 dark:border-amber-700/50 dark:text-amber-300 text-[11px] font-mono cursor-pointer transition-colors"
        >
          pause
        </button>
        <button
          onClick={() => handleInject('resume')}
          className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 dark:border-emerald-700/50 dark:text-emerald-300 text-[11px] font-mono cursor-pointer transition-colors"
        >
          resume
        </button>
        <button
          onClick={() => handleInject('pause_flir02')}
          className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 dark:border-amber-700/50 dark:text-amber-300 text-[11px] font-mono cursor-pointer transition-colors"
        >
          pause_flir02
        </button>
        <button
          onClick={() => handleInject('resume_flir02')}
          className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 dark:border-emerald-700/50 dark:text-emerald-300 text-[11px] font-mono cursor-pointer transition-colors"
        >
          resume_flir02
        </button>
        <button
          onClick={() => handleInject('start_101_flir00')}
          className="px-2 py-0.5 rounded bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-800 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/80 dark:border-cyan-700/50 dark:text-cyan-300 text-[11px] font-mono cursor-pointer transition-colors"
        >
          start_101_flir00
        </button>
        <button
          onClick={() => handleInject('stop_flir05')}
          className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 dark:border-rose-700/50 dark:text-rose-300 text-[11px] font-mono cursor-pointer transition-colors"
        >
          stop_flir05
        </button>

        <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

        {/* Custom Input */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
          <input
            type="text"
            value={customCmd}
            onChange={(e) => setCustomCmd(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInject()}
            placeholder="Type custom command: pause_<cam>, resume_<cam>..."
            className="flex-1 bg-white border border-slate-300 dark:bg-[#141b2a] dark:border-[#222f44] px-2.5 py-1 rounded text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-cyan-500"
          />
          <button
            onClick={() => handleInject()}
            className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
          >
            <Send className="w-3 h-3" />
            Send
          </button>
        </div>
      </div>

      {/* Log Feed Console */}
      <div className="h-32 bg-[#090d16] border border-[#1b2436] rounded-lg p-3 font-mono text-xs overflow-y-auto flex flex-col gap-1.5 shadow-inner">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 italic text-[11px] py-4 text-center">
            No incoming commands logged yet. Use the test injections above or trigger scan toggles from the Car.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString();
            return (
              <div
                key={log.id}
                className="flex items-center justify-between text-[11px] hover:bg-[#111726] px-1.5 py-0.5 rounded transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">{timeStr}</span>
                  <span className={`px-1.5 py-0.2 rounded border text-[10px] font-bold uppercase ${getCmdColor(log.command_type)}`}>
                    {log.command_type}
                  </span>
                  <span className="text-slate-100 font-medium">{log.raw_command}</span>
                  {log.target_cam && (
                    <span className="text-cyan-400 bg-cyan-950/70 px-1 rounded text-[10px] border border-cyan-800">
                      Target: {log.target_cam}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {log.auto_reacted ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                      <Zap className="w-3 h-3" /> Auto-Reacted
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">Logged Only</span>
                  )}
                  <span className="text-[10px] text-slate-400">[{log.status}]</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
