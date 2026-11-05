
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

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.userName ||
    'Naman Zoid';

  const roleName = String(user.role || 'Admin');

  const userInitials = useMemo(() => {
    const parts = fullName.trim().split(/\s+/);

    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return (fullName.slice(0, 2) || 'NZ').toUpperCase();
  }, [fullName]);

  // Form states
  const [name, setName] = useState(fullName);
  const [email, setEmail] = useState(
    user.email || 'sarah.mitchell@zoid.ai'
  );
  const [phone, setPhone] = useState(user.phone || '');
  const [employeeId, setEmployeeId] = useState(
    user.employeeId || 'ZD-0042'
  );

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

  const cardClass = `rounded-lg border overflow-hidden transition-all ${
    isDark
      ? 'bg-[#292D33] border-[#383D44]'
      : 'bg-white border-slate-200 shadow-xs'
  }`;

  const cardHeaderClass = `px-3 py-2 border-b ${
    isDark
      ? 'bg-[#353A42] border-[#3E434C]'
      : 'bg-slate-50 border-slate-200'
  }`;

  const headingClass = `text-xs font-semibold ${
    isDark ? 'text-slate-100' : 'text-slate-800'
  }`;

  const labelClass = `block text-[11px] font-medium mb-1 ${
    isDark ? 'text-[#9EA4B0]' : 'text-slate-600'
  }`;

  const inputClass = `w-full px-2.5 py-1.5 rounded-md text-xs border outline-none transition ${
    isDark
      ? 'bg-[#353A42] border-[#454B53] text-slate-100 placeholder-[#8E95A2] focus:border-[#5AA7EA]'
      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
  }`;

  return (
    <div className="w-full h-full min-h-0 flex flex-col justify-start overflow-y-auto">

      {/* Header */}
      <div className="mb-3">
        <h1
          className={`text-xl font-bold tracking-tight ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}
        >
          My Profile
        </h1>

        <p
          className={`text-xs mt-0.5 ${
            isDark ? 'text-[#8E95A2]' : 'text-slate-500'
          }`}
        >
          Your account details
        </p>
      </div>

      {/* Top three columns */}
      <div className="grid grid-cols-1 lg:grid-cols-[0.78fr_1fr_1fr] gap-2.5 mb-3 items-stretch">

        {/* Profile card */}
        <div
          className={`${cardClass} min-h-[274px] p-4 flex flex-col items-center justify-center text-center`}
        >
          <div className="mb-2.5">
            <div
              className={`w-20 h-20 rounded-full border flex items-center justify-center text-2xl font-semibold tracking-wide ${
                isDark
                  ? 'bg-[#353A42] border-[#454B53] text-[#D9DDE2]'
                  : 'bg-slate-100 border-slate-300 text-slate-800'
              }`}
            >
              {userInitials}
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              toast.info('Photo upload available on connected cloud')
            }
            className="text-xs font-medium text-[#5AA7EA] hover:underline transition mb-2 cursor-pointer"
          >
            Change photo
          </button>

          <h2
            className={`text-base font-bold tracking-tight ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}
          >
            {fullName}
          </h2>

          <div className="mt-1.5 mb-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#31475D] text-[#5AA7EA] border border-[#5AA7EA]/40">
              {roleName}
            </span>
          </div>

          <p
            className={`text-xs ${
              isDark ? 'text-[#8E95A2]' : 'text-slate-500'
            }`}
          >
            Member since Mar 2025
          </p>
        </div>

        {/* Personal information */}
        <div className={`${cardClass} min-h-[274px] flex flex-col`}>
          <div className={cardHeaderClass}>
            <h2 className={headingClass}>Personal information</h2>
          </div>

          <div className="p-3 flex flex-col gap-2 flex-1 justify-between">

            <div>
              <label className={labelClass}>Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleSavePersonalInfo}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="text"
                placeholder="Phone..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Employee ID</label>
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Security */}
        <div className={`${cardClass} min-h-[274px] flex flex-col`}>
          <div className={cardHeaderClass}>
            <h2 className={headingClass}>Security</h2>
          </div>

          <div className="p-3 flex flex-col flex-1 justify-between">
            <form
              onSubmit={handleUpdatePassword}
              className="flex flex-col gap-2"
            >
              <div>
                <label className={labelClass}>Current password</label>
                <input
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>New password</label>
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Confirm password</label>
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={isUpdatingPassword}
                className="w-full mt-0.5 py-2 rounded-md bg-[#4C9FE8] hover:bg-[#4997db] text-white text-xs font-semibold shadow-xs transition active:scale-[0.99] cursor-pointer disabled:opacity-50"
              >
                {isUpdatingPassword ? 'Updating...' : 'Update password'}
              </button>
            </form>

            <p
              className={`text-[11px] mt-2 ${
                isDark ? 'text-[#8E95A2]' : 'text-slate-400'
              }`}
            >
              Last login: Today 13:12 from CONSOLE-01
            </p>
          </div>
        </div>
      </div>

      {/* Activity summary */}
      <div className={cardClass}>
        <div className={cardHeaderClass}>
          <h2 className={headingClass}>Activity summary</h2>
        </div>

        <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">

          <div
            className={`rounded-md p-3 border flex flex-col items-center justify-center text-center ${
              isDark
                ? 'bg-[#353A42] border-[#454B53]'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span
              className={`text-[11px] font-medium mb-1 ${
                isDark ? 'text-[#9EA4B0]' : 'text-slate-500'
              }`}
            >
              Missions run
            </span>
            <span className="text-xl font-bold text-[#5AA7EA]">
              64
            </span>
          </div>

          <div
            className={`rounded-md p-3 border flex flex-col items-center justify-center text-center ${
              isDark
                ? 'bg-[#353A42] border-[#454B53]'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span
              className={`text-[11px] font-medium mb-1 ${
                isDark ? 'text-[#9EA4B0]' : 'text-slate-500'
              }`}
            >
              FODs confirmed
            </span>
            <span className="text-xl font-bold text-[#00B957]">
              512
            </span>
          </div>

          <div
            className={`rounded-md p-3 border flex flex-col items-center justify-center text-center ${
              isDark
                ? 'bg-[#353A42] border-[#454B53]'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span
              className={`text-[11px] font-medium mb-1 ${
                isDark ? 'text-[#9EA4B0]' : 'text-slate-500'
              }`}
            >
              Hours on duty
            </span>
            <span className="text-xl font-bold text-amber-400">
              310
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
