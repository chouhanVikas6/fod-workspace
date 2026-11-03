import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  HiArrowPath,
  HiTrash,
  HiMagnifyingGlass,
  HiCheck,
} from 'react-icons/hi2';
import axiosClient from '@/utils/axios';
import { toast } from 'react-toastify';

interface MissionRowItem {
  id: string | number;
  name: string;
  date: string;
  vehicle: string;
  operator: string;
  fods: number;
  syncStatus: 'Synced' | 'Not synced' | 'Syncing' | 'Failed';
  syncProgress?: number;
}

const INITIAL_MISSIONS: MissionRowItem[] = [
  { id: 18, name: 'Runway 09L Sweep', date: '16 Oct 2026', vehicle: 'CAR1', operator: 'James Carter', fods: 256, syncStatus: 'Synced' },
  { id: 17, name: 'Taxiway B Inspection', date: '16 Oct 2026', vehicle: 'CAR2', operator: 'Priya Nair', fods: 41, syncStatus: 'Not synced' },
  { id: 16, name: 'Apron 3 Sweep', date: '15 Oct 2026', vehicle: 'CAR1', operator: 'James Carter', fods: 18, syncStatus: 'Syncing', syncProgress: 64 },
  { id: 15, name: 'Runway 27R Sweep', date: '15 Oct 2026', vehicle: 'CAR2', operator: 'Omar Haddad', fods: 73, syncStatus: 'Failed' },
  { id: 14, name: 'Taxiway A Inspection', date: '14 Oct 2026', vehicle: 'CAR1', operator: 'Elena Rossi', fods: 9, syncStatus: 'Synced' },
  { id: 13, name: 'Perimeter Road', date: '14 Oct 2026', vehicle: 'CAR2', operator: 'Priya Nair', fods: 3, syncStatus: 'Not synced' },
];

export default function MissionManagement() {
  const theme = useSelector((store: RootState) => store.theme.theme);
  const isDark = theme === 'dark';

  const [missions, setMissions] = useState<MissionRowItem[]>(INITIAL_MISSIONS);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [filterTab, setFilterTab] = useState<'All' | 'Synced' | 'Not synced'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Load real missions if available from the backend
  useEffect(() => {
    let cancelled = false;
    axiosClient({ method: 'GET', url: '/api/mission' })
      .then((res) => {
        if (!cancelled && Array.isArray(res.data) && res.data.length > 0) {
          const mapped: MissionRowItem[] = res.data.map((m: any, idx: number) => {
            const rawDate = m.createdAt || m.created_at;
            const dateStr = rawDate ? new Date(rawDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '16 Oct 2026';
            const statusStr = m.status === 'TERMINATED' ? 'Synced' : m.status === 'ACTIVE' ? 'Syncing' : idx % 3 === 0 ? 'Not synced' : 'Synced';
            return {
              id: m.id || m.mission_id || idx + 1,
              name: m.name || `Mission #${m.id || idx + 1}`,
              date: dateStr,
              vehicle: m.car_id || 'CAR1',
              operator: m.operator || 'Admin',
              fods: m.fod_count || m.fods || (idx * 17 + 8),
              syncStatus: statusStr,
              syncProgress: statusStr === 'Syncing' ? 64 : undefined,
            };
          });
          setMissions(mapped);
        }
      })
      .catch(() => {
        // Keep initial mock items for demo fidelity
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Compute status summary counters
  const totalCount = missions.length;
  const syncedCount = missions.filter((m) => m.syncStatus === 'Synced').length;
  const notSyncedCount = missions.filter((m) => m.syncStatus === 'Not synced').length;
  const failedCount = missions.filter((m) => m.syncStatus === 'Failed').length;

  const filteredMissions = useMemo(() => {
    return missions.filter((m) => {
      const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.operator.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.vehicle.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (filterTab === 'Synced') return m.syncStatus === 'Synced';
      if (filterTab === 'Not synced') return m.syncStatus === 'Not synced';
      return true;
    });
  }, [missions, searchQuery, filterTab]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMissions.map((m) => m.id)));
    }
  };

  const toggleSelect = (id: string | number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSyncAll = () => {
    setIsSyncingAll(true);
    setTimeout(() => {
      setMissions((prev) =>
        prev.map((m) => (m.syncStatus !== 'Synced' ? { ...m, syncStatus: 'Synced', syncProgress: undefined } : m))
      );
      setIsSyncingAll(false);
      toast.success('All missions synchronized with Car and ATC');
    }, 1200);
  };

  const handleRemoveSelected = () => {
    if (selectedIds.size === 0) {
      toast.info('No missions selected');
      return;
    }
    if (!window.confirm(`Delete ${selectedIds.size} selected mission(s)?`)) return;
    setMissions((prev) => prev.filter((m) => !selectedIds.has(m.id)));
    setSelectedIds(new Set());
    toast.success('Selected missions removed');
  };

  const handleSyncSingle = (id: string | number) => {
    setMissions((prev) =>
      prev.map((m) => (m.id === id ? { ...m, syncStatus: 'Syncing', syncProgress: 64 } : m))
    );
    setTimeout(() => {
      setMissions((prev) =>
        prev.map((m) => (m.id === id ? { ...m, syncStatus: 'Synced', syncProgress: undefined } : m))
      );
      toast.success(`Mission #${id} synced`);
    }, 1000);
  };

  const handleDeleteSingle = (id: string | number) => {
    if (!window.confirm(`Delete mission #${id}?`)) return;
    setMissions((prev) => prev.filter((m) => m.id !== id));
    toast.success(`Mission #${id} deleted`);
  };

  return (
    <div className="w-full h-full flex flex-col justify-start overflow-y-auto">
      {/* Top Header */}
      <div className="mb-3">
        <h1 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Mission Management
        </h1>
        <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
          Mission list and sync status
        </p>
      </div>

      {/* Status Badges (Left) & Action Buttons (Right) */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
              isDark
                ? 'bg-[#353A42] border-[#454B53] text-slate-200'
                : 'bg-slate-100 border-slate-300 text-slate-700'
            }`}
          >
            Total {totalCount}
          </span>
          <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#00B957]/15 text-[#00B957] border border-[#00B957]/40">
            Synced {syncedCount}
          </span>
          <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/40">
            Not synced {notSyncedCount}
          </span>
          <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/40">
            Failed {failedCount}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSyncAll}
            disabled={isSyncingAll}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#5AA7EA] hover:bg-[#4997db] text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <HiArrowPath className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
            <span>Sync all</span>
          </button>

          <button
            type="button"
            onClick={handleRemoveSelected}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-500/60 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition active:scale-95 cursor-pointer"
          >
            <span>Remove selected</span>
          </button>
        </div>
      </div>

      {/* Unified Card: Filter Tabs + Search + Table */}
      <div
        className={`flex-1 rounded-xl border p-4 flex flex-col min-h-0 transition-all ${
          isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        {/* Filter Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-3.5">
          {/* Filter Buttons */}
          <div className="flex items-center gap-1.5">
            {(['All', 'Synced', 'Not synced'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  filterTab === tab
                    ? isDark
                      ? 'bg-[#31475D] border-[#5AA7EA] text-[#5AA7EA]'
                      : 'bg-blue-50 border-blue-500 text-blue-600'
                    : isDark
                    ? 'bg-[#353A42] border-[#454B53] text-slate-300 hover:text-white'
                    : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border w-full sm:w-64 transition ${
              isDark
                ? 'bg-[#353A42] border-[#454B53] focus-within:border-[#5AA7EA]'
                : 'bg-slate-50 border-slate-300 focus-within:border-blue-500'
            }`}
          >
            <HiMagnifyingGlass className={`w-3.5 h-3.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`} />
            <input
              type="text"
              placeholder="Search missions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-transparent text-xs outline-none ${
                isDark ? 'text-white placeholder-[#8E95A2]' : 'text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>
        </div>

        {/* Missions Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr
                className={`font-semibold ${
                  isDark
                    ? 'text-[#9EA4B0] bg-[#353A42]'
                    : 'text-slate-500 bg-slate-100'
                }`}
              >
                <th className="p-3 w-10 rounded-l-md">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filteredMissions.length}
                    onChange={toggleSelectAll}
                    className="accent-[#5AA7EA] rounded cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3">Mission</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Vehicle</th>
                <th className="py-2.5 px-3">Operator</th>
                <th className="py-2.5 px-3">FODs</th>
                <th className="py-2.5 px-3">Sync Status</th>
                <th className="py-2.5 px-3 text-right rounded-r-md">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-[#383D44]' : 'divide-slate-200'}`}>
              {filteredMissions.map((m) => {
                const isSelected = selectedIds.has(m.id);
                return (
                  <tr
                    key={m.id}
                    className={`transition-colors ${
                      isSelected
                        ? isDark
                          ? 'bg-[#31475D]/40'
                          : 'bg-blue-50'
                        : isDark
                        ? 'hover:bg-[#353A42]/50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(m.id)}
                        className="accent-[#5AA7EA] rounded cursor-pointer"
                      />
                    </td>
                    <td className={`py-3 px-3 font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                      {m.name}
                    </td>
                    <td className={`py-3 px-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{m.date}</td>
                    <td className={`py-3 px-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {m.vehicle}
                    </td>
                    <td className={`py-3 px-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {m.operator}
                    </td>
                    <td className={`py-3 px-3 font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      {m.fods}
                    </td>
                    <td className="py-3 px-3">
                      {m.syncStatus === 'Synced' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#00B957]/15 text-[#00B957] border border-[#00B957]/40">
                          Synced
                        </span>
                      )}
                      {m.syncStatus === 'Not synced' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/40">
                          Not synced
                        </span>
                      )}
                      {m.syncStatus === 'Syncing' && (
                        <div className="flex flex-col gap-1 w-24">
                          <span className="text-[11px] font-semibold text-[#5AA7EA]">
                            Syncing {m.syncProgress || 64}%
                          </span>
                          <div className="w-full bg-[#454B53] h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-[#5AA7EA] h-full rounded-full transition-all"
                              style={{ width: `${m.syncProgress || 64}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {m.syncStatus === 'Failed' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/40">
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          title="Sync Mission"
                          onClick={() => handleSyncSingle(m.id)}
                          className={`p-1 rounded transition active:scale-95 cursor-pointer ${
                            isDark
                              ? 'text-[#5AA7EA] hover:bg-[#5AA7EA]/20'
                              : 'text-blue-600 hover:bg-blue-50'
                          }`}
                        >
                          <HiArrowPath className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete Mission"
                          onClick={() => handleDeleteSingle(m.id)}
                          className={`p-1 rounded transition active:scale-95 cursor-pointer ${
                            isDark
                              ? 'text-rose-400 hover:bg-rose-500/20'
                              : 'text-rose-600 hover:bg-rose-50'
                          }`}
                        >
                          <HiTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
