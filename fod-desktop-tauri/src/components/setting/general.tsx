import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { setTheme } from '@/store/slices/theme-slice';
import { setLanguage } from '@/store/slices/language-slice';
import { toast } from 'react-toastify';
import notificationSound from '@/assets/audio/notification.mp3';

interface GeneralSettingsState {
  fodAlerts: boolean;
  disconnectAlerts: boolean;
  overspeedAlerts: boolean;
  syncComplete: boolean;
  alertDisplay: string;
  soundEnabled: boolean;
  masterVolume: number;
  alertTone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
}

const DEFAULT_SETTINGS: GeneralSettingsState = {
  fodAlerts: true,
  disconnectAlerts: true,
  overspeedAlerts: true,
  syncComplete: false,
  alertDisplay: 'Popup + list',
  soundEnabled: true,
  masterVolume: 70,
  alertTone: 'Chime',
  dateFormat: 'DD MMM YYYY',
  timeFormat: '24h',
};

export default function General() {
  const dispatch = useDispatch();
  const theme = useSelector((store: RootState) => store.theme.theme);
  const lang = useSelector((store: RootState) => store.language.lang);
  const isDark = theme === 'dark';

  const [settings, setSettings] = useState<GeneralSettingsState>(() => {
    try {
      const saved = localStorage.getItem('zoid_general_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const updateSetting = <K extends keyof GeneralSettingsState>(key: K, value: GeneralSettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    try {
      localStorage.setItem('zoid_general_settings', JSON.stringify(settings));
      toast.success('Settings saved successfully');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    dispatch(setTheme('dark'));
    dispatch(setLanguage('en'));
    localStorage.removeItem('zoid_general_settings');
    toast.info('Preferences reset to default');
  };

  const playTestSound = () => {
    if (!settings.soundEnabled) {
      toast.warn('Sound is currently disabled');
      return;
    }
    try {
      const audio = new Audio(notificationSound);
      audio.volume = Math.max(0, Math.min(1, settings.masterVolume / 100));
      audio.play().catch(() => {
        // Fallback Web Audio API synthetic chime
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(settings.masterVolume / 100, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      });
      toast.success(`Playing alert tone: ${settings.alertTone}`);
    } catch (e) {
      console.warn('Audio play error', e);
    }
  };

  return (
    <div className="w-full h-full flex flex-col justify-between overflow-y-auto">
      {/* Content Area */}
      <div className="flex-1 pb-4">
        {/* Header */}
        <div className="mb-4">
          <h1 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            General
          </h1>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E95A2]' : 'text-slate-500'}`}>
            App preferences for this console
          </p>
        </div>

        {/* 2x2 Settings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Card 1: Theme */}
          <div
            className={`rounded-xl border overflow-hidden transition-all flex flex-col ${
              isDark
                ? 'bg-[#292D33] border-[#383D44]'
                : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div
              className={`px-4 py-2.5 border-b ${
                isDark ? 'bg-[#353A42] border-[#3E434C]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <h2 className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                Theme
              </h2>
            </div>

            <div className="p-4 flex-1 flex items-center">
              <div className="grid grid-cols-3 gap-3 w-full">
                {/* Light Option */}
                <button
                  type="button"
                  onClick={() => dispatch(setTheme('light'))}
                  className={`flex flex-col items-center p-2.5 rounded-lg border transition-all cursor-pointer ${
                    theme === 'light'
                      ? isDark
                        ? 'border-[#4C9FE8] bg-[#31475D]'
                        : 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
                      : isDark
                      ? 'border-[#383D44] bg-[#292D33] hover:border-[#4B525C]'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="w-full h-16 rounded bg-[#EEF2F6] border border-slate-300/60 mb-2" />
                  <span className={`text-[11px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    Light
                  </span>
                </button>

                {/* Dark Option */}
                <button
                  type="button"
                  onClick={() => dispatch(setTheme('dark'))}
                  className={`flex flex-col items-center p-2.5 rounded-lg border transition-all cursor-pointer ${
                    theme === 'dark'
                      ? isDark
                        ? 'border-[#4C9FE8] bg-[#31475D]'
                        : 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
                      : isDark
                      ? 'border-[#383D44] bg-[#292D33] hover:border-[#4B525C]'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="w-full h-16 rounded bg-[#22262B] border border-[#383D44] mb-2" />
                  <span className={`text-[11px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    Dark
                  </span>
                </button>

                {/* Default / System Option */}
                <button
                  type="button"
                  onClick={() => {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    dispatch(setTheme(prefersDark ? 'dark' : 'light'));
                  }}
                  className={`flex flex-col items-center p-2.5 rounded-lg border transition-all cursor-pointer ${
                    isDark
                      ? 'border-[#383D44] bg-[#292D33] hover:border-[#4B525C]'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="w-full h-16 rounded overflow-hidden border border-[#383D44] flex mb-2">
                    <div className="w-1/2 h-full bg-[#EEF2F6]" />
                    <div className="w-1/2 h-full bg-[#22262B]" />
                  </div>
                  <span className={`text-[11px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    Default
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Notifications */}
          <div
            className={`rounded-xl border overflow-hidden transition-all flex flex-col ${
              isDark
                ? 'bg-[#292D33] border-[#383D44]'
                : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div
              className={`px-4 py-2.5 border-b ${
                isDark ? 'bg-[#353A42] border-[#3E434C]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <h2 className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                Notifications
              </h2>
            </div>

            <div className="p-4 flex flex-col gap-3">
              {/* FOD Alerts Switch */}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>FOD alerts</span>
                <button
                  type="button"
                  onClick={() => updateSetting('fodAlerts', !settings.fodAlerts)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
                    settings.fodAlerts ? 'bg-[#00B957]' : isDark ? 'bg-[#454B53]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out translate-y-0.5 ${
                      settings.fodAlerts ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Vehicle Disconnect Alerts */}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  Vehicle disconnect alerts
                </span>
                <button
                  type="button"
                  onClick={() => updateSetting('disconnectAlerts', !settings.disconnectAlerts)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
                    settings.disconnectAlerts ? 'bg-[#00B957]' : isDark ? 'bg-[#454B53]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out translate-y-0.5 ${
                      settings.disconnectAlerts ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Overspeed Alerts */}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Overspeed alerts</span>
                <button
                  type="button"
                  onClick={() => updateSetting('overspeedAlerts', !settings.overspeedAlerts)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
                    settings.overspeedAlerts ? 'bg-[#00B957]' : isDark ? 'bg-[#454B53]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out translate-y-0.5 ${
                      settings.overspeedAlerts ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Mission Sync Complete */}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Mission sync complete</span>
                <button
                  type="button"
                  onClick={() => updateSetting('syncComplete', !settings.syncComplete)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
                    settings.syncComplete ? 'bg-[#00B957]' : isDark ? 'bg-[#454B53]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out translate-y-0.5 ${
                      settings.syncComplete ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Alert Display Dropdown */}
              <div className="flex items-center justify-between pt-1">
                <span className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Alert display</span>
                <select
                  value={settings.alertDisplay}
                  onChange={(e) => updateSetting('alertDisplay', e.target.value)}
                  className={`w-40 px-3 py-1.5 rounded-lg text-xs font-medium border outline-none cursor-pointer transition ${
                    isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-100 focus:border-[#4C9FE8]'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                  }`}
                >
                  <option value="Popup + list">Popup + list</option>
                  <option value="Popup only">Popup only</option>
                  <option value="List only">List only</option>
                  <option value="Banner">Banner</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 3: Sound */}
          <div
            className={`rounded-xl border overflow-hidden transition-all flex flex-col ${
              isDark
                ? 'bg-[#292D33] border-[#383D44]'
                : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div
              className={`px-4 py-2.5 border-b ${
                isDark ? 'bg-[#353A42] border-[#3E434C]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <h2 className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                Sound
              </h2>
            </div>

            <div className="p-4 flex flex-col gap-4">
              {/* Sound Enabled */}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Sound enabled</span>
                <button
                  type="button"
                  onClick={() => updateSetting('soundEnabled', !settings.soundEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
                    settings.soundEnabled ? 'bg-[#00B957]' : isDark ? 'bg-[#454B53]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out translate-y-0.5 ${
                      settings.soundEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Master Volume Slider */}
              <div className="flex items-center gap-3">
                <span className={`text-xs shrink-0 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  Master volume
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.masterVolume}
                  disabled={!settings.soundEnabled}
                  onChange={(e) => updateSetting('masterVolume', parseInt(e.target.value))}
                  className={`flex-1 accent-[#4C9FE8] h-1.5 rounded-lg cursor-pointer disabled:opacity-40 ${
                    isDark ? 'bg-[#454B53]' : 'bg-slate-200'
                  }`}
                />
                <span className={`text-xs font-medium w-8 text-right ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  {settings.masterVolume}%
                </span>
              </div>

              {/* Alert Tone & Test Sound Button */}
              <div className="flex items-center gap-3">
                <span className={`text-xs shrink-0 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Alert tone</span>
                <select
                  value={settings.alertTone}
                  onChange={(e) => updateSetting('alertTone', e.target.value)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border outline-none cursor-pointer transition ${
                    isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-100 focus:border-[#4C9FE8]'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                  }`}
                >
                  <option value="Chime">Chime</option>
                  <option value="Beep">Beep</option>
                  <option value="Siren">Siren</option>
                  <option value="Bell">Bell</option>
                </select>

                <button
                  type="button"
                  onClick={playTestSound}
                  className="px-3.5 py-1.5 rounded-lg bg-[#4C9FE8] hover:bg-[#4997db] text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer shrink-0"
                >
                  Test sound
                </button>
              </div>
            </div>
          </div>

          {/* Card 4: Language & Date */}
          <div
            className={`rounded-xl border overflow-hidden transition-all flex flex-col ${
              isDark
                ? 'bg-[#292D33] border-[#383D44]'
                : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div
              className={`px-4 py-2.5 border-b ${
                isDark ? 'bg-[#353A42] border-[#3E434C]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <h2 className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                Language
              </h2>
            </div>

            <div className="p-4 flex flex-col gap-3.5">
              {/* Language Selector */}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Language</span>
                <select
                  value={lang}
                  onChange={(e) => dispatch(setLanguage(e.target.value))}
                  className={`w-44 px-3 py-1.5 rounded-lg text-xs font-medium border outline-none cursor-pointer transition ${
                    isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-100 focus:border-[#4C9FE8]'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                  }`}
                >
                  <option value="en">English (US)</option>
                  <option value="en-gb">English (UK)</option>
                  <option value="hindi">Hindi (हिन्दी)</option>
                  <option value="fr">French (Français)</option>
                  <option value="de">German (Deutsch)</option>
                </select>
              </div>

              {/* Date Format */}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Date format</span>
                <select
                  value={settings.dateFormat}
                  onChange={(e) => updateSetting('dateFormat', e.target.value)}
                  className={`w-44 px-3 py-1.5 rounded-lg text-xs font-medium border outline-none cursor-pointer transition ${
                    isDark
                      ? 'bg-[#353A42] border-[#454B53] text-slate-100 focus:border-[#4C9FE8]'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                  }`}
                >
                  <option value="DD MMM YYYY">DD MMM YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                </select>
              </div>

              {/* Time Format */}
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Time format</span>
                <div className={`flex rounded-lg overflow-hidden border ${isDark ? 'bg-[#353A42] border-[#454B53]' : 'bg-slate-100 border-slate-300'}`}>
                  <button
                    type="button"
                    onClick={() => updateSetting('timeFormat', '12h')}
                    className={`px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                      settings.timeFormat === '12h'
                        ? 'bg-[#4C9FE8] text-white'
                        : isDark
                        ? 'text-slate-300 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    12h
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('timeFormat', '24h')}
                    className={`px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                      settings.timeFormat === '24h'
                        ? 'bg-[#4C9FE8] text-white'
                        : isDark
                        ? 'text-slate-300 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    24h
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="pt-3 mt-auto flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleReset}
          className={`px-4 py-2 rounded-lg text-xs font-medium border transition active:scale-95 cursor-pointer ${
            isDark
              ? 'bg-[#353A42] border-[#454B53] hover:bg-[#41464E] text-slate-200'
              : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
          }`}
        >
          Reset to defaults
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-[#4C9FE8] hover:bg-[#4997db] text-white text-xs font-semibold shadow-xs active:scale-95 transition cursor-pointer"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
