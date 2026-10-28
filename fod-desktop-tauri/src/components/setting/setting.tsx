import React, { useState } from "react";
import axiosClient from "@/utils/axios";
import { useSelector } from "react-redux";
import VideoComponent from "../camera-feed/video-feed";
import BottomNavigation from "../commen/bottom.navigation";
import CamPlay from "../commen/camera-play";
import CamPause from "../commen/camera-pause";
import { config } from "@/config/clientConfig";
import General from "./general";
import Bite from "./bite";
import Profile from "./profile";
import UserManagement from "./userManagement";
import { RootState } from "@/store";

const Setting = ({ open }) => {
    const [selectedCam, setSelectedCam] = useState(1);
    const [selectedAll, setSelectedAll] = useState(false);
    const [selectedCams, setSelectedCams] = useState<Set<number>>(new Set());
    const [selectedTab, setSelectedTab] = useState('video');
    const isMapOpen = useSelector((store: RootState) => store.MapReducer.isMapOpen);
    const currentLocation = useSelector((store: RootState) => store.SystemHealth.RtkData);
    const missionNumber = useSelector((store: RootState) => store.MissionState.missionNumber);
    const giveMeCameraName = (id: number) => {
        let result = null;
        Object.keys(config.cameraMap).forEach((name) => {
            if (config.cameraMap[name] == id) {
                result = name;
            }
        })
        return result;
    }
    const pushCamInSet = (camId: number) => {
        if (selectedCams.has(camId)) {
            setSelectedCams((prevSet) => {
                const newSet = new Set(prevSet);
                newSet.delete(camId);
                return newSet;
            });
        } else {
            setSelectedCams((prevSet) => new Set(prevSet).add(camId));
        }
    }

    const triggeredCommands = (type: string) => {
        const data = {
            type,
            missionId: missionNumber,
            camList: selectedAll ?
                Object.keys(config.cameraMap).map((cam) => cam.split("_").join(''))
                :
                Array.from(selectedCams).map((id: number) => {
                    let name = giveMeCameraName(id);
                    if (!!name) {
                        name = name.split("_").join('')
                    }
                    return name;
                })
        }
        axiosClient({
            method: "POST",
            url: '/api/command',
            data,
        })
    }
    return (
        <div className={`relative h-full w-full flex justify-center p-2 border z-19 ${isMapOpen || !open ? "hidden" : ""}`} >
            {selectedTab == 'video' && <div className="relative h-full w-full flex flex-col space-y-3">
                <VideoComponent  {...{ currentLocation, selectedCam }} />
                <div className="flex justify-around mx-3">
                    {Array.from({ length: 26 }).map((camera, idx) => (
                        <button
                            key={idx + 1}
                            onClick={() => setSelectedCam(idx + 1)}
                            className={`flex items-center justify-center w-8 h-8  text-white rounded-lg shadow-md  transition-colors active:bg-blue-500  ${selectedCam == (idx + 1) ? "bg-blue-500 hover:bg-blue-400" : "bg-gray-500 hover:bg-gray-400"}`}
                        >
                            <p className="text-lg font-semibold">{idx + 1}</p>
                        </button>
                    ))}

                    {/* No handleClick override -> buttons control the single selected camera feed */}
                    <CamPlay  {...{ selectedCam }} />
                    <CamPause {...{ selectedCam }} />
                </div>

            </div>}
            {
                selectedTab == 'setting' && <div className="relative w-full h-[80vh] bg-gray-100">
                    <div className="absolute w-full bottom-0 flex justify-around mx-3 p-3 overflow-x-auto overflow-y-hidden">
                        {Array.from({ length: 26 }).map((camera, idx) => (
                            <button
                                key={idx + 1}
                                onClick={() => pushCamInSet(idx + 1)}
                                className={`flex items-center justify-center w-8 h-8  text-white rounded-lg shadow-md  transition-colors active:bg-blue-500  ${selectedCams.has(idx + 1) || selectedAll ? "bg-blue-500 hover:bg-blue-400" : "bg-gray-500 hover:bg-gray-400"}`}
                            >
                                <p className="text-lg font-semibold">{idx + 1}</p>
                            </button>
                        ))}


                    </div>
                    <div className="absolute bottom-16 right-3 flex space-x-5">
                        <div className="flex items-center px-2 border border-white rounded dark:border-gray-700">
                            <input id="bordered-checkbox-2" type="checkbox" value="" name="bordered-checkbox" className="w-12 h-12 text-gray-600 bg-gray-100 border-gray-300 rounded focus:ring-gray-500 " checked={selectedAll} onChange={() => setSelectedAll(!selectedAll)} />
                            <label htmlFor="bordered-checkbox-2" className="w-full py-4 ms-2  font-medium text-gray-900">Select All</label>
                        </div>
                        <CamPlay  {...{selectedCam, handleClick: () => triggeredCommands("start") }} />
                        <CamPause {...{selectedCam, handleClick: () => triggeredCommands("terminate") }} />
                    </div>
                    <div></div>
                    <div></div>
                    <div></div>

                </div>
            }

            {
                selectedTab == 'general' && <div className="relative w-full h-[80vh] bg-gray-100">
                    <General />
                </div>
            }

            {
                selectedTab == 'bite' && <Bite />
            }

            {
                selectedTab == 'profile' && <Profile onManageUsers={() => setSelectedTab('users')} />
            }

            {
                selectedTab == 'users' && <UserManagement />
            }

            <BottomNavigation  {...{ selectedTab, setSelectedTab }} />
        </div>
    )
}

export default Setting;
