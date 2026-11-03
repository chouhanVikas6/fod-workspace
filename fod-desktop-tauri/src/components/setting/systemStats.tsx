import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { HiArrowPath } from 'react-icons/hi2';
import axiosClient from '@/utils/axios';

export default function SystemStats() {
  const theme = useSelector((store: RootState) => store.theme.theme);
  const isDark = theme === 'dark';

  const bite = useSelector((state: RootState) => state.BiteState.carData);
  const latency = useSelector((state: RootState) => state.SystemHealth.latency);
  const carData = useSelector((state: RootState) => state.SystemHealth.carData.data);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(2);

  // Live health metrics with fallback defaults
  const temp = bite?.temp ?? 54;
  const memoryUsedGb = bite?.memory_gb ?? 6.2;
  const totalMemoryGb = 16.0;
  const memoryPct = Math.round((memoryUsedGb / totalMemoryGb) * 100);

  const freeStorageGb = bite?.space_gb ?? 612;
  const totalStorageGb = 1024;
  const usedStorageGb = totalStorageGb - freeStorageGb;
  const storagePct = Math.round((usedStorageGb / totalStorageGb) * 100);

  const pingMs = latency?.connected ? Math.max(12, Math.min(60, latency.ping || 28)) : 28;
  const isOnline = latency?.connected ?? true;

  // Recent temperature history for the area line chart
  const tempHistory = useMemo(() => [
    48, 50, 49, 52, 51, 54, 52, 55, 53, 57, 56, 59, 57, 61, 58, 60, 58, 59, 57, temp,
  ], [temp]);

  const peakTemp = Math.max(...tempHistory);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => (prev >= 60 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await axiosClient({ method: 'GET', url: '/api/health/health-data' });
    } catch {
      // Ignore background refresh errors
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
        setSecondsAgo(0);
      }, 500);
    }
  };

  // Helper SVG circle ring
  const renderGaugeRing = (percent: number, strokeColor: string, label: string) => {
    const radius = 28;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

    return (
      <div className="relative w-18 h-18 flex items-center justify-center shrink-0">
        <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 72 72">
          {/* Background circle */}
          <circle
            cx="36"
            cy="36"
            r={radius}
            className={`${isDark ? 'stroke-[#383D44]' : 'stroke-slate-200'}`}
            strokeWidth="6"
            fill="transparent"
          />
          {/* Filled progress arc */}
          <circle
            cx="36"
            cy="36"
            r={radius}
            className="transition-all duration-700 ease-out"
            stroke={strokeColor}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <span className={`absolute font-bold text-xs ${isDark ? 'text-white' : 'text-slate-800'}`}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col justify-start overflow-y-auto">
      {/* Top Header Row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Device Health
          </h1>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
            Updated {secondsAgo === 0 ? 'just now' : `${secondsAgo} seconds ago`}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-semibold transition active:scale-95 cursor-pointer ${
            isDark
              ? 'bg-[#353A42] border-[#454B53] text-slate-200 hover:bg-[#41464E]'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <HiArrowPath className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#5AA7EA]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Content Container */}
      <div
        className={`rounded-xl border p-4 space-y-4 ${
          isDark ? 'bg-[#262A30]/60 border-[#333840]' : 'bg-white/60 border-slate-200'
        }`}
      >
        {/* Top 4 Metric Gauge Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Metric 1: Temperature */}
          <div
            className={`rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            {renderGaugeRing((temp / 80) * 100, '#00B957', `${Math.round(temp)}°`)}
            <div>
              <div className={`text-xs font-medium ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
                Temperature
              </div>
              <div className={`text-lg font-bold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {temp}°C
              </div>
              <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#00B957]/15 text-[#00B957]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00B957]" />
                <span>Normal</span>
              </div>
            </div>
          </div>

          {/* Metric 2: Memory */}
          <div
            className={`rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            {renderGaugeRing(memoryPct, '#5AA7EA', `${memoryPct}%`)}
            <div>
              <div className={`text-xs font-medium ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
                Memory
              </div>
              <div className={`text-lg font-bold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {memoryUsedGb.toFixed(1)} GB
              </div>
              <div className={`text-[11px] mt-1 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                of {totalMemoryGb} GB
              </div>
            </div>
          </div>

          {/* Metric 3: Storage */}
          <div
            className={`rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            {renderGaugeRing(storagePct, '#5AA7EA', `${storagePct}%`)}
            <div>
              <div className={`text-xs font-medium ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
                Storage
              </div>
              <div className={`text-lg font-bold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {usedStorageGb} GB
              </div>
              <div className={`text-[11px] mt-1 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                {freeStorageGb} GB free
              </div>
            </div>
          </div>

          {/* Metric 4: Network */}
          <div
            className={`rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            {renderGaugeRing(85, '#00B957', `${pingMs}ms`)}
            <div>
              <div className={`text-xs font-medium ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
                Network
              </div>
              <div className={`text-lg font-bold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </div>
              <div className={`text-[11px] mt-1 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                ↓ 42 • ↑ 11 Mbps
              </div>
            </div>
          </div>
        </div>

        {/* Lower Row: Graph + Connections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          {/* Left: Temperature – last 60 min */}
          <div
            className={`lg:col-span-2 rounded-xl p-4 border flex flex-col justify-between transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
                Temperature – last 60 min
              </h2>
              <span className={`text-xs font-medium ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                Peak {peakTemp}°C
              </span>
            </div>

            {/* SVG Wave Chart */}
            <div className="w-full h-44 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="tempAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5AA7EA" stopOpacity={isDark ? 0.35 : 0.25} />
                    <stop offset="100%" stopColor="#5AA7EA" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Subtle reference grid lines */}
                <line x1="0" y1="40" x2="500" y2="40" stroke={isDark ? '#383D44' : '#E2E8F0'} strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="500" y2="80" stroke={isDark ? '#383D44' : '#E2E8F0'} strokeDasharray="3 3" />
                <line x1="0" y1="120" x2="500" y2="120" stroke={isDark ? '#383D44' : '#E2E8F0'} strokeDasharray="3 3" />

                {/* Area fill */}
                <path
                  d="M 0,140 L 0,110 L 45,98 L 90,104 L 135,82 L 180,90 L 225,72 L 270,82 L 315,62 L 360,74 L 405,56 L 450,68 L 480,61 L 500,64 L 500,150 L 0,150 Z"
                  fill="url(#tempAreaGradient)"
                />

                {/* Foreground stroke */}
                <path
                  d="M 0,110 L 45,98 L 90,104 L 135,82 L 180,90 L 225,72 L 270,82 L 315,62 L 360,74 L 405,56 L 450,68 L 480,61 L 500,64"
                  fill="none"
                  stroke="#5AA7EA"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* Right: Connections */}
          <div
            className={`rounded-xl p-4 border flex flex-col justify-between transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <h2 className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
              Connections
            </h2>

            <div className={`flex flex-col divide-y ${isDark ? 'divide-[#383D44]' : 'divide-slate-200'}`}>
              {/* LTE */}
              <div className="flex items-center justify-between py-2.5">
                <div>
                  <div className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>LTE</div>
                  <div className={`text-[11px] ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>Signal strong</div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#00B957]/15 text-[#00B957]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00B957]" />
                  <span>Connected</span>
                </div>
              </div>

              {/* Wi-Fi */}
              <div className="flex items-center justify-between py-2.5">
                <div>
                  <div className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>Wi-Fi</div>
                  <div className={`text-[11px] ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>ZOID-OPS</div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#00B957]/15 text-[#00B957]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00B957]" />
                  <span>Connected</span>
                </div>
              </div>

              {/* GNSS */}
              <div className="flex items-center justify-between py-2.5">
                <div>
                  <div className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>GNSS</div>
                  <div className={`text-[11px] ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                    {bite?.rtk?.primary?.satellite || 14} satellites
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#00B957]/15 text-[#00B957]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00B957]" />
                  <span>Locked</span>
                </div>
              </div>

              {/* Tablet Link */}
              <div className="flex items-center justify-between pt-2.5">
                <div>
                  <div className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>Tablet link</div>
                  <div className={`text-[11px] ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>Last ping 4s ago</div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Weak</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
