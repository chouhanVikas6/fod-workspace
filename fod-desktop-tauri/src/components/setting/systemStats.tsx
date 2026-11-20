import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { update_SystemHealth } from '@/store/slices/system-health-slice';
import { HiArrowPath } from 'react-icons/hi2';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import axiosClient from '@/utils/axios';

interface TabletBatteryState {
  available: boolean;
  percentage: number | null;
  charging: boolean;
  status: string;
}

interface SerialPortOption {
  portName: string;
  description: string;
  vid: string | null;
  pid: string | null;
  isEsp32Bridge: boolean;
  isUblox: boolean;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
const toCardinal = (deg: number) => {
  const norm = ((deg % 360) + 360) % 360;
  return CARDINALS[Math.floor((norm + 22.5) / 45) % 8];
};

export default function SystemStats() {
  const dispatch = useDispatch();
  const theme = useSelector((store: RootState) => store.theme.theme);
  const isDark = theme === 'dark';

  const bite = useSelector((state: RootState) => state.BiteState.carData);
  const atcHealth = useSelector((state: RootState) => state.BiteState.atcData);
  const latency = useSelector((state: RootState) => state.SystemHealth.latency);
  const availableCommunication = useSelector(
    (state: RootState) => state.SystemHealth.availableCommunication
  );
  const RtkData = useSelector((state: RootState) => state.SystemHealth.RtkData);
  const magnetometer = useSelector((state: RootState) => state.SystemHealth.magnetometer);
  const carData = useSelector((state: RootState) => state.SystemHealth.carData.data);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(2);
  const [atcConnected, setAtcConnected] = useState(false);
  const [serialPorts, setSerialPorts] = useState<SerialPortOption[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('auto');
  const [offsetDraft, setOffsetDraft] = useState<string>('0');
  const [declDraft, setDeclDraft] = useState<string>('0');
  const [magBusy, setMagBusy] = useState<boolean>(false);
  const [tabletBattery, setTabletBattery] = useState<TabletBatteryState>({
    available: false,
    percentage: null,
    charging: false,
    status: 'Unavailable',
  });

  const refreshMagState = useCallback(async () => {
    try {
      const mag: any = await invoke('get_magnetometer_state');
      if (mag && typeof mag === 'object') {
        dispatch(update_SystemHealth({ magnetometer: mag }));
      }
    } catch {
      // Ignore if Tauri IPC unavailable
    }
  }, [dispatch]);

  const refreshSerialPorts = useCallback(async () => {
    try {
      const ports = await invoke<SerialPortOption[]>('list_serial_ports');
      if (Array.isArray(ports)) setSerialPorts(ports);
    } catch {
      // Ignore if Tauri IPC unavailable
    }
  }, []);

  useEffect(() => {
    refreshMagState();
    refreshSerialPorts();
  }, [refreshMagState, refreshSerialPorts]);

  const magData = (magnetometer?.data as any) || {};
  const isMagLive = Boolean(magData?.connected && typeof magData?.heading === 'number');
  const isCalibrating = Boolean(magData?.calibrating);
  const gnssHeading =
    typeof (RtkData?.data as any)?.heading === 'number' &&
    (RtkData?.data as any)?.fix &&
    (RtkData?.data as any)?.fix !== 'NO_GPS'
      ? (RtkData.data as any).heading
      : null;
  const headingDeg: number | null = isMagLive
    ? magData.heading
    : typeof gnssHeading === 'number'
      ? gnssHeading
      : null;
  const headingCardinal = headingDeg !== null ? toCardinal(headingDeg) : '--';

  const prevHeadingModRef = useRef<number | null>(null);
  const unwrappedHeadingRef = useRef<number>(0);
  const needleRotationDeg = useMemo(() => {
    if (headingDeg === null || !Number.isFinite(headingDeg)) {
      return unwrappedHeadingRef.current;
    }
    const norm = ((headingDeg % 360) + 360) % 360;
    if (prevHeadingModRef.current === null) {
      prevHeadingModRef.current = norm;
      unwrappedHeadingRef.current = norm;
      return norm;
    }
    const delta = ((norm - prevHeadingModRef.current + 540) % 360) - 180;
    prevHeadingModRef.current = norm;
    unwrappedHeadingRef.current += delta;
    return unwrappedHeadingRef.current;
  }, [headingDeg]);

  useEffect(() => {
    if (typeof magData?.headingOffsetDeg === 'number') {
      setOffsetDraft(String(magData.headingOffsetDeg));
    }
  }, [magData?.headingOffsetDeg]);

  useEffect(() => {
    if (typeof magData?.declinationDeg === 'number') {
      setDeclDraft(String(magData.declinationDeg));
    }
  }, [magData?.declinationDeg]);

  const runMagAction = async (
    cmd: string,
    args?: Record<string, any>,
    successMsg?: string
  ) => {
    setMagBusy(true);
    try {
      await invoke(cmd, args);
      await refreshMagState();
      if (successMsg) toast.success(successMsg);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : err?.message || `Failed: ${cmd}`);
    } finally {
      setMagBusy(false);
    }
  };

  const fetchTabletBattery = useCallback(async () => {
    try {
      const nativeRes = await invoke<TabletBatteryState>('get_tablet_battery');
      if (nativeRes?.available && typeof nativeRes.percentage === 'number') {
        setTabletBattery(nativeRes);
        return;
      }
    } catch {
      // Fallback to Web Battery API if running outside Tauri or native probe unavailable
    }

    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && typeof nav.getBattery === 'function') {
        const bm = await nav.getBattery();
        if (bm && typeof bm.level === 'number' && isFinite(bm.level)) {
          const pct = Math.round(Math.min(100, Math.max(0, bm.level * 100)));
          const charging = Boolean(bm.charging);
          setTabletBattery({
            available: true,
            percentage: pct,
            charging,
            status: charging ? (pct >= 99 ? 'Full' : 'Charging') : 'Discharging',
          });
          return;
        }
      }
    } catch {
      // Battery API unsupported
    }

    setTabletBattery({ available: false, percentage: null, charging: false, status: 'Unavailable' });
  }, []);

  const isCarAvailable = Boolean(
    latency?.connected ||
      (availableCommunication as any[])?.some(
        (c: any) => c?.type === 'car' || c?.type?.startsWith('car')
      )
  );
  const isAtcAvailable = Boolean(
    atcConnected ||
      atcHealth?.connected ||
      (availableCommunication as any[])?.some((c: any) => c?.type === 'atc')
  );

  // Live Car health metrics (only shown when collector is connected to Car)
  const hasCarTelemetry = isCarAvailable && Boolean(bite?.updatedAt && bite.updatedAt !== '1970-01-01T00:00:00.000Z');
  const temp = hasCarTelemetry && typeof bite?.temp === 'number' && bite.temp > 0 ? bite.temp : null;
  const memoryUsedGb = hasCarTelemetry ? (bite?.memory_gb ?? 0) : null;
  const totalMemoryGb = 32.0;
  const memoryPct =
    hasCarTelemetry
      ? Math.round(bite?.memory_pct ?? ((memoryUsedGb ?? 0) / totalMemoryGb) * 100)
      : 0;

  const freeStorageGb = hasCarTelemetry ? (bite?.space_gb ?? 0) : null;
  const totalStorageGb = 500;
  const usedStorageGb = freeStorageGb !== null ? Math.max(0, totalStorageGb - freeStorageGb) : null;
  const storagePct =
    hasCarTelemetry
      ? Math.round(bite?.disk_pct ?? (((usedStorageGb ?? 0) / totalStorageGb) * 100))
      : 0;

  const pingMs = latency?.connected ? Math.max(12, Math.min(200, latency.ping || 28)) : 0;
  const isOnline = isCarAvailable;

  // Recent temperature history for the area line chart
  const tempHistory = useMemo(() => {
    const base = temp ?? 0;
    return [base, base, base, base, base, base, base, base, base, base];
  }, [temp]);

  const peakTemp = temp !== null ? Math.max(...tempHistory) : null;

  const temperatureNodes = useMemo(
    () => [
      {
        id: 'car-server',
        name: 'Car Server',
        role: 'Vehicle Compute Node',
        tempC: temp,
        online: isCarAvailable,
      },
      {
        id: 'atc-server',
        name: 'ATC Server',
        role: atcHealth
          ? `Disk ${Math.round(atcHealth.disk_pct || 0)}% • Mem ${Math.round(atcHealth.memory_pct || 0)}%`
          : 'Tower / Ground Control',
        tempC: isAtcAvailable && typeof atcHealth?.temp === 'number' && atcHealth.temp > 0 ? atcHealth.temp : null,
        online: isAtcAvailable,
      },
    ],
    [temp, isCarAvailable, isAtcAvailable, atcHealth]
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

  useEffect(() => {
    fetchTabletBattery();
    const interval = setInterval(fetchTabletBattery, 15000);

    let batteryObj: any = null;
    const onBatteryChange = () => {
      fetchTabletBattery();
    };
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.getBattery === 'function') {
      nav
        .getBattery()
        .then((bm: any) => {
          batteryObj = bm;
          bm?.addEventListener?.('levelchange', onBatteryChange);
          bm?.addEventListener?.('chargingchange', onBatteryChange);
        })
        .catch(() => {});
    }

    return () => {
      clearInterval(interval);
      batteryObj?.removeEventListener?.('levelchange', onBatteryChange);
      batteryObj?.removeEventListener?.('chargingchange', onBatteryChange);
    };
  }, [fetchTabletBattery]);

  const hasTabletBattery =
    tabletBattery.available &&
    typeof tabletBattery.percentage === 'number' &&
    isFinite(tabletBattery.percentage);

  const batteryBadge = useMemo(() => {
    const pct = tabletBattery.percentage ?? 0;
    if (tabletBattery.charging) {
      return { label: 'Charging', cls: 'bg-[#00B957]/15 text-[#00B957]', dot: 'bg-[#00B957]', ring: '#00B957' };
    }
    if (tabletBattery.status === 'Full') {
      return { label: 'Full', cls: 'bg-[#00B957]/15 text-[#00B957]', dot: 'bg-[#00B957]', ring: '#00B957' };
    }
    if (tabletBattery.status === 'AC Power') {
      return { label: 'AC Power', cls: 'bg-[#00B957]/15 text-[#00B957]', dot: 'bg-[#00B957]', ring: '#00B957' };
    }
    if (pct <= 15) {
      return { label: 'Critical', cls: 'bg-rose-500/15 text-rose-500', dot: 'bg-rose-500', ring: '#ef4444' };
    }
    if (pct <= 30) {
      return { label: 'Low', cls: 'bg-amber-500/15 text-amber-500', dot: 'bg-amber-500', ring: '#f59e0b' };
    }
    return { label: 'On Battery', cls: 'bg-[#4C9FE8]/15 text-[#4C9FE8]', dot: 'bg-[#4C9FE8]', ring: '#4C9FE8' };
  }, [tabletBattery]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        axiosClient({ method: 'GET', url: '/api/health/health-data' }),
        axiosClient({ method: 'GET', url: '/api/health/atc-status' }).then((res) =>
          setAtcConnected(Boolean(res?.data?.connected))
        ),
        fetchTabletBattery(),
        refreshMagState(),
        refreshSerialPorts(),
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
        {/* Top Metric Gauge Cards */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 gap-3.5 ${
            hasTabletBattery ? 'lg:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-4'
          }`}
        >
          {/* Metric 1: Car Temperature */}
          <div
            className={`rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            {renderGaugeRing(
              temp !== null ? (temp / 100) * 100 : 0,
              temp !== null ? '#00B957' : '#64748b',
              temp !== null ? `${Math.round(temp)}°` : '—'
            )}
            <div>
              <div className={`text-xs font-medium ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
                Car Temperature
              </div>
              <div className={`text-lg font-bold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {temp !== null ? `${temp}°C` : '—'}
              </div>
              <div
                className={`inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  temp !== null
                    ? 'bg-[#00B957]/15 text-[#00B957]'
                    : 'bg-slate-500/15 text-slate-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${temp !== null ? 'bg-[#00B957]' : 'bg-slate-400'}`} />
                <span>{temp !== null ? 'Normal' : isCarAvailable ? 'No telemetry' : 'Offline'}</span>
              </div>
            </div>
          </div>

          {/* Metric 2: Car Memory */}
          <div
            className={`rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            {renderGaugeRing(
              memoryPct,
              hasCarTelemetry ? '#4C9FE8' : '#64748b',
              hasCarTelemetry ? `${memoryPct}%` : '—'
            )}
            <div>
              <div className={`text-xs font-medium ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
                Car Memory
              </div>
              <div className={`text-lg font-bold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {memoryUsedGb !== null ? `${memoryUsedGb.toFixed(1)} GB` : '—'}
              </div>
              <div className={`text-[11px] mt-1 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                {hasCarTelemetry ? `of ${totalMemoryGb} GB` : 'Car disconnected'}
              </div>
            </div>
          </div>

          {/* Metric 3: Car Storage */}
          <div
            className={`rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            {renderGaugeRing(
              storagePct,
              hasCarTelemetry ? '#4C9FE8' : '#64748b',
              hasCarTelemetry ? `${storagePct}%` : '—'
            )}
            <div>
              <div className={`text-xs font-medium ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
                Car Storage
              </div>
              <div className={`text-lg font-bold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {usedStorageGb !== null ? `${usedStorageGb} GB` : '—'}
              </div>
              <div className={`text-[11px] mt-1 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                {freeStorageGb !== null ? `${freeStorageGb} GB free` : 'Car disconnected'}
              </div>
            </div>
          </div>

          {/* Metric 4: Network */}
          <div
            className={`rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            {renderGaugeRing(isOnline ? 85 : 0, isOnline ? '#00B957' : '#64748b', isOnline ? `${pingMs}ms` : '—')}
            <div>
              <div className={`text-xs font-medium ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
                Network
              </div>
              <div className={`text-lg font-bold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </div>
              <div className={`text-[11px] mt-1 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                {isOnline ? `Ping ${pingMs} ms` : 'No vehicle link'}
              </div>
            </div>
          </div>

          {/* Metric 5: Tablet Battery (shown when battery telemetry is available) */}
          {hasTabletBattery && tabletBattery.percentage !== null && (
            <div
              className={`rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
                isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              {renderGaugeRing(
                tabletBattery.percentage,
                batteryBadge.ring,
                `${tabletBattery.percentage}%`
              )}
              <div>
                <div className={`text-xs font-medium ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
                  Tablet Battery
                </div>
                <div className={`text-lg font-bold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {tabletBattery.percentage}%
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${batteryBadge.cls}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${batteryBadge.dot}`} />
                  <span>{batteryBadge.label}</span>
                </div>
              </div>
            </div>
          )}
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

      {/* Compass & Magnetometer Section */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Compass & Magnetometer
            </h2>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
              ESP32 HMC5883L heading telemetry, serial port selection, and calibration
            </p>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              isCalibrating
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                : isMagLive
                  ? 'bg-[#00B957]/15 text-[#00B957] border border-[#00B957]/30'
                  : headingDeg !== null
                    ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                    : 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
            }`}
          >
            {isCalibrating
              ? 'CALIBRATING'
              : isMagLive
                ? 'LIVE MAG'
                : headingDeg !== null
                  ? 'GNSS'
                  : 'OFFLINE'}
          </span>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            isDark ? 'bg-[#262A30]/60 border-[#333840]' : 'bg-white/60 border-slate-200'
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Column 1: Compass Rose & Primary Heading */}
            <div
              className={`rounded-xl p-4 border flex items-center gap-4 ${
                isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              <svg width="84" height="84" viewBox="0 0 72 72" className="shrink-0">
                <circle
                  cx="36"
                  cy="36"
                  r="31"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.18"
                  strokeWidth="1.5"
                />
                <circle
                  cx="36"
                  cy="36"
                  r="23"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.1"
                  strokeDasharray="2 3"
                  strokeWidth="1"
                />
                <text x="36" y="12" textAnchor="middle" fontSize="8" fontWeight="700" fill="#EF4444">
                  N
                </text>
                <text x="63" y="39" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" fillOpacity="0.6">
                  E
                </text>
                <text x="36" y="67" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" fillOpacity="0.6">
                  S
                </text>
                <text x="9" y="39" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" fillOpacity="0.6">
                  W
                </text>
                <g
                  style={{
                    transform: `rotate(${needleRotationDeg.toFixed(1)}deg)`,
                    transformOrigin: '36px 36px',
                    transition: 'transform 120ms linear',
                  }}
                >
                  <polygon points="36,14 40.5,36 36,33 31.5,36" fill="#EF4444" />
                  <polygon points="36,58 40,36 36,39 32,36" fill="#64748B" fillOpacity="0.65" />
                  <circle cx="36" cy="36" r="2.6" fill="#E2E8F0" stroke="#0F172A" strokeWidth="1" />
                </g>
              </svg>

              <div className="min-w-0 flex-1">
                <div className={`font-mono text-2xl font-extrabold tracking-tight leading-none ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {headingDeg !== null ? `${headingDeg.toFixed(1)}° ${headingCardinal}` : '—°'}
                </div>
                <div className={`mt-1.5 text-xs truncate ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                  {isMagLive
                    ? `ESP32 HMC5883L · ${magData.port || 'USB Serial'}`
                    : headingDeg !== null
                      ? 'Fallback: GNSS Course'
                      : 'Waiting for ESP32 USB stream'}
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] font-mono">
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      magData?.calibrated
                        ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                        : isDark
                          ? 'bg-[#22262B] text-slate-400 border-[#373C43]'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {magData?.calibrated ? 'Calibrated' : 'Uncalibrated'}
                  </span>
                  {typeof magData?.sampleRateHz === 'number' && isMagLive && (
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                      {magData.sampleRateHz.toFixed(1)} Hz
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Column 2: Raw Vector Telemetry & Serial Port */}
            <div
              className={`rounded-xl p-4 border flex flex-col justify-between gap-2.5 text-xs ${
                isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className={isDark ? 'text-[#8E95A2]' : 'text-slate-500'}>Raw X / Y / Z:</span>
                <span className={`font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                  {typeof magData?.mx === 'number'
                    ? `${magData.mx}, ${magData.my}, ${magData.mz}`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className={isDark ? 'text-[#8E95A2]' : 'text-slate-500'}>Field |B|:</span>
                <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {typeof magData?.fieldStrength === 'number' ? magData.fieldStrength.toFixed(1) : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2 items-center">
                <span className={isDark ? 'text-[#8E95A2]' : 'text-slate-500'}>Serial Port:</span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedPort}
                    disabled={magBusy}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSelectedPort(next);
                      runMagAction(
                        'mag_set_port',
                        { port: next === 'auto' ? null : next },
                        `Magnetometer port set to ${next === 'auto' ? 'Auto' : next}`
                      );
                    }}
                    className={`border rounded px-2 py-1 text-[11px] font-mono outline-none max-w-[175px] ${
                      isDark
                        ? 'bg-[#22262B] border-[#373C43] text-slate-100'
                        : 'bg-slate-100 border-slate-300 text-slate-800'
                    }`}
                  >
                    <option value="auto">Auto (ESP32 USB)</option>
                    {serialPorts.map((p) => (
                      <option key={p.portName} value={p.portName} title={p.description}>
                        {p.portName}
                        {p.isEsp32Bridge ? ' [ESP32]' : p.isUblox ? ' [GNSS]' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={refreshSerialPorts}
                    title="Rescan serial ports"
                    className={`px-2 py-1 rounded border text-[11px] font-mono cursor-pointer ${
                      isDark
                        ? 'bg-[#22262B] hover:bg-[#373C43] border-[#373C43] text-slate-200'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    }`}
                  >
                    ↻
                  </button>
                </div>
              </div>
              {magData?.error && (
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-500 break-words">
                  {magData.error}
                </div>
              )}
            </div>

            {/* Column 3: Calibration & Alignment Controls */}
            <div
              className={`rounded-xl p-4 border flex flex-col justify-between gap-2.5 ${
                isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              {isCalibrating ? (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className={`text-[11px] font-medium ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
                    Rotate device 360° smoothly ({magData?.calSamples ?? 0} samples · span{' '}
                    {magData?.calSpanX ?? 0}×{magData?.calSpanY ?? 0})
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={magBusy}
                      onClick={() =>
                        runMagAction('mag_finish_calibration', undefined, '360° calibration applied')
                      }
                      className="py-1.5 px-2 rounded-lg bg-[#01B656] hover:bg-[#009E48] text-white font-semibold text-[11px] cursor-pointer disabled:opacity-50"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      disabled={magBusy}
                      onClick={() => runMagAction('mag_cancel_calibration')}
                      className={`py-1.5 px-2 rounded-lg font-semibold text-[11px] cursor-pointer disabled:opacity-50 ${
                        isDark
                          ? 'bg-[#353A42] hover:bg-[#41464E] text-slate-200'
                          : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                      }`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={magBusy || !isMagLive}
                    onClick={() => runMagAction('mag_start_calibration')}
                    className="py-1.5 px-2 rounded-lg bg-[#4C9FE8] hover:bg-[#3a8fd9] text-white font-semibold text-xs cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    360° Calibrate
                  </button>
                  <button
                    type="button"
                    disabled={magBusy || !isMagLive}
                    onClick={() =>
                      runMagAction('mag_set_zero_north', undefined, 'Aligned current direction to 0° North')
                    }
                    className={`py-1.5 px-2 rounded-lg border font-semibold text-xs cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                      isDark
                        ? 'bg-[#353A42] hover:bg-[#41464E] border-[#454B53] text-slate-100'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                    }`}
                  >
                    Zero North
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 items-end text-[11px]">
                <label className="flex flex-col gap-1">
                  <span className={isDark ? 'text-[#8E95A2]' : 'text-slate-500'}>Offset (°)</span>
                  <input
                    type="number"
                    step="1"
                    value={offsetDraft}
                    onChange={(e) => setOffsetDraft(e.target.value)}
                    onBlur={() => {
                      const v = parseFloat(offsetDraft);
                      if (Number.isFinite(v)) {
                        runMagAction('mag_update_settings', { headingOffsetDeg: v });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const v = parseFloat(offsetDraft);
                        if (Number.isFinite(v)) {
                          runMagAction('mag_update_settings', { headingOffsetDeg: v });
                        }
                      }
                    }}
                    className={`w-full border rounded px-2 py-1 font-mono text-xs outline-none ${
                      isDark
                        ? 'bg-[#22262B] border-[#373C43] text-white'
                        : 'bg-slate-100 border-slate-300 text-slate-800'
                    }`}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className={isDark ? 'text-[#8E95A2]' : 'text-slate-500'}>Decl (°)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={declDraft}
                    onChange={(e) => setDeclDraft(e.target.value)}
                    onBlur={() => {
                      const v = parseFloat(declDraft);
                      if (Number.isFinite(v)) {
                        runMagAction('mag_update_settings', { declinationDeg: v });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const v = parseFloat(declDraft);
                        if (Number.isFinite(v)) {
                          runMagAction('mag_update_settings', { declinationDeg: v });
                        }
                      }
                    }}
                    className={`w-full border rounded px-2 py-1 font-mono text-xs outline-none ${
                      isDark
                        ? 'bg-[#22262B] border-[#373C43] text-white'
                        : 'bg-slate-100 border-slate-300 text-slate-800'
                    }`}
                  />
                </label>

                <label
                  className={`flex items-center justify-between gap-1 cursor-pointer border rounded px-2 py-1 ${
                    isDark
                      ? 'bg-[#22262B] border-[#373C43] text-slate-200'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  <span className="font-medium">Invert</span>
                  <input
                    type="checkbox"
                    checked={Boolean(magData?.invertDirection)}
                    onChange={(e) =>
                      runMagAction('mag_update_settings', { invertDirection: e.target.checked })
                    }
                    className="accent-[#4C9FE8] cursor-pointer"
                  />
                </label>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={magBusy}
                  onClick={() => {
                    setOffsetDraft('0');
                    setDeclDraft('0');
                    runMagAction('mag_reset_calibration', undefined, 'Calibration reset');
                  }}
                  className="text-[11px] text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 underline cursor-pointer"
                >
                  Reset Calibration
                </button>
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
                {peakTemp !== null ? `Peak ${peakTemp}°C` : '—'}
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
