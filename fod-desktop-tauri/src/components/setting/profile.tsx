import React, { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { getCurrentUser } from '@/utils/auth';
import { toast } from 'react-toastify';
import axiosClient from '@/utils/axios';

export default function Profile() {
  const theme = useSelector((store: RootState) => store.theme.theme);
  const isDark = theme === 'dark';

  const user = useMemo(() => (getCurrentUser() || {}) as any, []);
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.userName || 'Naman Zoid';
  const roleName = String(user.role || 'Admin');
  const userInitials = useMemo(() => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (fullName.slice(0, 2) || 'NZ').toUpperCase();
  }, [fullName]);

  // Form states
  const [name, setName] = useState(fullName);
  const [email, setEmail] = useState(user.email || 'sarah.mitchell@zoid.ai');
  const [phone, setPhone] = useState(user.phone || '');
  const [employeeId, setEmployeeId] = useState(user.employeeId || 'ZD-0042');

  // Security password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      toast.error('New password must be at least 4 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      if (user.id) {
        await axiosClient({
          method: 'PUT',
          url: `/api/auth/users/${user.id}`,
          data: { password: newPassword },
        });
      }
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err?.data?.error || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSavePersonalInfo = () => {
    toast.success('Profile information updated');
  };

  return (
    <div className="w-full h-full flex flex-col justify-start overflow-y-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
          My Profile
        </h1>
        <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
          Your account details
        </p>
      </div>

      {/* Top 3 Columns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Card 1: Avatar & Basic Info */}
        <div
          className={`rounded-xl p-6 border flex flex-col items-center justify-center text-center transition-all ${
            isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          {/* Avatar circle */}
          <div className="relative mb-3">
            <div
              className={`w-22 h-22 rounded-full border flex items-center justify-center text-xl font-bold tracking-wider ${
                isDark
                  ? 'bg-[#353A42] border-[#454B53] text-white'
                  : 'bg-slate-100 border-slate-300 text-slate-800'
              }`}
            >
              {userInitials}
            </div>
          </div>

          <button
            type="button"
            onClick={() => toast.info('Photo upload available on connected cloud')}
            className="text-xs font-medium text-[#5AA7EA] hover:underline transition mb-3 cursor-pointer"
          >
            Change photo
          </button>

          <h2 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {fullName}
          </h2>

          <div className="mt-1.5 mb-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#31475D] text-[#5AA7EA] border border-[#5AA7EA]/40">
              {roleName}
            </span>
          </div>

          <p className={`text-xs ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
            Member since Mar 2025
          </p>
        </div>

        {/* Card 2: Personal Information */}
        <div
          className={`rounded-xl border overflow-hidden flex flex-col transition-all ${
            isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div
            className={`px-4 py-2.5 border-b ${
              isDark ? 'bg-[#353A42] border-[#3E434C]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <h2 className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              Personal information
            </h2>
          </div>

          <div className="p-4 flex flex-col gap-3 flex-1 justify-between">
            <div>
              <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-600'}`}>
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleSavePersonalInfo}
                className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                  isDark
                    ? 'bg-[#353A42] border-[#454B53] text-slate-100 focus:border-[#5AA7EA]'
                    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-600'}`}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                  isDark
                    ? 'bg-[#353A42] border-[#454B53] text-slate-100 focus:border-[#5AA7EA]'
                    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-600'}`}>
                Phone
              </label>
              <input
                type="text"
                placeholder="Phone..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                  isDark
                    ? 'bg-[#353A42] border-[#454B53] text-slate-100 placeholder-[#8E95A2] focus:border-[#5AA7EA]'
                    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-600'}`}>
                Employee ID
              </label>
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                  isDark
                    ? 'bg-[#353A42] border-[#454B53] text-slate-100 focus:border-[#5AA7EA]'
                    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Security */}
        <div
          className={`rounded-xl border overflow-hidden flex flex-col transition-all ${
            isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div
            className={`px-4 py-2.5 border-b ${
              isDark ? 'bg-[#353A42] border-[#3E434C]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <h2 className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              Security
            </h2>
          </div>

          <div className="p-4 flex flex-col justify-between flex-1">
            <form onSubmit={handleUpdatePassword} className="flex flex-col gap-3">
              <div>
                <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-600'}`}>
                  Current password
                </label>
                <input
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                    isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-100 placeholder-[#8E95A2] focus:border-[#5AA7EA]'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-600'}`}>
                  New password
                </label>
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                    isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-100 placeholder-[#8E95A2] focus:border-[#5AA7EA]'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-600'}`}>
                  Confirm password
                </label>
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs border outline-none transition ${
                    isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-100 placeholder-[#8E95A2] focus:border-[#5AA7EA]'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
                  }`}
                />
              </div>

              <button
                type="submit"
                disabled={isUpdatingPassword}
                className="w-full mt-1 py-2 rounded-lg bg-[#5AA7EA] hover:bg-[#4997db] text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isUpdatingPassword ? 'Updating...' : 'Update password'}
              </button>
            </form>

            <p className={`text-[11px] mt-2.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-400'}`}>
              Last login: Today 13:12 from CONSOLE-01
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Card: Activity Summary */}
      <div
        className={`rounded-xl border overflow-hidden transition-all ${
          isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div
          className={`px-4 py-2.5 border-b ${
            isDark ? 'bg-[#353A42] border-[#3E434C]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <h2 className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
            Activity summary
          </h2>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Stat 1: Missions run */}
          <div
            className={`rounded-lg p-3.5 border flex flex-col items-center justify-center text-center transition ${
              isDark ? 'bg-[#353A42] border-[#454B53]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className={`text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
              Missions run
            </span>
            <span className="text-xl font-bold text-[#5AA7EA]">64</span>
          </div>

          {/* Stat 2: FODs confirmed */}
          <div
            className={`rounded-lg p-3.5 border flex flex-col items-center justify-center text-center transition ${
              isDark ? 'bg-[#353A42] border-[#454B53]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className={`text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
              FODs confirmed
            </span>
            <span className="text-xl font-bold text-[#00B957]">512</span>
          </div>

          {/* Stat 3: Hours on duty */}
          <div
            className={`rounded-lg p-3.5 border flex flex-col items-center justify-center text-center transition ${
              isDark ? 'bg-[#353A42] border-[#454B53]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className={`text-[11px] font-medium mb-1 ${isDark ? 'text-[#9EA4B0]' : 'text-slate-500'}`}>
              Hours on duty
            </span>
            <span className="text-xl font-bold text-amber-400">310</span>
          </div>
        </div>
      </div>
    </div>
  );
}
