import React, { useEffect, useState } from 'react';
import axiosClient from '@/utils/axios';
import {Auth} from '@/utils/auth';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@/hooks/useTranslations';
import Zoid_logo from "@/assets/images/zoid_logo.png";
import { toast } from 'react-toastify';

export default function Login() {
  const t = useTranslations('common');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    axiosClient({
      method: "GET",
      url: `/api/auth/login?userName=${username}&password=${password}`,
    }).then((res) => {
      Auth.login(res.data.token);
      setToken(res.data.token);
    }).catch(err => {
      toast.error("Invalid Id Password")
      console.log(err.messages)
    });

  };

  useEffect(() => {
    console.log({isAuthenticated:Auth.isAuthenticated()})
    if (Auth.isAuthenticated()) {
      navigate('/dashboard');
    }
  }, [navigate, token]);

  return (
    <>
    <div className="fixed top-5 left-6 flex items-center">
        <img src={Zoid_logo} alt="Zoid Technologies" className="mr-3 object-cover w-[40px] h-[40px]" />
        <p className="text-[#4c4c4c] font-normal text-[23px] font-[Arial, Helvetica, sans-serif]">ZOID</p>
      </div>
      <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-white border border-gray-200 rounded-lg shadow">
      
        <div className="w-full max-w-sm p-6 m-auto py-16 bg-white border border-gray-200 rounded-lg shadow">
          <div className="flex justify-around mx-auto text-2xl font-bold ">
            Sign in
          </div>

          <form className="mt-6" onSubmit={handleSubmit}>
            <div className="relative mb-8">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                id="username"
                className={`w-full rounded px-3 border border-gray-400 py-3 focus:border-blue-700 focus:ring-1 focus:ring-blue-700 focus:outline-none input ${username ? 'filled' : ''}`}
                type="text"
              />
              <label
                htmlFor="username"
                className={`label absolute top-2 left-3 leading-tighter text-gray-600 text-base cursor-text ${username ? 'filled-label' : ''}`}
              >
                Username
              </label>
            </div>

            <div className="relative mb-8">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                id="password"
                className={`w-full rounded px-3 border border-gray-400 py-3 focus:border-blue-700 focus:ring-1 focus:ring-blue-700 focus:outline-none input ${password ? 'filled' : ''}`}
              />
              <label
                htmlFor="password"
                className={`label absolute top-2 left-3 leading-tighter text-gray-600 text-base cursor-text ${password ? 'filled-label' : ''}`}
              >
                Password
              </label>
            </div>

            {/* <div className="mt-4 flex items-center">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 bg-gray-100 border-gray-300 rounded text-gray-500"
              />
              <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-800">
                Remember Me
              </label>
            </div> */}

            <div className="mt-6">
              <button
                type="submit"
                className="w-full px-6 py-2.5 text-sm font-medium tracking-wide text-white capitalize transition-colors duration-300 transform bg-[#0c63e8] hover:bg-[#0c63e8] active:bg-[#0c63e8] focus:outline-none focus:ring focus:ring-blue-300 focus:ring-opacity-50"
              >
                {t("sign-in")}
              </button>


            </div>
          </form>
        </div>
      </main>

      <style>{`
        .input {
          transition: border 0.2s ease-in-out;
          min-width: 280px;
        }

        .input:focus + .label {
          font-size: 0.75rem;
          transition: all 0.2s ease-out;
          top: -0.9rem;
          background-color: #fff;
          color: #1a73e8; /* Blue color when focused */
          padding: 0 5px;
          margin: 0 5px;
        }

        .input.filled + .label {
          font-size: 0.75rem;
          top: -0.9rem;
          background-color: #fff;
          padding: 0 5px;
          margin: 0 5px;
        }

        .input.filled:not(:focus) + .label {
          color: #9ca3af; /* Gray color when not focused and filled */
        }

        .label {
          transition: all 0.2s ease-out;
          top: 0.75rem;
          left: 0.75rem;
          color: #9ca3af; /* Gray color when not focused */
        }
      `}</style>
    </>
  );
}
