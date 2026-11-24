import OperationSideBar from "@/components/OperationSideBar/OperationSideBar";
import FodCategoryAndDetail from "@/components/fodCategoryAndDetail/fodCategoryAndDetail";
import ClearedFodDetailView from "@/components/fodPanel/clearedFodDetailedView";
import DetailedView from "@/components/fodPanel/fodDetailedView";
import FodPanel, { useMissionFodSync } from "@/components/fodPanel/fodPanel";
import Header from "@/components/layout/header/header";
import Map from "@/components/map/map";
import MissionSelector from "@/components/mission/missionSelecter";
import FodFinalReview from "@/components/webcam/fodFinalReview";
import WebCam from "@/components/webcam/webcam";
import useSocket from "@/hooks/useWebSocket";
import { RootState } from "@/store";
import { reset_ClearedDetailedViewFod } from "@/store/slices/clearedFodDetailView-slice";
import { reset_DetailedViewFod } from "@/store/slices/fodDetailesView-slice";
import { reset_MapState } from "@/store/slices/mapReducer-slice";
import { reset_SelectedFod } from "@/store/slices/selectedFod-slice";
import { resetSideBarLists } from "@/store/slices/webCam-slice";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AnimatePresence, motion } from "framer-motion";
import HomeDashboard from "@/components/homeDashboard";
import MissionReport from "@/components/mission/missionReport";
//@ts-ignore
import Setting from "@/components/setting/setting";
import ErrorBoundary from "@/components/commen/ErrorBoundary";
import { Auth } from "@/utils/auth";

const MissionControl = () => {
  // Real-time channel to the internal GUI socket server (fod alerts,
  // fodGroup status updates, mission terminate, health broadcasts).
  useSocket();
  const dispatch = useDispatch();
  const [tab, setTab] = useState("dashboard");
  const [userRole, setUserRole] = useState<string>(() =>
    String(Auth.getCurrentUser()?.role ?? "").toUpperCase()
  );
  const isCollectorOrOperator =
    userRole === "COLLECTOR" || userRole === "OPERATOR";

  useEffect(() => {
    let mounted = true;
    Auth.fetchCurrentUser()
      .then((u) => {
        if (mounted && u?.role) {
          setUserRole(String(u.role).toUpperCase());
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isCollectorOrOperator && (tab === "home" || tab === "reports")) {
      setTab("dashboard");
    }
  }, [isCollectorOrOperator, tab]);
  const missionState = useSelector((store: RootState) => store.MissionState);
  useMissionFodSync(missionState?.missionNumber);

  // Reset UI panels, drawers, modals, and active tab to defaults whenever a mission opens or changes.
  useEffect(() => {
    setTab("dashboard");
    dispatch(reset_SelectedFod());
    dispatch(reset_DetailedViewFod());
    dispatch(reset_ClearedDetailedViewFod());
    dispatch(resetSideBarLists());
    dispatch(reset_MapState());
  }, [missionState?.missionNumber, dispatch]);
  const webCamState = useSelector((store: RootState) => store.WebCam);
  const isSidebarVisible = useSelector(
    (store: RootState) => store.SelectedFod.isSidebarVisible,
  );
  const isOpen = useSelector(
    (store: RootState) => store.FodDetailedView.isOpen,
  );
  const isMapOpen = useSelector(
    (store: RootState) => store.MapReducer.isMapOpen,
  );
  const isDark = useSelector(
    (store: RootState) => store.theme.theme === "dark",
  );
  const { width, background } = {
    width: 96,
    background: isDark ? "#22262B" : "#F8F8F8",
  };
  const { isWebCamOpen, isFodFinalReviewOpen } = webCamState;
  const handleTab = (name: string) => {
    if (isCollectorOrOperator && (name === "home" || name === "reports")) {
      return;
    }
    if (isMapOpen) {
      setTab(name);
      return;
    }
    if (tab == name) {
      setTab("dashboard");
    } else {
      setTab(name);
    }
  };
  console.log("Spinning Dashboard");
  const exitTransition = missionState?.exitTransition;
  const exitMissionLabel =
    exitTransition?.displayId ?? exitTransition?.missionNumber
      ? ` #${exitTransition.displayId ?? exitTransition.missionNumber}`
      : "";

  return (
    <div
      className={`relative h-full w-full overflow-hidden transition-colors duration-200 ${isDark ? "bg-[#22262B]" : "bg-white"}`}
    >
      <AnimatePresence>
        {exitTransition?.active && (
          <motion.div
            key="mission-exit-transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`fixed inset-0 z-[1000] flex items-center justify-center backdrop-blur-sm select-none ${
              isDark ? "bg-[#22262B]/95" : "bg-[#F8F8F8]/95"
            }`}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -4 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`w-[360px] max-w-[90vw] rounded-2xl border p-7 shadow-xl text-center ${
                isDark
                  ? "bg-[#292D33] border-[#383D44] text-white"
                  : "bg-white border-slate-200 text-slate-900"
              }`}
            >
              <div
                className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${
                  isDark ? "bg-[#4C9FE8]/15 text-[#4C9FE8]" : "bg-[#4C9FE8]/10 text-[#4C9FE8]"
                }`}
              >
                <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeOpacity="0.22"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M12 3a9 9 0 0 1 9 9"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <h2 className="text-base font-bold tracking-tight">
                Terminating Mission{exitMissionLabel}
              </h2>

              <p
                className={`mt-1.5 text-xs ${
                  isDark ? "text-[#9EA4B0]" : "text-slate-500"
                }`}
              >
                Returning to Mission Selector...
              </p>

              <div
                className={`mt-5 h-1.5 w-full overflow-hidden rounded-full ${
                  isDark ? "bg-[#1E2228]" : "bg-slate-200"
                }`}
              >
                <motion.div
                  initial={{ width: "15%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1.15, ease: "easeInOut" }}
                  className="h-full rounded-full bg-[#4C9FE8]"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {!!missionState?.missionNumber ? (
        <>
          {/* Clear-FOD photo capture: mounts only while open so the
                            camera is acquired on open and released on close. */}
          {isWebCamOpen && (
            <div className="absolute inset-0 z-[999] h-full w-full">
              <WebCam />
            </div>
          )}
          <div className="w-[100%] h-[8%] relative z-50">
            <Header />
          </div>
          <div className="flex relative h-[92%] z-0" style={{ background }}>
            <OperationSideBar tab={tab} setTab={handleTab} />

            <div className="h-full flex-1 min-w-0 relative overflow-hidden">
              {/* Active non-map tab layer */}
              <div
                className={`relative h-full w-full transition-opacity duration-200 ${
                  isMapOpen
                    ? "z-0 opacity-0 pointer-events-none invisible"
                    : "z-10 opacity-100 pointer-events-auto visible"
                }`}
              >
                {tab === "home" && !isMapOpen && (
                  <div key="tab-home" className="h-full w-full zoid-fade-slide">
                    <ErrorBoundary name="Home Dashboard">
                      <HomeDashboard />
                    </ErrorBoundary>
                  </div>
                )}

                {tab === "dashboard" && (
                  <div key="tab-dashboard" className="h-full w-full zoid-fade-slide">
                    <ErrorBoundary name="FOD Panel">
                      <FodPanel open={true} />
                    </ErrorBoundary>
                  </div>
                )}

                {tab === "reports" && !isMapOpen && (
                  <div key="tab-reports" className="h-full w-full zoid-fade-slide">
                    <ErrorBoundary name="Mission Reports">
                      <MissionReport />
                    </ErrorBoundary>
                  </div>
                )}

                <Setting open={tab === "setting"} />
              </div>

              {/* Persistent Map layer kept mounted in background */}
              <div
                aria-hidden={!isMapOpen}
                className={`absolute inset-0 h-full w-full transition-opacity duration-200 ${
                  isMapOpen
                    ? "z-20 opacity-100 pointer-events-auto visible"
                    : "z-0 opacity-0 pointer-events-none invisible"
                }`}
              >
                <ErrorBoundary name="Map" key={missionState.missionNumber}>
                  <Map />
                </ErrorBoundary>
              </div>
            </div>

            {isFodFinalReviewOpen ? <FodFinalReview /> : <></>}
            <ClearedFodDetailView />
            {isOpen ? <DetailedView /> : <></>}
            {(tab === "dashboard" || isMapOpen) && (
              <FodCategoryAndDetail key={missionState.missionNumber} />
            )}
          </div>
        </>
      ) : (
        <>
          <div className="w-[100%] h-[8%] relative z-50">
            <Header />
          </div>
          {/* h-[92%] wrapper: MissionSelector is h-full, so without
                            this it overflows the viewport by the header's 8% and
                            its bottom edge (incl. footer buttons) gets clipped. */}
          <div className="h-[92%] relative z-0">
            <ErrorBoundary name="Mission Selector">
              <MissionSelector />
            </ErrorBoundary>
          </div>
        </>
      )}
    </div>
  );
};
MissionControl.authenticate = true;
export default MissionControl;
