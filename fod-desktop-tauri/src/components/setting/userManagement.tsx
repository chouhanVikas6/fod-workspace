import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  HiMagnifyingGlass,
  HiPlus,
  HiKey,
  HiPencilSquare,
  HiTrash,
  HiXMark,
} from 'react-icons/hi2';
import axiosClient from '@/utils/axios';
import { toast } from 'react-toastify';

interface UserRecord {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: 'ADMIN' | 'COLLECTOR' | 'ATC';
  assignedVehicle: string;
  status: 'Active' | 'Offline' | 'Suspended';
  accessLiveCameras: boolean;
  accessConfirmFod: boolean;
  accessSystemSettings: boolean;
}

const INITIAL_USERS: UserRecord[] = [
  {
    id: 'u-1',
    username: 'tanish',
    firstName: 'Tanish',
    lastName: 'Zoid',
    email: 'tanish@zoidtech.co.in',
    role: 'ATC',
    assignedVehicle: 'All',
    status: 'Active',
    accessLiveCameras: true,
    accessConfirmFod: true,
    accessSystemSettings: true,
  },
  {
    id: 'u-2',
    username: 'naman',
    firstName: 'Naman',
    lastName: 'Zoid',
    email: 'naman@zoidtech.co.in',
    role: 'COLLECTOR',
    assignedVehicle: 'CAR1',
    status: 'Active',
    accessLiveCameras: true,
    accessConfirmFod: true,
    accessSystemSettings: false,
  },
  {
    id: 'u-3',
    username: 'anish',
    firstName: 'Anish',
    lastName: 'Zoid',
    email: 'anish@zoidtech.co.in',
    role: 'COLLECTOR',
    assignedVehicle: 'CAR2',
    status: 'Active',
    accessLiveCameras: true,
    accessConfirmFod: true,
    accessSystemSettings: false,
  },
  {
    id: 'u-4',
    username: 'vikas',
    firstName: 'Vikas',
    lastName: 'Zoid',
    email: 'vikas@zoidtech.co.in',
    role: 'ATC',
    assignedVehicle: 'All',
    status: 'Active',
    accessLiveCameras: true,
    accessConfirmFod: false,
    accessSystemSettings: false,
  },
  {
    id: 'u-5',
    username: 'tanish2',
    firstName: 'Tanish',
    lastName: 'Zoid',
    email: 'tanish2@zoidtech.co.in',
    role: 'COLLECTOR',
    assignedVehicle: 'CAR1',
    status: 'Offline',
    accessLiveCameras: true,
    accessConfirmFod: true,
    accessSystemSettings: false,
  },
  {
    id: 'u-6',
    username: 'tanish3',
    firstName: 'Tanish',
    lastName: 'Zoid',
    email: 'tanish3@zoidtech.co.in',
    role: 'COLLECTOR',
    assignedVehicle: 'CAR2',
    status: 'Suspended',
    accessLiveCameras: false,
    accessConfirmFod: false,
    accessSystemSettings: false,
  },
];

export default function UserManagement() {
  const theme = useSelector((store: RootState) => store.theme.theme);
  const isDark = theme === 'dark';

  const [users, setUsers] = useState<UserRecord[]>(INITIAL_USERS);
  const [selectedUserId, setSelectedUserId] = useState<string>('u-2');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'COLLECTOR'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Add User Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'ADMIN' | 'COLLECTOR' | 'ATC'>('COLLECTOR');
  const [newVehicle, setNewVehicle] = useState('CAR1');

  // Edit Drawer Form States
  const [editRole, setEditRole] = useState<'ADMIN' | 'COLLECTOR' | 'ATC'>('COLLECTOR');
  const [editVehicle, setEditVehicle] = useState('CAR1');
  const [editLiveCams, setEditLiveCams] = useState(true);
  const [editConfirmFod, setEditConfirmFod] = useState(true);
  const [editSysSettings, setEditSysSettings] = useState(false);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');

  // Selected user
  const selectedUser = useMemo(() => {
    return users.find((u) => u.id === selectedUserId) || users[0];
  }, [users, selectedUserId]);

  // Sync drawer fields when selectedUser changes
  useEffect(() => {
    if (selectedUser) {
      setEditRole(selectedUser.role);
      setEditVehicle(selectedUser.assignedVehicle);
      setEditLiveCams(selectedUser.accessLiveCameras);
      setEditConfirmFod(selectedUser.accessConfirmFod);
      setEditSysSettings(selectedUser.accessSystemSettings);
      setEditNewPassword('');
      setEditConfirmPassword('');
    }
  }, [selectedUser]);

  // Fetch real users from backend if available
  useEffect(() => {
    let cancelled = false;
    axiosClient({ method: 'GET', url: '/api/auth/users' })
      .then((res) => {
        if (!cancelled && res.data?.users && Array.isArray(res.data.users) && res.data.users.length > 0) {
          const mapped: UserRecord[] = res.data.users.map((u: any, idx: number) => {
            const roleStr = String(u.role || 'COLLECTOR').toUpperCase() as any;
            return {
              id: u.id || `real-${idx}`,
              username: u.username || u.userName || `user_${idx}`,
              firstName: u.firstName || (u.userName || 'Operator'),
              lastName: u.lastName || '',
              email: u.email || `${u.username || 'user'}@zoidtech.co.in`,
              role: roleStr === 'ADMIN' ? 'ADMIN' : roleStr === 'ATC' ? 'ATC' : 'COLLECTOR',
              assignedVehicle: u.assignedVehicle || (idx % 2 === 0 ? 'CAR1' : 'CAR2'),
              status: u.isActive === false ? 'Offline' : 'Active',
              accessLiveCameras: true,
              accessConfirmFod: true,
              accessSystemSettings: roleStr === 'ADMIN',
            };
          });
          setUsers(mapped);
          if (mapped[0]) setSelectedUserId(mapped[0].id);
        }
      })
      .catch(() => {
        // Retain initial mock users
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const adminCount = users.filter((u) => u.role === 'ADMIN' || u.role === 'ATC').length;
  const collectorCount = users.filter((u) => u.role === 'COLLECTOR').length;

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const name = `${u.firstName || ''} ${u.lastName || ''} ${u.username}`.toLowerCase();
      if (searchQuery && !name.includes(searchQuery.toLowerCase())) return false;
      if (roleFilter === 'ADMIN' && u.role !== 'ADMIN' && u.role !== 'ATC') return false;
      if (roleFilter === 'COLLECTOR' && u.role !== 'COLLECTOR') return false;
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      return true;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      toast.error('Username and password are required');
      return;
    }

    const newUser: UserRecord = {
      id: `u-${Date.now()}`,
      username: newUsername.trim(),
      firstName: newFirstName.trim() || newUsername.trim(),
      lastName: newLastName.trim(),
      email: `${newUsername.trim()}@zoidtech.co.in`,
      role: newRole,
      assignedVehicle: newVehicle,
      status: 'Active',
      accessLiveCameras: true,
      accessConfirmFod: true,
      accessSystemSettings: newRole === 'ADMIN',
    };

    try {
      await axiosClient({
        method: 'POST',
        url: '/api/auth/users',
        data: {
          userName: newUsername.trim(),
          username: newUsername.trim(),
          firstName: newFirstName.trim(),
          lastName: newLastName.trim(),
          password: newPassword,
          role: newRole,
          isActive: true,
        },
      });
    } catch {
      // Backend may be offline in demo mode; update state locally
    }

    setUsers((prev) => [newUser, ...prev]);
    setSelectedUserId(newUser.id);
    setShowAddModal(false);
    setNewUsername('');
    setNewFirstName('');
    setNewLastName('');
    setNewPassword('');
    toast.success(`User '${newUser.firstName}' created`);
  };

  const handleSaveDrawer = async () => {
    if (!selectedUser) return;

    if (editNewPassword) {
      if (editNewPassword !== editConfirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    }

    try {
      await axiosClient({
        method: 'PUT',
        url: `/api/auth/users/${selectedUser.id}`,
        data: {
          role: editRole,
          ...(editNewPassword ? { password: editNewPassword } : {}),
        },
      });
    } catch {
      // Ignore background error
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUser.id
          ? {
              ...u,
              role: editRole,
              assignedVehicle: editVehicle,
              accessLiveCameras: editLiveCams,
              accessConfirmFod: editConfirmFod,
              accessSystemSettings: editSysSettings,
            }
          : u
      )
    );
    setEditNewPassword('');
    setEditConfirmPassword('');
    toast.success('User profile updated');
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Delete this user? This action cannot be undone.')) return;

    try {
      await axiosClient({
        method: 'DELETE',
        url: `/api/auth/users/${id}`,
      });
    } catch {
      // Ignore
    }

    setUsers((prev) => prev.filter((u) => u.id !== id));
    toast.success('User deleted');
  };

  const getInitials = (u: UserRecord) => {
    const fn = (u.firstName || u.username)[0] || '';
    const ln = (u.lastName || '')[0] || (u.username[1] || '');
    return `${fn}${ln}`.toUpperCase();
  };

  return (
    <div className="w-full h-full flex flex-col justify-start overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            User Management
          </h1>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
            Manage collector and admin profiles
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#5AA7EA] hover:bg-[#4997db] text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
        >
          <HiPlus className="w-4 h-4" />
          <span>Add User</span>
        </button>
      </div>

      {/* Main 2-Column Grid: Users Table Card (Left) + Profile Drawer Card (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left Column: Unified Filter + Users Table Card (8 cols) */}
        <div
          className={`lg:col-span-8 rounded-xl border p-4 overflow-hidden flex flex-col transition-all ${
            isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          {/* Search & Filter Bar Inside Card */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3.5">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {/* Search */}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border w-full sm:w-52 transition ${
                  isDark
                    ? 'bg-[#353A42] border-[#454B53] focus-within:border-[#5AA7EA]'
                    : 'bg-slate-50 border-slate-300 focus-within:border-blue-500'
                }`}
              >
                <HiMagnifyingGlass className={`w-3.5 h-3.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`} />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full bg-transparent text-xs outline-none ${
                    isDark ? 'text-white placeholder-[#8E95A2]' : 'text-slate-900 placeholder-slate-400'
                  }`}
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRoleFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    roleFilter === 'ALL'
                      ? isDark
                        ? 'bg-[#31475D] border-[#5AA7EA] text-[#5AA7EA]'
                        : 'bg-blue-50 border-blue-500 text-blue-600'
                      : isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-300 hover:text-white'
                      : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({users.length.toString().padStart(2, '0')})
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter('ADMIN')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    roleFilter === 'ADMIN'
                      ? isDark
                        ? 'bg-[#31475D] border-[#5AA7EA] text-[#5AA7EA]'
                        : 'bg-blue-50 border-blue-500 text-blue-600'
                      : isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-300 hover:text-white'
                      : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Admins ({adminCount})
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter('COLLECTOR')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    roleFilter === 'COLLECTOR'
                      ? isDark
                        ? 'bg-[#31475D] border-[#5AA7EA] text-[#5AA7EA]'
                        : 'bg-blue-50 border-blue-500 text-blue-600'
                      : isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-300 hover:text-white'
                      : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Collectors ({collectorCount.toString().padStart(2, '0')})
                </button>
              </div>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border outline-none cursor-pointer transition ${
                isDark
                  ? 'bg-[#353A42] border-[#454B53] text-slate-200'
                  : 'bg-slate-50 border-slate-300 text-slate-700'
              }`}
            >
              <option value="ALL">Status</option>
              <option value="Active">Active</option>
              <option value="Offline">Offline</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>

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
                  <th className="py-2.5 px-4 rounded-l-md">User</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Assigned Vehicle</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right rounded-r-md">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-[#383D44]' : 'divide-slate-200'}`}>
                {filteredUsers.map((u) => {
                  const isSelected = u.id === selectedUserId;
                  const fullNameStr = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? isDark
                            ? 'bg-[#31475D]/60'
                            : 'bg-blue-50'
                          : isDark
                          ? 'hover:bg-[#353A42]/50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-full border font-bold flex items-center justify-center text-[10px] ${
                              isDark
                                ? 'bg-[#353A42] border-[#454B53] text-slate-200'
                                : 'bg-slate-200 border-slate-300 text-slate-700'
                            }`}
                          >
                            {getInitials(u)}
                          </div>
                          <span className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                            {fullNameStr}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                            u.role === 'ATC' || u.role === 'ADMIN'
                              ? 'bg-[#31475D] text-[#5AA7EA] border-[#5AA7EA]/40'
                              : isDark
                              ? 'bg-[#353A42] text-slate-300 border-[#454B53]'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          {u.role === 'ATC' ? 'ATC' : u.role === 'ADMIN' ? 'Admin' : 'Collector'}
                        </span>
                      </td>
                      <td className={`py-3 px-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {u.assignedVehicle}
                      </td>
                      <td className="py-3 px-3">
                        {u.status === 'Active' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold text-[#00B957] bg-[#00B957]/15 border border-[#00B957]/40">
                            Active
                          </span>
                        )}
                        {u.status === 'Offline' && (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                              isDark
                                ? 'bg-[#353A42] text-slate-300 border-[#454B53]'
                                : 'bg-slate-100 text-slate-500 border-slate-300'
                            }`}
                          >
                            Offline
                          </span>
                        )}
                        {u.status === 'Suspended' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold text-rose-400 bg-rose-500/15 border border-rose-500/40">
                            Suspended
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            title="Reset password"
                            onClick={() => {
                              setSelectedUserId(u.id);
                              toast.info(`Enter new password in profile editor for ${u.firstName || u.username}`);
                            }}
                            className={`p-1 rounded hover:bg-slate-500/20 transition cursor-pointer ${
                              isDark ? 'text-[#9EA4B0]' : 'text-slate-600'
                            }`}
                          >
                            <HiKey className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => setSelectedUserId(u.id)}
                            className={`p-1 rounded hover:bg-slate-500/20 transition cursor-pointer ${
                              isDark ? 'text-[#9EA4B0]' : 'text-slate-600'
                            }`}
                          >
                            <HiPencilSquare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
                          >
                            <HiTrash className="w-3.5 h-3.5" />
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

        {/* Right Column: User Profile Editor Drawer (4 cols) */}
        {selectedUser && (
          <div
            className={`lg:col-span-4 rounded-xl p-4 border flex flex-col justify-between transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div>
              <h2
                className={`text-xs font-semibold pb-2.5 mb-3 border-b ${
                  isDark ? 'text-slate-100 border-[#383D44]' : 'text-slate-800 border-slate-200'
                }`}
              >
                User Profile
              </h2>

              {/* Header with Avatar & Name */}
              <div className="flex items-center gap-3 mb-3.5">
                <div
                  className={`w-11 h-11 rounded-full border font-bold flex items-center justify-center text-sm ${
                    isDark
                      ? 'bg-[#353A42] border-[#454B53] text-white'
                      : 'bg-slate-100 border-slate-300 text-slate-800'
                  }`}
                >
                  {getInitials(selectedUser)}
                </div>
                <div>
                  <div className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {[selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ') || selectedUser.username}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                    {selectedUser.email}
                  </div>
                </div>
              </div>

              {/* Role & Assigned Vehicle Inputs */}
              <div className="flex flex-col gap-2.5 mb-3.5">
                <div>
                  <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-600'}`}>
                    Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as any)}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs font-medium border outline-none cursor-pointer transition ${
                      isDark
                        ? 'bg-[#353A42] border-[#454B53] text-slate-100 focus:border-[#5AA7EA]'
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                    }`}
                  >
                    <option value="COLLECTOR">Collector</option>
                    <option value="ATC">ATC</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-600'}`}>
                    Assigned Vehicle
                  </label>
                  <select
                    value={editVehicle}
                    onChange={(e) => setEditVehicle(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs font-medium border outline-none cursor-pointer transition ${
                      isDark
                        ? 'bg-[#353A42] border-[#454B53] text-slate-100 focus:border-[#5AA7EA]'
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                    }`}
                  >
                    <option value="CAR1">CAR1</option>
                    <option value="CAR2">CAR2</option>
                    <option value="All">All Vehicles</option>
                  </select>
                </div>
              </div>

              {/* Access Permissions Toggles */}
              <div className="mb-3.5">
                <span className={`block text-xs font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                  Access
                </span>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Live Cameras</span>
                    <button
                      type="button"
                      onClick={() => setEditLiveCams(!editLiveCams)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                        editLiveCams ? 'bg-[#00B957]' : isDark ? 'bg-[#454B53]' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition translate-y-0.5 ${
                          editLiveCams ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Confirm FOD</span>
                    <button
                      type="button"
                      onClick={() => setEditConfirmFod(!editConfirmFod)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                        editConfirmFod ? 'bg-[#00B957]' : isDark ? 'bg-[#454B53]' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition translate-y-0.5 ${
                          editConfirmFod ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>System Settings</span>
                    <button
                      type="button"
                      onClick={() => setEditSysSettings(!editSysSettings)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                        editSysSettings ? 'bg-[#00B957]' : isDark ? 'bg-[#454B53]' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition translate-y-0.5 ${
                          editSysSettings ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Change Password Section */}
              <div className="flex flex-col gap-2 mb-3">
                <span className={`block text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                  Change Password
                </span>
                <input
                  type="password"
                  placeholder="New password"
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                    isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-100 placeholder-[#8E95A2] focus:border-[#5AA7EA]'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
                  }`}
                />
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={editConfirmPassword}
                  onChange={(e) => setEditConfirmPassword(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                    isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-100 placeholder-[#8E95A2] focus:border-[#5AA7EA]'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
                  }`}
                />
              </div>
            </div>

            {/* Bottom Buttons */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleDeleteUser(selectedUser.id)}
                className="w-full py-1.5 px-3 rounded-lg border border-rose-500/60 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold text-left transition active:scale-95 cursor-pointer"
              >
                Delete User
              </button>
              <button
                type="button"
                onClick={handleSaveDrawer}
                className="w-full py-2 rounded-lg bg-[#5AA7EA] hover:bg-[#4997db] text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-md rounded-xl p-6 border shadow-2xl transition-all ${
              isDark ? 'bg-[#292D33] border-[#383D44] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">Add New Operator</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <HiXMark className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Username *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. jcarter"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border outline-none ${
                    isDark ? 'bg-[#353A42] border-[#454B53] text-white' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1">First Name</label>
                  <input
                    type="text"
                    placeholder="James"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none ${
                      isDark ? 'bg-[#353A42] border-[#454B53] text-white' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Last Name</label>
                  <input
                    type="text"
                    placeholder="Carter"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none ${
                      isDark ? 'bg-[#353A42] border-[#454B53] text-white' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Password *</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border outline-none ${
                    isDark ? 'bg-[#353A42] border-[#454B53] text-white' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none ${
                      isDark ? 'bg-[#353A42] border-[#454B53] text-white' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="COLLECTOR">Collector</option>
                    <option value="ATC">ATC</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Assigned Vehicle</label>
                  <select
                    value={newVehicle}
                    onChange={(e) => setNewVehicle(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none ${
                      isDark ? 'bg-[#353A42] border-[#454B53] text-white' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="CAR1">CAR1</option>
                    <option value="CAR2">CAR2</option>
                    <option value="All">All Vehicles</option>
                  </select>
                </div>
              </div>

              <div className={`flex items-center justify-end gap-2 mt-4 pt-3 border-t ${isDark ? 'border-[#383D44]' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`px-4 py-2 rounded-lg border font-semibold cursor-pointer ${
                    isDark ? 'border-[#454B53] text-slate-300' : 'border-slate-300 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#5AA7EA] hover:bg-[#4997db] text-white font-semibold shadow-xs cursor-pointer"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
