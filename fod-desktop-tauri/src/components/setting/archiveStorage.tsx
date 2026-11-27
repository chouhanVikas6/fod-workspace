import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { set_Terminate } from '@/store/slices/missionState-slice';
import { resetFods } from '@/store/slices/fodReducer-slice';
import { clearMissionImageCache } from '@/mocks/next-image';
import {
  HiArrowPath,
  HiMagnifyingGlass,
  HiArchiveBox,
  HiArchiveBoxArrowDown,
  HiServerStack,
  HiCog6Tooth,
  HiTrash,
  HiArrowUpTray,
  HiArrowDownTray,
  HiTruck,
} from 'react-icons/hi2';
import { invoke } from '@tauri-apps/api/core';
import axiosClient from '@/utils/axios';
import { toast } from 'react-toastify';

interface NodeDiskInfo {
  nodeId: string;
  online: boolean;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
  framesBytes: number;
  archivesBytes: number;
  hotMissionCount: number;
  coldMissionCount: number;
}

interface FleetMissionItem {
  id: number;
  displayId: number | null;
  status: string;
  createdAt: number;
  storageTier: string;
  storageEpoch: number;
  archiveSizeBytes: number | null;
  coldStoredAtMs: number | null;
  totalFodGroups: number;
  totalFods: number;
  clearedCount: number;
  dirtyGroupCount: number;
  hotBytes: number;
  archiveBytes: number;
  presentHotOnAtc: boolean;
  presentColdOnAtc: boolean;
  presentHotOnCar: boolean;
  carStorageTier: string;
}

interface FleetStoragePolicy {
  autoColdStoreEnabled: boolean;
  atcKeepHotMissions: number;
  atcMaxDiskPercent: number;
  autoDropCarOnColdStore: boolean;
  autoDropCarWhenBackedUp: boolean;
  carKeepHotMissions: number;
  carMaxDiskPercent: number;
}

function formatBytes(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

function formatDate(raw?: string | number | null): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function ArchiveStorage() {
  const dispatch = useDispatch();
  const theme = useSelector((store: RootState) => store.theme.theme);
  const currentMissionNumber = useSelector((store: RootState) => store.MissionState.missionNumber);
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [atcOnline, setAtcOnline] = useState(false);
  const [atcDisk, setAtcDisk] = useState<NodeDiskInfo | null>(null);
  const [carDisk, setCarDisk] = useState<NodeDiskInfo | null>(null);
  const [fleetMissions, setFleetMissions] = useState<FleetMissionItem[]>([]);
  const [fleetFilter, setFleetFilter] = useState<'All' | 'HotBoth' | 'AtcOnly' | 'Cold'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFleetPolicy, setShowFleetPolicy] = useState(false);
  const [fleetPolicyDraft, setFleetPolicyDraft] = useState<FleetStoragePolicy>({
    autoColdStoreEnabled: false,
    atcKeepHotMissions: 30,
    atcMaxDiskPercent: 85,
    autoDropCarOnColdStore: true,
    autoDropCarWhenBackedUp: false,
    carKeepHotMissions: 15,
    carMaxDiskPercent: 80,
  });

  // Confirmation modals
  const [coldStoreConfirm, setColdStoreConfirm] = useState<FleetMissionItem | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<FleetMissionItem | null>(null);
  const [restoreAlsoLocal, setRestoreAlsoLocal] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<'atc' | 'local'>('atc');

  const loadFleetStorage = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const ovRes = await axiosClient({ method: 'GET', url: '/api/mission/storage-overview' });
      const fleet = ovRes?.data?.fleet;
      if (fleet) {
        setAtcOnline(Boolean(fleet.atcOnline));
        setAtcDisk(fleet.atcDisk || null);
        setCarDisk(fleet.carDisk || null);
        setFleetMissions(Array.isArray(fleet.missions) ? fleet.missions : []);
        if (fleet.fleetPolicy) {
          setFleetPolicyDraft(fleet.fleetPolicy);
        }
      }
    } catch {
      setAtcOnline(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFleetStorage(false);
    const interval = setInterval(() => loadFleetStorage(true), 5000);
    return () => clearInterval(interval);
  }, [loadFleetStorage]);

  const filteredFleet = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return fleetMissions.filter((m) => {
      const label = `mission #${m.displayId ?? m.id} ${m.id}`.toLowerCase();
      if (q && !label.includes(q)) return false;
      if (fleetFilter === 'HotBoth') return m.presentHotOnAtc && m.presentHotOnCar;
      if (fleetFilter === 'AtcOnly') return m.presentHotOnAtc && !m.presentHotOnCar;
      if (fleetFilter === 'Cold') return m.presentColdOnAtc;
      return true;
    });
  }, [fleetMissions, searchQuery, fleetFilter]);

  const handleConfirmColdStore = async () => {
    if (!coldStoreConfirm) return;
    const m = coldStoreConfirm;
    setBusyKey(`cold-${m.id}`);
    try {
      const res = await axiosClient({
        method: 'POST',
        url: `/api/mission/atc/cold-store/${m.id}`,
        data: { forceDropCar: true },
      });
      toast.success(
        res?.data?.message ||
          `Mission #${m.displayId ?? m.id} cold-stored on ATC and dropped from all devices`
      );
      clearMissionImageCache(m.id);
      if (currentMissionNumber != null && Number(currentMissionNumber) === Number(m.id)) {
        dispatch(set_Terminate());
        dispatch(resetFods());
      }
      setColdStoreConfirm(null);
      await loadFleetStorage(true);
    } catch (e: any) {
      toast.error(e?.data?.error || 'Cold store failed');
    } finally {
      setBusyKey(null);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreConfirm) return;
    const m = restoreConfirm;
    setBusyKey(`restore-${m.id}`);
    try {
      const res = await axiosClient({
        method: 'POST',
        url: `/api/mission/atc/restore/${m.id}`,
        data: { reimportLocal: restoreAlsoLocal },
      });
      toast.success(
        res?.data?.message ||
          `Mission #${m.displayId ?? m.id} restored to ATC & distributed to devices`
      );
      setRestoreConfirm(null);
      await loadFleetStorage(true);
    } catch (e: any) {
      toast.error(e?.data?.error || 'Restore failed');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDropFromCar = async (m: FleetMissionItem) => {
    setBusyKey(`car-drop-${m.id}`);
    try {
      const res = await axiosClient({
        method: 'POST',
        url: `/api/mission/car/drop/${m.id}`,
      });
      toast.success(
        res?.data?.message || `Freed Mission #${m.displayId ?? m.id} on Car`
      );
      await loadFleetStorage(true);
    } catch (e: any) {
      toast.error(e?.data?.error || 'Failed to drop mission on Car');
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveFleetPolicy = async () => {
    setBusyKey('save-fleet-policy');
    try {
      await axiosClient({
        method: 'POST',
        url: '/api/mission/storage-policy',
        data: { fleet: fleetPolicyDraft },
      });
      toast.success('ATC & Car auto-storage policies updated');
      setShowFleetPolicy(false);
      await loadFleetStorage(true);
    } catch (e: any) {
      toast.error(e?.data?.error || 'Failed to save fleet policy');
    } finally {
      setBusyKey(null);
    }
  };

  const handleExportArchive = async (missionId: number, displayId: number | null) => {
    setBusyKey(`export-${missionId}`);
    try {
      const defaultName =
        displayId != null
          ? `mission-${missionId}-d${displayId}.zoidpack`
          : `mission-${missionId}.zoidpack`;
      const path = await invoke<string | null>('pick_archive_save_path', { defaultName });
      if (!path) {
        setBusyKey(null);
        return;
      }
      const res = await axiosClient({
        method: 'POST',
        url: `/api/mission/archive/export/${missionId}`,
        data: { path, source: 'atc' },
      });
      toast.success(
        `Saved backup archive (${formatBytes(res?.data?.sizeBytes)}) to ${path}`
      );
    } catch (e: any) {
      toast.error(e?.data?.error || 'Failed to export mission archive');
    } finally {
      setBusyKey(null);
    }
  };

  const handlePickAndImportArchive = async () => {
    setBusyKey('import-archive');
    try {
      const path = await invoke<string | null>('pick_archive_open_path');
      if (!path) {
        setBusyKey(null);
        return;
      }
      const res = await axiosClient({
        method: 'POST',
        url: '/api/mission/archive/import',
        data: { path, target: importTarget, reimportLocal: true },
      });
      toast.success(res?.data?.message || 'Archive imported successfully');
      setImportModalOpen(false);
      await loadFleetStorage(true);
    } catch (e: any) {
      toast.error(e?.data?.error || 'Failed to import archive');
    } finally {
      setBusyKey(null);
    }
  };

  const cardBg = isDark
    ? 'bg-[#292D33] border-[#383D44]'
    : 'bg-white border-slate-200 shadow-xs';
  const subCardBg = isDark
    ? 'bg-[#22262B] border-[#383D44]'
    : 'bg-slate-50 border-slate-200';
  const inputCls = isDark
    ? 'bg-[#22262B] border-[#454B53] text-white'
    : 'bg-white border-slate-300 text-slate-900';

  return (
    <div className="w-full h-full flex flex-col justify-start overflow-hidden">
      {/* Header */}
      <div className="mb-3 shrink-0">
        <h1
          className={`text-lg xl:text-xl font-bold tracking-tight ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}
        >
          Archive &amp; Backup Storage
        </h1>
        <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
          Manage active hot storage on ATC &amp; Car, freeze old missions into ATC cold backups, and export or import disk archives
        </p>
      </div>

      {/* ATC & Car Storage Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3 shrink-0">
        {/* ATC Card */}
        <div className={`rounded-xl border p-3 ${cardBg}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <HiServerStack className="w-4 h-4 text-[#5AA7EA]" />
              <span className="text-xs font-bold">ATC Server Storage</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                atcOnline
                  ? 'bg-[#00B957]/15 text-[#00B957]'
                  : 'bg-rose-500/15 text-rose-400'
              }`}
            >
              {atcOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] mb-1.5">
            <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-[#353A42] overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  (atcDisk?.usagePercent ?? 0) >= 85 ? 'bg-rose-500' : 'bg-[#5AA7EA]'
                }`}
                style={{ width: `${Math.min(100, atcDisk?.usagePercent ?? 0)}%` }}
              />
            </div>
            <span className="font-mono font-semibold">
              {atcDisk ? `${atcDisk.usagePercent}% (${formatBytes(atcDisk.freeBytes)} free)` : '—'}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-[#9EA4B0]">
            <span>
              Hot:{' '}
              <strong className={isDark ? 'text-white' : 'text-slate-900'}>
                {atcDisk?.hotMissionCount ?? 0}
              </strong>{' '}
              ({formatBytes(atcDisk?.framesBytes)})
            </span>
            <span>
              Cold Vault:{' '}
              <strong className="text-indigo-400">{atcDisk?.coldMissionCount ?? 0}</strong> (
              {formatBytes(atcDisk?.archivesBytes)})
            </span>
          </div>
        </div>

        {/* Car Card */}
        <div className={`rounded-xl border p-3 ${cardBg}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <HiTruck className="w-4 h-4 text-[#00B957]" />
              <span className="text-xs font-bold">Car Vehicle Storage</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                carDisk?.online
                  ? 'bg-[#00B957]/15 text-[#00B957]'
                  : 'bg-amber-500/15 text-amber-400'
              }`}
            >
              {carDisk?.online ? 'Online' : 'Offline / Unreachable'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] mb-1.5">
            <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-[#353A42] overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  (carDisk?.usagePercent ?? 0) >= 80 ? 'bg-rose-500' : 'bg-[#00B957]'
                }`}
                style={{ width: `${Math.min(100, carDisk?.usagePercent ?? 0)}%` }}
              />
            </div>
            <span className="font-mono font-semibold">
              {carDisk?.online
                ? `${carDisk.usagePercent}% (${formatBytes(carDisk.freeBytes)} free)`
                : '—'}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9EA4B0]">
            <span>
              Hot on Vehicle:{' '}
              <strong className={isDark ? 'text-white' : 'text-slate-900'}>
                {carDisk?.hotMissionCount ?? 0}
              </strong>{' '}
              ({formatBytes(carDisk?.framesBytes)})
            </span>
            <span>Managed automatically by ATC backup rules</span>
          </div>
        </div>
      </div>

      {/* Fleet Action Bar + Auto-Storage Policy Drawer */}
      <div className={`rounded-xl border p-3 mb-3 shrink-0 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['All', 'All Missions'],
                ['HotBoth', 'Hot (ATC + Car)'],
                ['AtcOnly', 'ATC Only (Car Freed)'],
                ['Cold', 'Cold Stored Vault'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFleetFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  fleetFilter === key
                    ? isDark
                      ? 'bg-[#31475D] border-[#5AA7EA] text-[#5AA7EA]'
                      : 'bg-blue-50 border-blue-500 text-blue-600'
                    : isDark
                    ? 'bg-[#353A42] border-[#454B53] text-slate-300 hover:text-white'
                    : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFleetPolicy((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                fleetPolicyDraft.autoColdStoreEnabled || fleetPolicyDraft.autoDropCarWhenBackedUp
                  ? 'border-[#00B957]/50 bg-[#00B957]/10 text-[#00B957]'
                  : isDark
                  ? 'border-[#454B53] bg-[#353A42] text-slate-200'
                  : 'border-slate-300 bg-slate-100 text-slate-700'
              }`}
            >
              <HiCog6Tooth className="w-3.5 h-3.5" />
              <span>ATC &amp; Car Auto-Free Policy</span>
            </button>

            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5AA7EA] hover:bg-[#4997db] text-white text-xs font-semibold cursor-pointer"
            >
              <HiArrowUpTray className="w-3.5 h-3.5" />
              <span>Import Disk Archive (.zoidpack)</span>
            </button>

            <button
              type="button"
              onClick={() => loadFleetStorage(false)}
              className={`p-1.5 rounded-lg border cursor-pointer ${
                isDark ? 'border-[#454B53] bg-[#353A42]' : 'border-slate-300 bg-slate-100'
              }`}
              title="Refresh Storage Overview"
            >
              <HiArrowPath className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {showFleetPolicy && (
          <div className={`mt-3 p-3 rounded-lg border space-y-2.5 text-xs ${subCardBg}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Car Auto-Management */}
              <div className="space-y-2">
                <div className="font-bold text-[#00B957]">Car Storage Management (via ATC)</div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fleetPolicyDraft.autoDropCarOnColdStore}
                    onChange={(e) =>
                      setFleetPolicyDraft((p) => ({
                        ...p,
                        autoDropCarOnColdStore: e.target.checked,
                      }))
                    }
                    className="accent-[#5AA7EA]"
                  />
                  <span>Drop mission from Car automatically when Cold Stored on ATC</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fleetPolicyDraft.autoDropCarWhenBackedUp}
                    onChange={(e) =>
                      setFleetPolicyDraft((p) => ({
                        ...p,
                        autoDropCarWhenBackedUp: e.target.checked,
                      }))
                    }
                    className="accent-[#5AA7EA]"
                  />
                  <span>Auto-free oldest backed-up missions on Car</span>
                </label>
                <div className="flex items-center gap-3 pl-5">
                  <label className="flex items-center gap-1">
                    <span>Keep hot:</span>
                    <input
                      type="number"
                      min={1}
                      value={fleetPolicyDraft.carKeepHotMissions}
                      onChange={(e) =>
                        setFleetPolicyDraft((p) => ({
                          ...p,
                          carKeepHotMissions: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className={`w-14 px-1.5 py-0.5 rounded border ${inputCls}`}
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span>Max disk %:</span>
                    <input
                      type="number"
                      min={30}
                      max={98}
                      value={fleetPolicyDraft.carMaxDiskPercent}
                      onChange={(e) =>
                        setFleetPolicyDraft((p) => ({
                          ...p,
                          carMaxDiskPercent: Math.min(98, Math.max(30, Number(e.target.value) || 80)),
                        }))
                      }
                      className={`w-14 px-1.5 py-0.5 rounded border ${inputCls}`}
                    />
                  </label>
                </div>
              </div>

              {/* ATC Auto-Cold-Store */}
              <div className="space-y-2">
                <div className="font-bold text-[#5AA7EA]">ATC Auto-Cold-Store Policy</div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fleetPolicyDraft.autoColdStoreEnabled}
                    onChange={(e) =>
                      setFleetPolicyDraft((p) => ({
                        ...p,
                        autoColdStoreEnabled: e.target.checked,
                      }))
                    }
                    className="accent-[#5AA7EA]"
                  />
                  <span>Automatically cold-store oldest ATC missions to free hot storage</span>
                </label>
                <div className="flex items-center gap-3 pl-5">
                  <label className="flex items-center gap-1">
                    <span>Keep hot:</span>
                    <input
                      type="number"
                      min={1}
                      value={fleetPolicyDraft.atcKeepHotMissions}
                      onChange={(e) =>
                        setFleetPolicyDraft((p) => ({
                          ...p,
                          atcKeepHotMissions: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className={`w-14 px-1.5 py-0.5 rounded border ${inputCls}`}
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span>Max disk %:</span>
                    <input
                      type="number"
                      min={30}
                      max={98}
                      value={fleetPolicyDraft.atcMaxDiskPercent}
                      onChange={(e) =>
                        setFleetPolicyDraft((p) => ({
                          ...p,
                          atcMaxDiskPercent: Math.min(98, Math.max(30, Number(e.target.value) || 85)),
                        }))
                      }
                      className={`w-14 px-1.5 py-0.5 rounded border ${inputCls}`}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSaveFleetPolicy}
                disabled={busyKey === 'save-fleet-policy' || !atcOnline}
                className="px-3.5 py-1.5 rounded-lg bg-[#00B957] hover:bg-[#00a34d] text-white font-semibold text-xs cursor-pointer disabled:opacity-40"
              >
                Save Fleet Policies
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fleet Table */}
      <div className={`flex-1 rounded-xl border p-3 flex flex-col min-h-0 ${cardBg}`}>
        <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
          <span className="text-xs font-semibold text-[#9EA4B0]">
            {filteredFleet.length} mission(s) in fleet catalog
          </span>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border w-full sm:w-56 xl:w-64 ${
              isDark
                ? 'bg-[#353A42] border-[#454B53] focus-within:border-[#5AA7EA]'
                : 'bg-slate-50 border-slate-300 focus-within:border-blue-500'
            }`}
          >
            <HiMagnifyingGlass className="w-3.5 h-3.5 text-[#8E95A2]" />
            <input
              type="text"
              placeholder="Search fleet missions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table className="w-full text-left border-collapse text-[11px] xl:text-xs">
            <thead className="sticky top-0 z-10">
              <tr
                className={`font-semibold whitespace-nowrap ${
                  isDark ? 'text-[#9EA4B0] bg-[#353A42]' : 'text-slate-500 bg-slate-100'
                }`}
              >
                <th className="py-2.5 px-2.5 rounded-l-md">Mission</th>
                <th className="py-2.5 px-2">Date</th>
                <th className="py-2.5 px-2">Groups / FODs</th>
                <th className="py-2.5 px-2">ATC Storage</th>
                <th className="py-2.5 px-2">Car Storage</th>
                <th className="py-2.5 px-2 text-right rounded-r-md">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-[#383D44]' : 'divide-slate-200'}`}>
              {filteredFleet.map((m) => {
                const label = m.displayId ?? m.id;
                const isActive = m.status === 'ACTIVE';
                return (
                  <tr
                    key={m.id}
                    className={isDark ? 'hover:bg-[#353A42]/50' : 'hover:bg-slate-50'}
                  >
                    <td className="py-2.5 px-2.5 font-semibold whitespace-nowrap">
                      Mission #{label}
                      <span className="ml-1.5 text-[10px] font-mono text-[#8E95A2]">
                        ({m.status})
                      </span>
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap text-[#9EA4B0]">
                      {formatDate(m.createdAt)}
                    </td>
                    <td className="py-2.5 px-2 font-mono whitespace-nowrap">
                      {m.totalFodGroups} / {m.totalFods}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      {m.presentColdOnAtc ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/40">
                          Cold Stored ({formatBytes(m.archiveBytes || m.archiveSizeBytes)})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#00B957]/15 text-[#00B957] border border-[#00B957]/40">
                          Hot ({formatBytes(m.hotBytes)})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      {m.presentHotOnCar ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#00B957]/15 text-[#00B957] border border-[#00B957]/40">
                          Hot on Car
                        </span>
                      ) : m.carStorageTier === 'UNKNOWN' ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30">
                          Car Offline
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/40">
                          Dropped on Car
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {m.presentColdOnAtc ? (
                          <button
                            type="button"
                            disabled={busyKey === `restore-${m.id}`}
                            onClick={() => setRestoreConfirm(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#5AA7EA]/15 text-[#5AA7EA] hover:bg-[#5AA7EA]/25 text-[11px] font-semibold cursor-pointer"
                          >
                            <HiArchiveBoxArrowDown className="w-3.5 h-3.5" />
                            <span>Re-import to Fleet</span>
                          </button>
                        ) : (
                          <>
                            {m.presentHotOnCar && !isActive && (
                              <button
                                type="button"
                                disabled={busyKey === `car-drop-${m.id}`}
                                onClick={() => handleDropFromCar(m)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 text-[11px] font-semibold cursor-pointer"
                                title="Drop hot data from Car (keeps hot on ATC)"
                              >
                                <HiTrash className="w-3.5 h-3.5" />
                                <span>Drop Car</span>
                              </button>
                            )}
                            {!isActive && (
                              <button
                                type="button"
                                disabled={busyKey === `cold-${m.id}`}
                                onClick={() => setColdStoreConfirm(m)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 text-[11px] font-semibold cursor-pointer"
                                title="Freeze into ATC Cold Backup & drop from Car and all Desktops"
                              >
                                <HiArchiveBox className="w-3.5 h-3.5" />
                                <span>Cold Store</span>
                              </button>
                            )}
                          </>
                        )}
                        <button
                          type="button"
                          disabled={busyKey === `export-${m.id}`}
                          onClick={() => handleExportArchive(m.id, m.displayId)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            isDark
                              ? 'bg-[#353A42] text-slate-200 hover:bg-[#41464E]'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                          title="Export .zoidpack backup archive to separate disk"
                        >
                          <HiArrowDownTray className="w-3.5 h-3.5" />
                          <span>Save Disk</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredFleet.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-xs text-[#8E95A2]">
                    {atcOnline
                      ? 'No fleet missions match this filter.'
                      : 'ATC server is unreachable. Connect to ATC to manage fleet cold storage.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Cold Store Confirmation */}
      {coldStoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-md rounded-2xl border p-5 space-y-3 ${cardBg}`}>
            <h3 className="text-base font-bold">
              Cold Store Mission #{coldStoreConfirm.displayId ?? coldStoreConfirm.id}?
            </h3>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              This will archive all mission metadata, FOD detections, operator decisions, and JPEG frames into a verified{' '}
              <code className="font-mono">.zoidpack</code> cold backup on ATC, freeze the mission, and completely drop it from{' '}
              <strong>Car</strong> and all <strong>Desktop</strong> devices. Only ATC will retain the cold backup until you re-import it.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setColdStoreConfirm(null)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  isDark ? 'bg-[#353A42] text-slate-200' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={handleConfirmColdStore}
                className="px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {busyKey === `cold-${coldStoreConfirm.id}` ? 'Cold Storing...' : 'Freeze & Cold Store'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Restore Cold Mission Confirmation */}
      {restoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-md rounded-2xl border p-5 space-y-3 ${cardBg}`}>
            <h3 className="text-base font-bold">
              Re-import Cold-Stored Mission #{restoreConfirm.displayId ?? restoreConfirm.id}?
            </h3>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              ATC will unpack the cold backup into active storage and distribute the mission back to all devices&apos; mission lists so any operator can re-import it.
            </p>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={restoreAlsoLocal}
                onChange={(e) => setRestoreAlsoLocal(e.target.checked)}
                className="accent-[#5AA7EA]"
              />
              <span>Also re-import immediately onto this Desktop device</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestoreConfirm(null)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  isDark ? 'bg-[#353A42] text-slate-200' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={handleConfirmRestore}
                className="px-4 py-1.5 rounded-lg bg-[#5AA7EA] hover:bg-[#4997db] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {busyKey === `restore-${restoreConfirm.id}` ? 'Restoring...' : 'Restore to Fleet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Import Archive from Disk */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-md rounded-2xl border p-5 space-y-3 ${cardBg}`}>
            <h3 className="text-base font-bold">Import Mission Archive (.zoidpack)</h3>
            <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Choose where to restore the backup file from disk:
            </p>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importTarget"
                  checked={importTarget === 'atc'}
                  onChange={() => setImportTarget('atc')}
                  className="accent-[#5AA7EA]"
                />
                <span>
                  <strong>ATC + Distribute to Fleet</strong> (restores on ATC &amp; makes available to all devices)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importTarget"
                  checked={importTarget === 'local'}
                  onChange={() => setImportTarget('local')}
                  className="accent-[#5AA7EA]"
                />
                <span>
                  <strong>This Desktop Only</strong> (offline inspection without uploading to ATC)
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  isDark ? 'bg-[#353A42] text-slate-200' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyKey === 'import-archive'}
                onClick={handlePickAndImportArchive}
                className="px-4 py-1.5 rounded-lg bg-[#5AA7EA] hover:bg-[#4997db] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {busyKey === 'import-archive' ? 'Importing...' : 'Choose .zoidpack File...'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
