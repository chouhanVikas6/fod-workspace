import React, { useEffect, useState, useMemo } from 'react';
import axiosClient from '@/utils/axios';
import { getCurrentUser } from '@/utils/auth';
import { toast } from 'react-toastify';
import {
  HiUsers,
  HiUserPlus,
  HiPencilSquare,
  HiTrash,
  HiArrowPath,
  HiCheckCircle,
  HiXMark,
  HiLockClosed,
  HiEye,
  HiEyeSlash,
  HiShieldCheck,
  HiUserCircle,
} from 'react-icons/hi2';

interface UserItem {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role: string;
  isActive: boolean;
  dirty?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export default function UserManagement() {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  // Form states for Add User
  const [newUsername, setNewUsername] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRole, setNewRole] = useState('COLLECTOR');
  const [newIsActive, setNewIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for Edit User
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editRole, setEditRole] = useState('COLLECTOR');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await axiosClient({
        method: 'GET',
        url: '/api/auth/users',
      });
      if (res.data?.users) {
        setUsers(res.data.users);
      }
    } catch (err: any) {
      console.error('Failed to fetch users:', err);
      toast.error('Could not load user list');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      toast.error('Username and password are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        userName: newUsername.trim(),
        username: newUsername.trim(),
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        password: newPassword,
        role: newRole,
        isActive: newIsActive,
      };

      await axiosClient({
        method: 'POST',
        url: '/api/auth/register',
        data: payload,
      });

      toast.success(`User '${newUsername.trim()}' created! Syncing across Car & ATC...`);
      setShowAddModal(false);
      // Reset form
      setNewUsername('');
      setNewFirstName('');
      setNewLastName('');
      setNewPassword('');
      setNewRole('COLLECTOR');
      setNewIsActive(true);
      fetchUsers();
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || 'Failed to create user';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (user: UserItem) => {
    setEditingUser(user);
    setEditFirstName(user.firstName || '');
    setEditLastName(user.lastName || '');
    setEditRole(user.role ? String(user.role).toUpperCase() : 'COLLECTOR');
    setEditIsActive(user.isActive !== false);
    setEditPassword('');
    setShowEditPassword(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSubmitting(true);
    try {
      const payload: any = {
        id: editingUser.id,
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        role: editRole,
        isActive: editIsActive,
      };
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }

      await axiosClient({
        method: 'POST',
        url: '/api/auth/users/update',
        data: payload,
      });

      toast.success(`User updated & queued for system-wide sync`);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || 'Failed to update user';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: UserItem) => {
    if (user.username === currentUser?.userName || user.username === currentUser?.username) {
      toast.error('You cannot delete your own logged-in account');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete user "${user.username}"?`)) {
      return;
    }

    try {
      await axiosClient({
        method: 'POST',
        url: '/api/auth/users/delete',
        data: { id: user.id },
      });
      toast.success(`User "${user.username}" deleted`);
      fetchUsers();
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || 'Failed to delete user';
      toast.error(msg);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole =
      roleFilter === 'ALL' || String(u.role).toUpperCase() === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    const r = (role || '').toUpperCase();
    switch (r) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'COLLECTOR':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'DRIVER':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'GUEST':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="relative w-full h-[80vh] bg-gray-50 overflow-y-auto p-6 text-gray-800">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-gray-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <HiUsers className="w-7 h-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Registered operators automatically synchronize across all active Car, ATC, and Desktop nodes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 active:scale-95 transition"
            title="Refresh list"
          >
            <HiArrowPath className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md active:scale-95 transition"
          >
            <HiUserPlus className="w-5 h-5" />
            <span>Register New User</span>
          </button>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 my-5">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search by name or username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">Admin</option>
            <option value="COLLECTOR">Collector</option>
            <option value="DRIVER">Driver</option>
            <option value="GUEST">Guest</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          <thead className="bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">User</th>
              <th className="px-5 py-3.5">Role</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Sync Status</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">
                  {isLoading ? 'Loading users...' : 'No users found.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
                const isCurrent =
                  u.username === currentUser?.userName || u.username === currentUser?.username;

                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                          {(u.username || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                            {fullName}
                            {isCurrent && (
                              <span className="text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded border border-blue-200">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getRoleBadge(
                          u.role
                        )}`}
                      >
                        {String(u.role || 'GUEST').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {u.isActive !== false ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {u.dirty ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <HiArrowPath className="w-3.5 h-3.5 animate-spin" />
                          Pending Sync
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <HiCheckCircle className="w-3.5 h-3.5 text-blue-600" />
                          Synchronized
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Edit User"
                        >
                          <HiPencilSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          disabled={isCurrent}
                          className={`p-1.5 rounded-lg transition ${
                            isCurrent
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-600 hover:text-red-600 hover:bg-red-50'
                          }`}
                          title={isCurrent ? 'Cannot delete self' : 'Delete User'}
                        >
                          <HiTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: Register New User */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 relative animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <div className="flex items-center gap-2">
                <HiUserPlus className="w-6 h-6 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Register New User</h2>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <HiXMark className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. operator_john"
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="John"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <HiEyeSlash className="w-4 h-4" /> : <HiEye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="COLLECTOR">Collector</option>
                    <option value="DRIVER">Driver</option>
                    <option value="GUEST">Guest</option>
                  </select>
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newIsActive}
                      onChange={(e) => setNewIsActive(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Account Active</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow disabled:opacity-50"
                >
                  {isSubmitting ? 'Registering...' : 'Register User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit User */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 relative animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <div className="flex items-center gap-2">
                <HiPencilSquare className="w-6 h-6 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">
                  Edit User: @{editingUser.username}
                </h2>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <HiXMark className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="COLLECTOR">Collector</option>
                    <option value="DRIVER">Driver</option>
                    <option value="GUEST">Guest</option>
                  </select>
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Account Active</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Reset Password (leave empty to keep current)
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="New password (optional)"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showEditPassword ? <HiEyeSlash className="w-4 h-4" /> : <HiEye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
