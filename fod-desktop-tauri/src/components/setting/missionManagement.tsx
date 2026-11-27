import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  HiArrowPath,
  HiMagnifyingGlass,
  HiCloudArrowDown,
  HiCog6Tooth,
  HiTrash,
  HiArrowDownTray,
} from 'react-icons/hi2';
import { invoke } from '@tauri-apps/api/core';
import axiosClient from '@/utils/axios';
import { toast } from 'react-toastify';

interface DesktopMissionItem {
  id: number;
  displayId: number | null;
  status: string;
  createdAt: string;
  fods: number;
  accepted: number;
  rejected: number;
  cleared: number;
  dirtyCount: number;
  localEvicted: boolean;
  storageTier: string;
  localSizeBytes: number;
}

interface DesktopStoragePolicy {
  enabled: boolean;
  maxLocalMissions: number;
  maxDiskPercent: number;
}

interface DesktopOverview {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
  cacheBytes: number;
  storedMissions: number;
  freedMissions: number;
  policy: DesktopStoragePolicy;
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

export default function MissionManagement() {
  const theme = useSelector((store: RootState) => store.theme.theme);
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [missions, setMissions] = useState<DesktopMissionItem[]>([]);
  const [desktopDisk, setDesktopDisk] = useState<DesktopOverview | null>(null);
  const [filterTab, setFilterTab] = useState<'All' | 'Stored' | 'Freed' | 'Unsynced'>('All');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showPolicy, setShowPolicy] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<DesktopStoragePolicy>({
    enabled: false,
    maxLocalMissions: 15,
    maxDiskPercent: 85,
  });

  const loadDesktopMissions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statRes, ovRes] = await Promise.allSettled([
        axiosClient({ method: 'GET', url: '/api/mission/stat' }),
        axiosClient({ method: 'GET', url: '/api/mission/storage-overview' }),
      ]);

      if (statRes.status === 'fulfilled' && Array.isArray(statRes.value?.data)) {
        const mapped: DesktopMissionItem[] = statRes.value.data
          .filter((m: any) => (m.storageTier || 'HOT') !== 'COLD_STORED')
          .map((m: any) => ({
            id: Number(m.id ?? m.mission_id),
            displayId: m.displayId ?? null,
            status: m.status || 'INACTIVE',
            createdAt: m.createdAt || m.created_at || '',
            fods: Number(m.total ?? 0),
            accepted: Number(m.accepted ?? 0),
            rejected: Number(m.rejected ?? 0),
            cleared: Number(m.cleared ?? 0),
            dirtyCount: Number(m.dirtyCount ?? 0),
            localEvicted: Boolean(m.localEvicted),
            storageTier: m.storageTier || 'HOT',
            localSizeBytes: Number(m.localSizeBytes ?? 0),
          }));
        setMissions(mapped);
      }

      if (ovRes.status === 'fulfilled' && ovRes.value?.data?.desktop) {
        setDesktopDisk(ovRes.value.data.desktop);
        if (ovRes.value.data.desktop.policy) {
          setPolicyDraft(ovRes.value.data.desktop.policy);
        }
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDesktopMissions(false);
    const interval = setInterval(() => loadDesktopMissions(true), 5000);
    return () => clearInterval(interval);
  }, [loadDesktopMissions]);

  const counts = useMemo(() => {
    const total = missions.length;
    const stored = missions.filter((m) => !m.localEvicted).length;
    const freed = missions.filter((m) => m.localEvicted).length;
    const unsynced = missions.filter((m) => m.dirtyCount > 0).length;
    return { total, stored, freed, unsynced };
  }, [missions]);

  const filteredMissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return missions.filter((m) => {
      const label = `mission #${m.displayId ?? m.id} ${m.id}`.toLowerCase();
      if (q && !label.includes(q)) return false;
      if (filterTab === 'Stored') return !m.localEvicted;
      if (filterTab === 'Freed') return m.localEvicted;
      if (filterTab === 'Unsynced') return m.dirtyCount > 0;
      return true;
    });
  }, [missions, searchQuery, filterTab]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMissions.length && filteredMissions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMissions.map((m) => m.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSyncAll = async () => {
    setBusyKey('sync-all');
    try {
      await axiosClient({ method: 'GET', url: '/api/mission/stat' });
      await loadDesktopMissions(true);
      toast.success('Synchronized desktop mission catalog');
    } catch (e: any) {
      toast.error(e?.data?.error || 'Sync failed');
    } finally {
      setBusyKey(null);
    }
  };

  const handleLocalFreeSingle = async (m: DesktopMissionItem) => {
    if (m.status === 'ACTIVE') {
      toast.warning('Cannot free storage for an active mission');
      return;
    }
    setBusyKey(`free-${m.id}`);
    try {
      const res = await axiosClient({
        method: 'POST',
        url: `/api/mission/local-free/${m.id}`,
      });
      toast.success(
        `Freed ${formatBytes(res?.data?.bytesFreed)} on this device for Mission #${
          m.displayId ?? m.id
        }`
      );
      await loadDesktopMissions(true);
    } catch (e: any) {
      toast.error(e?.data?.error || 'Failed to free local mission storage');
    } finally {
      setBusyKey(null);
    }
  };

  const handleLocalFreeSelected = async () => {
    if (selectedIds.size === 0) {
      toast.info('Select missions to free locally');
      return;
    }
    setBusyKey('free-batch');
    try {
      const res = await axiosClient({
        method: 'POST',
        url: '/api/mission/local-free-batch',
        data: { missionIds: Array.from(selectedIds) },
      });
      const freedIds: number[] = res?.data?.freedMissionIds || [];
      const errors: any[] = res?.data?.errors || [];
      if (freedIds.length > 0) {
        toast.success(
          `Freed ${freedIds.length} mission(s) (${formatBytes(res?.data?.bytesFreed)})`
        );
      }
      if (errors.length > 0) {
        toast.warning(`${errors.length} mission(s) skipped: ${errors[0]?.error}`);
      }
      setSelectedIds(new Set());
      await loadDesktopMissions(true);
    } catch (e: any) {
      toast.error(e?.data?.error || 'Batch free failed');
    } finally {
      setBusyKey(null);
    }
  };

  const handleLocalReimportSingle = async (id: number, label: number | string) => {
    setBusyKey(`reimport-${id}`);
    try {
      const res = await axiosClient({
        method: 'POST',
        url: `/api/mission/local-reimport/${id}`,
      });
      toast.success(
        `Re-imported Mission #${label} (${res?.data?.restoredGroups ?? 0} groups, ${
          res?.data?.restoredFrames ?? 0
        } images)`
      );
      await loadDesktopMissions(true);
    } catch (e: any) {
      toast.error(e?.data?.error || 'Failed to re-import mission from ATC');
    } finally {
      setBusyKey(null);
    }
  };

  const handleLocalReimportSelected = async () => {
    const targets = missions.filter((m) => selectedIds.has(m.id) && m.localEvicted);
    if (targets.length === 0) {
      toast.info('Select freed missions (On ATC) to re-import');
      return;
    }
    setBusyKey('reimport-batch');
    let ok = 0;
    for (const m of targets) {
      try {
        await axiosClient({ method: 'POST', url: `/api/mission/local-reimport/${m.id}` });
        ok += 1;
      } catch {
        // continue
      }
    }
    toast.success(`Re-imported ${ok} of ${targets.length} mission(s)`);
    setSelectedIds(new Set());
    await loadDesktopMissions(true);
    setBusyKey(null);
  };

  const handleSaveDesktopPolicy = async () => {
    setBusyKey('save-desktop-policy');
    try {
      await axiosClient({
        method: 'POST',
        url: '/api/mission/storage-policy',
        data: { desktop: policyDraft },
      });
      toast.success('Desktop auto-free storage policy updated');
      setShowPolicy(false);
      await loadDesktopMissions(true);
    } catch (e: any) {
      toast.error(e?.data?.error || 'Failed to save desktop policy');
    } finally {
      setBusyKey(null);
    }
  };

  const handleExportLocalArchive = async (missionId: number, displayId: number | null) => {
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
        data: { path, source: 'local' },
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
          Mission Management
        </h1>
        <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
          Manage missions cached on this desktop instance, free device storage, or refetch from ATC
        </p>
      </div>

      {/* Local Storage Summary & Actions */}
      <div className={`rounded-xl border p-3 mb-3 shrink-0 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                isDark
                  ? 'bg-[#353A42] border-[#454B53] text-slate-200'
                  : 'bg-slate-100 border-slate-300 text-slate-700'
              }`}
            >
              Total {counts.total}
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#00B957]/15 text-[#00B957] border border-[#00B957]/40">
              Stored Locally {counts.stored}
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/40">
              Freed (On ATC) {counts.freed}
            </span>
            {counts.unsynced > 0 && (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/40">
                Unsynced {counts.unsynced}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPolicy((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                policyDraft.enabled
                  ? 'border-[#00B957]/50 bg-[#00B957]/10 text-[#00B957]'
                  : isDark
                  ? 'border-[#454B53] bg-[#353A42] text-slate-200 hover:bg-[#3E444E]'
                  : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <HiCog6Tooth className="w-3.5 h-3.5" />
              <span>Auto-Free: {policyDraft.enabled ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={handleSyncAll}
              disabled={busyKey === 'sync-all'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5AA7EA] hover:bg-[#4997db] text-white text-xs font-semibold transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <HiArrowPath
                className={`w-3.5 h-3.5 ${busyKey === 'sync-all' ? 'animate-spin' : ''}`}
              />
              <span>Sync All</span>
            </button>

            <button
              type="button"
              onClick={handleLocalReimportSelected}
              disabled={busyKey !== null || selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#5AA7EA]/60 text-[#5AA7EA] hover:bg-[#5AA7EA]/10 text-xs font-semibold transition cursor-pointer disabled:opacity-40"
            >
              <HiCloudArrowDown className="w-3.5 h-3.5" />
              <span>Re-import Selected</span>
            </button>

            <button
              type="button"
              onClick={handleLocalFreeSelected}
              disabled={busyKey !== null || selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/60 text-amber-400 hover:bg-amber-500/10 text-xs font-semibold transition cursor-pointer disabled:opacity-40"
            >
              <HiTrash className="w-3.5 h-3.5" />
              <span>Free Selected</span>
            </button>
          </div>
        </div>

        {/* Disk & Cache Gauge Bar */}
        {desktopDisk && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-[#383D44] flex flex-wrap items-center justify-between gap-4 text-[11px]">
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <span className={isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}>
                Device Disk:
              </span>
              <div className="flex-1 max-w-xs h-2 rounded-full bg-slate-200 dark:bg-[#353A42] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    desktopDisk.usagePercent >= 85
                      ? 'bg-rose-500'
                      : desktopDisk.usagePercent >= 70
                      ? 'bg-amber-500'
                      : 'bg-[#00B957]'
                  }`}
                  style={{ width: `${Math.min(100, desktopDisk.usagePercent)}%` }}
                />
              </div>
              <span className="font-mono font-semibold">
                {desktopDisk.usagePercent}% ({formatBytes(desktopDisk.freeBytes)} free)
              </span>
            </div>
            <div className={isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}>
              Mission Image Cache:{' '}
              <span className="font-mono font-semibold text-[#5AA7EA]">
                {formatBytes(desktopDisk.cacheBytes)}
              </span>
            </div>
          </div>
        )}

        {/* Collapsible Desktop Auto-Free Policy */}
        {showPolicy && (
          <div className={`mt-3 p-3 rounded-lg border ${subCardBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={policyDraft.enabled}
                  onChange={(e) =>
                    setPolicyDraft((p) => ({ ...p, enabled: e.target.checked }))
                  }
                  className="accent-[#5AA7EA] w-4 h-4"
                />
                <span>Automatically free oldest synced missions on this desktop</span>
              </label>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                    Keep newest:
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={policyDraft.maxLocalMissions}
                    onChange={(e) =>
                      setPolicyDraft((p) => ({
                        ...p,
                        maxLocalMissions: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className={`w-16 px-2 py-1 rounded border text-xs ${inputCls}`}
                  />
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                    missions
                  </span>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                    Max disk %:
                  </span>
                  <input
                    type="number"
                    min={30}
                    max={98}
                    value={policyDraft.maxDiskPercent}
                    onChange={(e) =>
                      setPolicyDraft((p) => ({
                        ...p,
                        maxDiskPercent: Math.min(
                          98,
                          Math.max(30, Number(e.target.value) || 85)
                        ),
                      }))
                    }
                    className={`w-16 px-2 py-1 rounded border text-xs ${inputCls}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSaveDesktopPolicy}
                  disabled={busyKey === 'save-desktop-policy'}
                  className="px-3 py-1 rounded-lg bg-[#00B957] hover:bg-[#00a34d] text-white font-semibold text-xs cursor-pointer"
                >
                  Save Policy
                </button>
              </div>
            </div>
            <p className={`text-[11px] mt-1.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
              Active missions, currently opened missions, and missions with unsynced changes are never auto-evicted.
            </p>
          </div>
        )}
      </div>

      {/* Desktop Table Card */}
      <div className={`flex-1 rounded-xl border p-3 flex flex-col min-h-0 ${cardBg}`}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-3 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['All', 'All'],
                ['Stored', 'Stored Locally'],
                ['Freed', 'Freed (On ATC)'],
                ['Unsynced', 'Unsynced'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterTab(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer whitespace-nowrap ${
                  filterTab === key
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
              placeholder="Search missions..."
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
                <th className="py-2.5 px-2.5 w-9 rounded-l-md">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size > 0 &&
                      selectedIds.size === filteredMissions.length
                    }
                    onChange={toggleSelectAll}
                    className="accent-[#5AA7EA] cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-2">Mission</th>
                <th className="py-2.5 px-2">Date</th>
                <th className="py-2.5 px-2">FODs / Cleared</th>
                <th className="py-2.5 px-2">Local Size</th>
                <th className="py-2.5 px-2">Local &amp; Sync State</th>
                <th className="py-2.5 px-2 text-right rounded-r-md">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-[#383D44]' : 'divide-slate-200'}`}>
              {filteredMissions.map((m) => {
                const isSelected = selectedIds.has(m.id);
                const isFreed = m.localEvicted;
                const label = m.displayId ?? m.id;
                return (
                  <tr
                    key={m.id}
                    className={
                      isSelected
                        ? isDark
                          ? 'bg-[#31475D]/40'
                          : 'bg-blue-50'
                        : isDark
                        ? 'hover:bg-[#353A42]/50'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2.5 px-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(m.id)}
                        className="accent-[#5AA7EA] cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-2 font-semibold whitespace-nowrap">
                      Mission #{label}
                      <span className="ml-1.5 text-[10px] font-mono text-[#8E95A2]">
                        ({m.status})
                      </span>
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap text-[#9EA4B0]">
                      {formatDate(m.createdAt)}
                    </td>
                    <td className="py-2.5 px-2 font-mono whitespace-nowrap">
                      {m.fods} / {m.cleared}
                    </td>
                    <td className="py-2.5 px-2 font-mono whitespace-nowrap">
                      {isFreed ? '0 B' : formatBytes(m.localSizeBytes)}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      {m.dirtyCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/40">
                          Unsynced ({m.dirtyCount})
                        </span>
                      ) : isFreed ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/40">
                          Freed Locally (On ATC)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#00B957]/15 text-[#00B957] border border-[#00B957]/40">
                          Stored Locally
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {isFreed ? (
                          <button
                            type="button"
                            disabled={busyKey === `reimport-${m.id}`}
                            onClick={() => handleLocalReimportSingle(m.id, label)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#5AA7EA]/15 text-[#5AA7EA] hover:bg-[#5AA7EA]/25 text-[11px] font-semibold cursor-pointer"
                            title="Refetch / Re-import from ATC"
                          >
                            <HiCloudArrowDown className="w-3.5 h-3.5" />
                            <span>Re-import</span>
                          </button>
                        ) : (
                          <>
                            {m.status !== 'ACTIVE' && (
                              <button
                                type="button"
                                disabled={busyKey === `free-${m.id}`}
                                onClick={() => handleLocalFreeSingle(m)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 text-[11px] font-semibold cursor-pointer"
                                title="Free local cache (keeps mission on ATC)"
                              >
                                <HiTrash className="w-3.5 h-3.5" />
                                <span>Free Space</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyKey === `export-${m.id}`}
                              onClick={() => handleExportLocalArchive(m.id, m.displayId)}
                              className={`p-1.5 rounded transition cursor-pointer ${
                                isDark
                                  ? 'text-slate-300 hover:bg-[#41464E]'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                              title="Save .zoidpack Backup Archive to Disk"
                            >
                              <HiArrowDownTray className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredMissions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-[#8E95A2]">
                    {loading ? 'Loading missions...' : 'No missions match this filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
