import OperationSideBar from "@/components/OperationSideBar/OperationSideBar";
import FodCategoryAndDetail from "@/components/fodCategoryAndDetail/fodCategoryAndDetail";
import ClearedFodDetailView from "@/components/fodPanel/clearedFodDetailedView";
import DetailedView from "@/components/fodPanel/fodDetailedView";
import FodPanel from "@/components/fodPanel/fodPanel";
import Header from "@/components/layout/header/header";
import Map from "@/components/map/map";
import MissionSelector from "@/components/mission/missionSelecter";
import FodFinalReview from "@/components/webcam/fodFinalReview";
import WebCam from "@/components/webcam/webcam";
import useSocket from "@/hooks/useWebSocket";
import { RootState } from "@/store";
import {  useState } from "react";
import { useSelector } from "react-redux";
//@ts-ignore
import Setting from "@/components/setting/setting";
import ErrorBoundary from "@/components/commen/ErrorBoundary";

const MissionControl = () => {
    // Real-time channel to the internal GUI socket server (fod alerts,
    // fodGroup status updates, mission terminate, health broadcasts).
    useSocket();
    const [tab, setTab] = useState('dashboard')
    const missionState = useSelector((store: RootState) => store.MissionState);
    const webCamState = useSelector((store: RootState) => store.WebCam);
    const isSidebarVisible = useSelector((store: RootState) => store.SelectedFod.isSidebarVisible);
    const isOpen = useSelector((store: RootState) => store.FodDetailedView.isOpen);
    const isMapOpen = useSelector((store: RootState) => store.MapReducer.isMapOpen);
    const isDark = useSelector((store: RootState) => store.theme.theme === 'dark');
    const { width, background } = {
        width: 96,
        background: isDark ? "#22262B" : "#F8F8F8",
    }
    const { isWebCamOpen, isFodFinalReviewOpen } = webCamState;
    const handleTab = (name:string) => {
        if (tab == name) { setTab('dashboard') } else { setTab(name) }
    }
    console.log("Spinning Dashboard")
    return (
        <div className={`relative h-full w-full overflow-hidden transition-colors duration-200 ${isDark ? 'bg-[#22262B]' : 'bg-white'}`}>
            {
                !!(missionState?.missionNumber) ?
                    <>
                        {/* Clear-FOD photo capture: mounts only while open so the
                            camera is acquired on open and released on close. */}
                        {isWebCamOpen && (
                            <div className="absolute inset-0 z-[999] h-full w-full">
                                <WebCam />
                            </div>
                        )}
                        <div className='w-[100%] h-[8%] relative z-50' >
                            <Header />
                        </div>
                        <div className='flex relative h-[92%] z-0' style={{ background }}>
                            <OperationSideBar tab={tab} setTab={handleTab} />
                            <div className='h-full flex-1 min-w-0 relative overflow-hidden'>
                                <ErrorBoundary name="FOD Panel">
                                    <FodPanel open={tab == 'dashboard'} />
                                </ErrorBoundary>
                                <Setting open={tab == 'setting'} />
                                {isMapOpen && (
                                    <ErrorBoundary name="Map">
                                        <Map />
                                    </ErrorBoundary>
                                )}
                            </div>
                           
                            {isFodFinalReviewOpen ? <FodFinalReview />:<></>}
                            <ClearedFodDetailView />
                            {isOpen ? <DetailedView /> : <></>}
                            <FodCategoryAndDetail />
                        </div>
                    </>
                    :
                    <>
                        <div className='w-[100%] h-[8%] relative z-50' >
                            <Header />
                        </div>
                        {/* h-[92%] wrapper: MissionSelector is h-full, so without
                            this it overflows the viewport by the header's 8% and
                            its bottom edge (incl. footer buttons) gets clipped. */}
                        <div className='h-[92%] relative z-0'>
                            <ErrorBoundary name="Mission Selector">
                                <MissionSelector />
                            </ErrorBoundary>
                        </div>
                    </>

            }
        </div>
    )
}
MissionControl.authenticate = true;
export default MissionControl;

