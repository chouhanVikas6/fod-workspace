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
  const availableCommunication = useSelector(
    (state: RootState) => state.SystemHealth.availableCommunication
  );
  const carData = useSelector((state: RootState) => state.SystemHealth.carData.data);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(2);
  const [atcConnected, setAtcConnected] = useState(false);

  const isCarAvailable = Boolean(
    latency?.connected ||
      (availableCommunication as any[])?.some(
        (c: any) => c?.type === 'car' || c?.type?.startsWith('car')
      )
  );
  const isAtcAvailable = Boolean(
    atcConnected ||
      (availableCommunication as any[])?.some((c: any) => c?.type === 'atc')
  );

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

  const temperatureNodes = useMemo(
    () => [
      {
        id: 'car-server',
        name: 'Car Server',
        role: 'Vehicle Compute Node',
        tempC: isCarAvailable ? temp : null,
        online: isCarAvailable,
      },
      {
        id: 'atc-server',
        name: 'ATC Server',
        role: 'Tower / Ground Control',
        tempC: null as number | null, // Expandable when ATC temperature telemetry is added
        online: isAtcAvailable,
      },
    ],
    [temp, isCarAvailable, isAtcAvailable]
  );

  const getTempBadge = (tempC: number | null, online: boolean) => {
    if (!online) {
      return { label: 'Offline', cls: 'bg-rose-500/15 text-rose-500', dot: 'bg-rose-500', ring: '#64748b' };
    }
    if (tempC === null) {
      return { label: 'No telemetry', cls: 'bg-slate-500/15 text-slate-400', dot: 'bg-slate-400', ring: '#4C9FE8' };
    }
    if (tempC >= 80) {
      return { label: 'High', cls: 'bg-rose-500/15 text-rose-500', dot: 'bg-rose-500', ring: '#ef4444' };
    }
    if (tempC >= 65) {
      return { label: 'Warm', cls: 'bg-amber-500/15 text-amber-500', dot: 'bg-amber-500', ring: '#f59e0b' };
    }
    return { label: 'Normal', cls: 'bg-[#00B957]/15 text-[#00B957]', dot: 'bg-[#00B957]', ring: '#00B957' };
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => (prev >= 60 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkAtc = () => {
      axiosClient({ method: 'GET', url: '/api/health/atc-status' })
        .then((res) => setAtcConnected(Boolean(res?.data?.connected)))
        .catch(() => setAtcConnected(false));
    };
    checkAtc();
    const interval = setInterval(checkAtc, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        axiosClient({ method: 'GET', url: '/api/health/health-data' }),
        axiosClient({ method: 'GET', url: '/api/health/atc-status' }).then((res) =>
          setAtcConnected(Boolean(res?.data?.connected))
        ),
      ]);
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
// Compact SVG gauge ring
const renderGaugeRing = (
  percent: number,
  strokeColor: string,
  label: string
) => {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset =
    circumference -
    (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="relative flex h-[80px] w-[80px] shrink-0 items-center justify-center">
      <svg
        className="h-full w-full -rotate-90"
        viewBox="0 0 72 72"
      >
        <circle
          cx="36"
          cy="36"
          r={radius}
          className={isDark ? 'stroke-[#383D44]' : 'stroke-slate-200'}
          strokeWidth="9"
          fill="none"
        />

        <circle
          cx="36"
          cy="36"
          r={radius}
          stroke={strokeColor}
          strokeWidth="9"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-700 ease-out"
        />
      </svg>

      <span
        className={`absolute text-sm font-semibold ${
          isDark ? 'text-white' : 'text-slate-800'
        }`}
      >
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
          <HiArrowPath className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#4C9FE8]' : ''}`} />
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
            {renderGaugeRing(memoryPct, '#4C9FE8', `${memoryPct}%`)}
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
            {renderGaugeRing(storagePct, '#4C9FE8', `${storagePct}%`)}
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

        {/* Connections */}
        <div
          className={`rounded-xl p-4 border flex flex-col justify-between transition-all ${
            isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <h2 className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
            Connections
          </h2>

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 divide-y md:divide-y-0 ${isDark ? 'divide-[#383D44]' : 'divide-slate-200'}`}>
            {/* Car */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>Car</div>
                <div className={`text-[11px] ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                  {isCarAvailable
                    ? latency?.ping
                      ? `Connected • ${latency.ping} ms`
                      : 'Vehicle link active'
                    : 'Vehicle not in communication'}
                </div>
              </div>
              <div
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  isCarAvailable
                    ? 'bg-[#00B957]/15 text-[#00B957]'
                    : 'bg-rose-500/15 text-rose-500'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isCarAvailable ? 'bg-[#00B957]' : 'bg-rose-500'
                  }`}
                />
                <span>{isCarAvailable ? 'Available' : 'Unavailable'}</span>
              </div>
            </div>

            {/* ATC */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>ATC</div>
                <div className={`text-[11px] ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                  {isAtcAvailable ? 'ATC server reachable' : 'ATC server unreachable'}
                </div>
              </div>
              <div
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  isAtcAvailable
                    ? 'bg-[#00B957]/15 text-[#00B957]'
                    : 'bg-rose-500/15 text-rose-500'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isAtcAvailable ? 'bg-[#00B957]' : 'bg-rose-500'
                  }`}
                />
                <span>{isAtcAvailable ? 'Available' : 'Unavailable'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Temperatures Section (extensible for Car servers & ATC temps) */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Temperatures
            </h2>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
              Thermal telemetry across Car servers and ATC nodes
            </p>
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 space-y-4 ${
            isDark ? 'bg-[#262A30]/60 border-[#333840]' : 'bg-white/60 border-slate-200'
          }`}
        >
          {/* Per-Server Temperature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {temperatureNodes.map((node) => {
              const badge = getTempBadge(node.tempC, node.online);
              const pct = node.tempC !== null ? (node.tempC / 100) * 100 : 0;
              const ringLabel = node.tempC !== null ? `${Math.round(node.tempC)}°` : '—';
              return (
                <div
                  key={node.id}
                  className={`rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
                    isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  {renderGaugeRing(pct, badge.ring, ringLabel)}
                  <div className="min-w-0">
                    <div className={`text-xs font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {node.name}
                    </div>
                    <div className={`text-[11px] truncate ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                      {node.role}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-base font-bold font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {node.tempC !== null ? `${node.tempC}°C` : '—'}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        <span>{badge.label}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Temperature – last 60 min */}
          <div
            className={`rounded-xl p-4 border flex flex-col justify-between transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
                Car Server Temperature – last 60 min
              </h3>
              <span className={`text-xs font-medium ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                Peak {peakTemp}°C
              </span>
            </div>

            <div className="w-full h-40 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="tempAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4C9FE8" stopOpacity={isDark ? 0.35 : 0.25} />
                    <stop offset="100%" stopColor="#4C9FE8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                <line x1="0" y1="40" x2="500" y2="40" stroke={isDark ? '#383D44' : '#E2E8F0'} strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="500" y2="80" stroke={isDark ? '#383D44' : '#E2E8F0'} strokeDasharray="3 3" />
                <line x1="0" y1="120" x2="500" y2="120" stroke={isDark ? '#383D44' : '#E2E8F0'} strokeDasharray="3 3" />

                <path
                  d="M 0,140 L 0,110 L 45,98 L 90,104 L 135,82 L 180,90 L 225,72 L 270,82 L 315,62 L 360,74 L 405,56 L 450,68 L 480,61 L 500,64 L 500,150 L 0,150 Z"
                  fill="url(#tempAreaGradient)"
                />

                <path
                  d="M 0,110 L 45,98 L 90,104 L 135,82 L 180,90 L 225,72 L 270,82 L 315,62 L 360,74 L 405,56 L 450,68 L 480,61 L 500,64"
                  fill="none"
                  stroke="#4C9FE8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
