import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import axiosClient from '@/utils/axios';
import { config } from '@/config/clientConfig';
import { toast } from 'react-toastify';

import General from './general';
import SystemStats from './systemStats';
import MissionManagement from './missionManagement';
import Profile from './profile';
import UserManagement from './userManagement';
import VideoComponent from '../camera-feed/video-feed';
import CamPlay from '../commen/camera-play';
import CamPause from '../commen/camera-pause';

type SettingTabKey =
  | 'general'
  | 'systemStats'
  | 'missionManagement'
  | 'profile'
  | 'userManagement'
  | 'cameras';

interface SettingProps {
  open: boolean;
}

export default function Setting({ open }: SettingProps) {
  const theme = useSelector((store: RootState) => store.theme.theme);
  const isDark = theme === 'dark';

  const [selectedTab, setSelectedTab] = useState<SettingTabKey>('general');

  // Camera Tab States
  const [selectedCam, setSelectedCam] = useState<number>(1);
  const [selectedAll, setSelectedAll] = useState<boolean>(false);
  const [selectedCams, setSelectedCams] = useState<Set<number>>(new Set());
  const [isCommandLoading, setIsCommandLoading] = useState<boolean>(false);

  const isMapOpen = useSelector((store: RootState) => store.MapReducer.isMapOpen);
  const currentLocation = useSelector((store: RootState) => store.SystemHealth.RtkData);
  const missionNumber = useSelector((store: RootState) => store.MissionState.missionNumber);

  const giveMeCameraName = (id: number): string | null => {
    let result: string | null = null;
    Object.keys(config.cameraMap).forEach((name) => {
      if ((config.cameraMap as Record<string, number>)[name] === id) {
        result = name;
      }
    });
    return result;
  };

  const toggleCamInSet = (camId: number) => {
    setSelectedCams((prev) => {
      const next = new Set(prev);
      if (next.has(camId)) {
        next.delete(camId);
      } else {
        next.add(camId);
      }
      return next;
    });
  };

  const triggeredCommands = async (type: string) => {
    setIsCommandLoading(true);
    try {
      const data = {
        type,
        missionId: missionNumber,
        camList: selectedAll
          ? Object.keys(config.cameraMap).map((cam) => cam.split('_').join(''))
          : Array.from(selectedCams).map((id: number) => {
              let name = giveMeCameraName(id);
              if (name) {
                name = name.split('_').join('');
              }
              return name;
            }),
      };
      await axiosClient({
        method: 'POST',
        url: '/api/command',
        data,
      });
      toast.success(`Camera command '${type}' sent successfully`);
    } catch (err: any) {
      toast.error(`Failed to execute camera command '${type}'`);
    } finally {
      setIsCommandLoading(false);
    }
  };

  if (isMapOpen || !open) {
    return null;
  }

  return (
    <div
      className={`settings-native-theme relative h-full w-full flex gap-5 p-4 overflow-hidden transition-colors duration-200 ${
        isDark ? 'bg-[#22262B] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'
      }`}
    >
      {/* Settings Left Internal Sidebar */}
      <aside
        className={`w-56 shrink-0 h-full rounded-xl flex flex-col justify-between border select-none transition-colors duration-200 ${
          isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="p-3.5 space-y-4 overflow-y-auto">
          {/* Section Title */}
          <div className="px-2 pt-1">
            <h2
              className={`text-lg font-bold tracking-tight ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              Settings
            </h2>
          </div>

          {/* Main User Navigation Links */}
          <nav className="space-y-1">
            {/* General */}
            <button
              type="button"
              onClick={() => setSelectedTab('general')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedTab === 'general'
                  ? isDark
                    ? 'border border-[#5AA7EA] bg-[#2E3E4E] text-white shadow-xs'
                    : 'border border-blue-500/80 bg-blue-50 text-blue-700 shadow-xs font-semibold'
                  : isDark
                  ? 'border border-transparent text-[#9EA4B0] hover:text-white hover:bg-[#353A42]/60'
                  : 'border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                />
              </svg>
              <span>General</span>
            </button>

            {/* System Stats */}
            <button
              type="button"
              onClick={() => setSelectedTab('systemStats')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedTab === 'systemStats'
                  ? isDark
                    ? 'border border-[#5AA7EA] bg-[#2E3E4E] text-white shadow-xs'
                    : 'border border-blue-500/80 bg-blue-50 text-blue-700 shadow-xs font-semibold'
                  : isDark
                  ? 'border border-transparent text-[#9EA4B0] hover:text-white hover:bg-[#353A42]/60'
                  : 'border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
                />
              </svg>
              <span>System Stats</span>
            </button>

            {/* Mission Management */}
            <button
              type="button"
              onClick={() => setSelectedTab('missionManagement')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedTab === 'missionManagement'
                  ? isDark
                    ? 'border border-[#5AA7EA] bg-[#2E3E4E] text-white shadow-xs'
                    : 'border border-blue-500/80 bg-blue-50 text-blue-700 shadow-xs font-semibold'
                  : isDark
                  ? 'border border-transparent text-[#9EA4B0] hover:text-white hover:bg-[#353A42]/60'
                  : 'border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                />
              </svg>
              <span>Mission Management</span>
            </button>

            {/* User Profile */}
            <button
              type="button"
              onClick={() => setSelectedTab('profile')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedTab === 'profile'
                  ? isDark
                    ? 'border border-[#5AA7EA] bg-[#2E3E4E] text-white shadow-xs'
                    : 'border border-blue-500/80 bg-blue-50 text-blue-700 shadow-xs font-semibold'
                  : isDark
                  ? 'border border-transparent text-[#9EA4B0] hover:text-white hover:bg-[#353A42]/60'
                  : 'border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
              <span>User Profile</span>
            </button>
          </nav>

          {/* ADMIN Section */}
          <div className={`pt-3 border-t ${isDark ? 'border-[#383D44]' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between px-3 pb-2">
              <span
                className={`text-[10px] font-bold tracking-wider uppercase ${
                  isDark ? 'text-[#8E95A2]' : 'text-slate-500'
                }`}
              >
                ADMIN
              </span>
              <svg
                className={`w-3.5 h-3.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>

            <nav className="space-y-1">
              {/* User Management */}
              <button
                type="button"
                onClick={() => setSelectedTab('userManagement')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  selectedTab === 'userManagement'
                    ? isDark
                      ? 'border border-[#5AA7EA] bg-[#2E3E4E] text-white shadow-xs'
                      : 'border border-blue-500/80 bg-blue-50 text-blue-700 shadow-xs font-semibold'
                    : isDark
                    ? 'border border-transparent text-[#9EA4B0] hover:text-white hover:bg-[#353A42]/60'
                    : 'border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.999-3.199a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                  />
                </svg>
                <span>User Management</span>
              </button>

              {/* Cameras */}
              <button
                type="button"
                onClick={() => setSelectedTab('cameras')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  selectedTab === 'cameras'
                    ? isDark
                      ? 'border border-[#5AA7EA] bg-[#2E3E4E] text-white shadow-xs'
                      : 'border border-blue-500/80 bg-blue-50 text-blue-700 shadow-xs font-semibold'
                    : isDark
                    ? 'border border-transparent text-[#9EA4B0] hover:text-white hover:bg-[#353A42]/60'
                    : 'border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
                <span>Cameras</span>
              </button>
            </nav>
          </div>
        </div>
      </aside>

      {/* Main Settings Content Area */}
      <main className="flex-1 h-full overflow-y-auto pr-1">
        {selectedTab === 'general' && <General />}
        {selectedTab === 'systemStats' && <SystemStats />}
        {selectedTab === 'missionManagement' && <MissionManagement />}
        {selectedTab === 'profile' && <Profile />}
        {selectedTab === 'userManagement' && <UserManagement />}

        {/* Cameras Management View */}
        {selectedTab === 'cameras' && (
          <div className="space-y-5">
            {/* Header */}
            <div>
              <h1
                className={`text-xl font-bold tracking-tight ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                Cameras
              </h1>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
                Live optical feed and multi-camera command control
              </p>
            </div>

            {/* Live Camera View Card */}
            <div
              className={`rounded-xl border overflow-hidden transition-colors ${
                isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              <div
                className={`flex items-center justify-between px-4 py-2.5 border-b ${
                  isDark ? 'bg-[#353A42] border-[#3E434C]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-semibold ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    Active Feed: Camera #{selectedCam}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-[#5AA7EA]/20 text-[#5AA7EA] border border-[#5AA7EA]/30">
                    {giveMeCameraName(selectedCam) || `CAM_${selectedCam}`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <CamPlay selectedCam={selectedCam} />
                  <CamPause selectedCam={selectedCam} />
                </div>
              </div>

              <div className="p-4">
                {/* Video Component */}
                <div
                  className={`relative rounded-lg overflow-hidden border flex items-center justify-center min-h-[340px] max-h-[460px] ${
                    isDark ? 'bg-[#22262B] border-[#383D44]' : 'bg-slate-900 border-slate-200'
                  }`}
                >
                  <VideoComponent currentLocation={currentLocation} selectedCam={selectedCam} />
                </div>

                {/* Single Camera Switcher Pills */}
                <div className="mt-4">
                  <div
                    className={`text-xs font-medium mb-2 ${
                      isDark ? 'text-[#9EA4B0]' : 'text-slate-500'
                    }`}
                  >
                    Switch Active Camera
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 26 }).map((_, idx) => {
                      const camId = idx + 1;
                      const isActive = selectedCam === camId;
                      return (
                        <button
                          key={camId}
                          type="button"
                          onClick={() => setSelectedCam(camId)}
                          className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-[#5AA7EA] text-white shadow-xs'
                              : isDark
                              ? 'bg-[#353A42] text-slate-300 hover:bg-[#41464E] border border-[#454B53]'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                          }`}
                        >
                          {camId}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Batch Multi-Camera Control Card */}
            <div
              className={`rounded-xl border overflow-hidden transition-colors ${
                isDark ? 'bg-[#292D33] border-[#383D44]' : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              <div
                className={`flex items-center justify-between px-4 py-2.5 border-b ${
                  isDark ? 'bg-[#353A42] border-[#3E434C]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div>
                  <h3
                    className={`text-sm font-semibold ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    Batch Camera Commands
                  </h3>
                </div>

                {/* Select All Checkbox */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedAll}
                    onChange={(e) => {
                      setSelectedAll(e.target.checked);
                      if (e.target.checked) {
                        setSelectedCams(new Set(Array.from({ length: 26 }, (_, i) => i + 1)));
                      } else {
                        setSelectedCams(new Set());
                      }
                    }}
                    className="w-4 h-4 rounded accent-[#5AA7EA]"
                  />
                  <span
                    className={`text-xs font-semibold ${
                      isDark ? 'text-slate-200' : 'text-slate-800'
                    }`}
                  >
                    Select All (26)
                  </span>
                </label>
              </div>

              <div className="p-4">
                {/* Multi-Select Pills */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {Array.from({ length: 26 }).map((_, idx) => {
                    const camId = idx + 1;
                    const isChecked = selectedAll || selectedCams.has(camId);
                    return (
                      <button
                        key={camId}
                        type="button"
                        onClick={() => toggleCamInSet(camId)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-[#5AA7EA] text-white shadow-xs'
                            : isDark
                            ? 'bg-[#353A42] text-[#9EA4B0] hover:text-white border border-[#454B53]'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                        }`}
                      >
                        {camId}
                      </button>
                    );
                  })}
                </div>

                {/* Command Action Buttons */}
                <div className={`flex items-center gap-3 pt-3 border-t ${isDark ? 'border-[#383D44]' : 'border-slate-200'}`}>
                  <button
                    type="button"
                    disabled={isCommandLoading || (!selectedAll && selectedCams.size === 0)}
                    onClick={() => triggeredCommands('start')}
                    className="px-4 py-2 rounded-lg bg-[#00B957] hover:bg-[#00a34d] active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Start Selected</span>
                  </button>

                  <button
                    type="button"
                    disabled={isCommandLoading || (!selectedAll && selectedCams.size === 0)}
                    onClick={() => triggeredCommands('terminate')}
                    className="px-4 py-2 rounded-lg border border-rose-500/60 text-rose-400 hover:bg-rose-500/10 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Terminate Selected</span>
                  </button>

                  <span
                    className={`text-xs ml-auto ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}
                  >
                    {selectedAll ? 'All 26' : selectedCams.size} cameras targeted
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
