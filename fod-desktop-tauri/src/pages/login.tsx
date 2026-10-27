import React, { useEffect, useState } from 'react';
import axiosClient from '@/utils/axios';
import { Auth } from '@/utils/auth';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@/hooks/useTranslations';
import Zoid_logo from '@/assets/images/zoid_logo.png';
import { toast } from 'react-toastify';
import {
  HiUser,
  HiLockClosed,
  HiEye,
  HiEyeSlash,
  HiArrowRight,
  HiShieldCheck,
  HiViewfinderCircle,
  HiCpuChip,
  HiSignal,
  HiQuestionMarkCircle,
  HiExclamationCircle,
} from 'react-icons/hi2';

export default function Login() {
  const t = useTranslations('common');
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Live station clock
  const [currentTime, setCurrentTime] = useState(() => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Restore remembered username on load
  useEffect(() => {
    const savedUser = localStorage.getItem('ZOID_REMEMBERED_USERNAME');
    if (savedUser) {
      setUsername(savedUser);
      setRememberMe(true);
    }
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (Auth.isAuthenticated()) {
      navigate('/dashboard');
    }
  }, [navigate, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await axiosClient({
        method: 'GET',
        url: `/api/auth/login?userName=${encodeURIComponent(username.trim())}&password=${encodeURIComponent(password)}`,
      });

      if (rememberMe) {
        localStorage.setItem('ZOID_REMEMBERED_USERNAME', username.trim());
      } else {
        localStorage.removeItem('ZOID_REMEMBERED_USERNAME');
      }

      await Auth.login(res.data.token, res.data.user);
      setToken(res.data.token);
      toast.success('Authentication successful');
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Invalid username or password';
      setErrorMessage(message);
      toast.error('Invalid ID or Password');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex flex-col justify-between overflow-x-hidden bg-slate-50 text-slate-800 select-none">
      {/* Ambient background decoration with subtle tech grid and soft glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Subtle aeronautical grid */}
        <div
          className="absolute inset-0 opacity-[0.45]"
          style={{
            backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Ambient color orbs */}
        <div className="absolute -top-32 -right-32 w-[520px] h-[520px] bg-blue-400/15 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-32 w-[480px] h-[480px] bg-indigo-400/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 right-1/4 w-[420px] h-[420px] bg-sky-300/20 rounded-full blur-3xl" />
      </div>

      {/* Top Telemetry & Brand Bar */}
      <header className="relative z-20 w-full px-6 py-4 flex items-center justify-between border-b border-slate-200/80 bg-white/80 backdrop-blur-md shadow-xs">
        {/* Brand identity */}
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center justify-center p-1 rounded-xl bg-white shadow-xs border border-slate-200/60">
            <img src={Zoid_logo} alt="Zoid Technologies" className="w-8 h-8 object-contain" />
          </div>
          <div className="flex items-center space-x-2.5">
            <span className="font-extrabold text-xl tracking-wider text-slate-900 font-sans">ZOID</span>

          </div>
        </div>

        {/* Live System Status & Telemetry */}
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-500 font-mono px-2 py-1 rounded bg-slate-100/60 border border-slate-200/60">
            <HiSignal className="w-3.5 h-3.5 text-blue-600" />
            <span>{currentTime}</span>
          </div>
        </div>
      </header>

      {/* Main Center Area with Aerospace Mission Split Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
        {/* <div className="w-full max-w-4xl bg-white/95 backdrop-blur-xl rounded-3xl border border-slate-200/90 shadow-2xl shadow-slate-900/10 overflow-hidden grid grid-cols-1 lg:grid-cols-12 transition-all"> */}
          
      

          {/* Right Column: Operator Sign-In Form (7 cols) */}
          <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-between bg-white/95">
            <div>
              {/* Form Header */}
              <div className="mb-8">
                <span className="text-xs font-bold text-blue-600 tracking-widest uppercase">
                  Operator Access
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                  Sign In to Terminal
                </h1>
                <p className="text-slate-500 text-sm mt-1.5">
                  Enter your credentials to access mission control and active operations.
                </p>
              </div>

              {/* Error Message Box */}
              {errorMessage && (
                <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start space-x-3 text-sm animate-fadeIn">
                  <HiExclamationCircle className="w-5 h-5 flex-shrink-0 text-rose-500 mt-0.5" />
                  <div className="flex-1 font-medium">{errorMessage}</div>
                  <button
                    type="button"
                    onClick={() => setErrorMessage('')}
                    className="text-rose-400 hover:text-rose-600 text-xs font-bold ml-2"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Authentication Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Username Input */}
                <div>
                  <label htmlFor="username" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    {t('username') || 'Operator ID / Username'}
                  </label>
                  <div className="relative rounded-xl shadow-xs">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <HiUser className="w-5 h-5" />
                    </div>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. operator_admin"
                      required
                      autoComplete="username"
                      disabled={isLoading}
                      className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    {t('password') || 'Security Password'}
                  </label>
                  <div className="relative rounded-xl shadow-xs">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <HiLockClosed className="w-5 h-5" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      autoComplete="current-password"
                      disabled={isLoading}
                      className="block w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                    >
                      {showPassword ? <HiEyeSlash className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Help Row */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={isLoading}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 focus:ring-2 cursor-pointer transition-colors"
                    />
                    <span className="text-xs font-medium text-slate-600 select-none">Remember Operator</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowHelpModal(true)}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <HiQuestionMarkCircle className="w-4 h-4" />
                    <span>Need Help?</span>
                  </button>
                </div>

                {/* Submit Sign-In Button */}
                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-600 hover:from-blue-700 hover:via-blue-800 hover:to-indigo-700 active:scale-[0.99] transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/35 flex items-center justify-center space-x-2 group cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Authenticating Operator...</span>
                      </>
                    ) : (
                      <>
                        <span>{t('sign-in') || 'Sign In to Mission Control'}</span>
                        <HiArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Bottom Security Assurance */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center space-x-2 text-xs text-slate-400">
              <HiShieldCheck className="w-4 h-4 text-slate-400" />
              <span>Encrypted Ground Terminal Session</span>
            </div>
          </div>

        {/* </div> */}
      </main>

      {/* Footer Bar */}
      <footer className="relative z-20 w-full px-8 py-3.5 flex flex-wrap items-center justify-between text-xs text-slate-500 border-t border-slate-200/70 bg-white/60 backdrop-blur-md">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-700">ZOID TECHNOLOGIES</span>

        </div>
      </footer>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <HiQuestionMarkCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Operator Account Assistance</h3>
                <p className="text-xs text-slate-500">Airfield Mission Control Credentials</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              {t('ask-admin-register') ||
                'Access accounts and permissions are managed by the Airport Airside Operations Administrator.'}
            </p>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1.5 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-400">Administrator Contact:</span>
                <span className="font-mono font-medium text-slate-700">airside-admin@zoid.aero</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Dispatch Desk:</span>
                <span className="font-mono font-medium text-slate-700">Ext 4402 (Airfield Ops)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

