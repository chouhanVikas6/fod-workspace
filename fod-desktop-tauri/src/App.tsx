import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "@/store/index";
import { ThemeProvider } from "@/components/theme/themeProvider";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Global from "@/components/global/global";
import ThemeApplier from "@/components/theme/themeApplier";
import PrivateRoute from "@/components/private-route";
import MotionTransition from "@/components/transition/motion";
import SplashScreen from "@/components/splash-screen/splashScreen";
import Login from "@/pages/login";
import MissionControl from "@/pages/dashboard";

export default function App() {
  const [showScreen, setShowScreen] = useState(true);

  useEffect(() => {
    // Mimic the splash screen load timeout
    const timer = setTimeout(() => {
      setShowScreen(false);
    }, 1500);

    // Prevent pinch zoom and right click (similar to _app.tsx)
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && (event.key === '+' || event.key === '-' || event.key === '0')) {
        event.preventDefault();
      }
    };
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  if (showScreen) {
    return <SplashScreen />;
  }

  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <ThemeProvider>
          <ThemeApplier />
          <Global>
            <MotionTransition>
              <HashRouter>
                <Routes>
                  {/* Public route */}
                  <Route path="/login" element={<Login />} />

                  {/* Private route */}
                  <Route 
                    path="/dashboard" 
                    element={
                      <PrivateRoute authenticated={true}>
                        <MissionControl />
                      </PrivateRoute>
                    } 
                  />

                  {/* Fallback routing */}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </HashRouter>
            </MotionTransition>
          </Global>
          <ToastContainer autoClose={2000} />
        </ThemeProvider>
      </PersistGate>
    </Provider>
  );
}
