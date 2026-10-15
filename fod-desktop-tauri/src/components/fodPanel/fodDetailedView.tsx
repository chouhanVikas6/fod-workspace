import React, { useRef, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RxCross1 } from "react-icons/rx";
import { PiCheckBold } from "react-icons/pi";
import { Fod_FodId } from "@/utils/FodParser";
import leftArrowImg from "@/assets/images/svg/left-arrow.svg";
import rightArowImg from "@/assets/images/svg/right-arrow.svg";
const OperationSideBarStyle = {
    width: 6,
    background: '#FCFCFC',
    borderColor: '#DDDDE7'
}
const FodPanelStyle = {
    width: 100 - (OperationSideBarStyle.width || 0),
    background: "#F8F8F8",
}
import { FiltersCheck, sortByFilter } from "@/utils/FiltersCheck";
import { removeDetailedViewFod } from "@/store/actions/FodDetailedView";
import { update_DetailViewFod } from "@/store/slices/fodDetailesView-slice";
import { reset_DetailedViewFod } from "@/store/slices/fodDetailesView-slice";
import { acceptFod, rejectFod } from "@/store/actions/FodActions";
import Image from "next/image";
import { RootState, AppDispatch } from "@/store";
import { getAllFrames, getAllFramesFromServer } from "@/ApiCalls/FodOperations";
import { CircleLoader } from "../commen/loader";
import Distance from "../commen/distance";
import { doubleAccept } from "@/store/slices/fodReducer-slice";
import { toast } from "react-toastify";
import { config } from "@/config/clientConfig";


const DetailedView = () => {
    const dispatch = useDispatch<AppDispatch>();
    const missionState = useSelector((store: RootState) => store.MissionState);
    const [selectedFrameIdx, setSelectedFrameIdx] = useState(0);
    const [selectedFrame, setselectedFrame] = useState(null);
    const { width } = FodPanelStyle;
    const [fade, setfade] = useState(false);
    const detailedViewRef = useRef(null);
    const [isAcceptDisabled, setAcceptButtonStatus] = useState(false);
    const [isRejectDisabled, setRejectButtonStatus] = useState(false);
    const { isOpen, isFilteredFod, fod, origin } = useSelector((state: RootState) => state.FodDetailedView);
    const { fods: alertQueue, doubleAccepted } = useSelector((state: RootState) => state.FodReducer);
    const filters = useSelector((state: RootState) => state.FodReducer.filters);

    const getFrames = (fod) => {
        const { FodPoints } = fod;
        let frames = [];
        frames = FodPoints || [];
        return frames;
    }

    const frames = getFrames(fod);
    function handleButtonClick(event) {
        // Prevent clicks on buttons from bubbling up to the document level
        event.stopPropagation();
    }

    const getNextFod = (idx?: number) => {
        const providedFodId = (fod as any).groupId;
        let queue = alertQueue.filter(fod => fod.groupStatus == filters.groupStatus);
        const initFilteredArray = queue.filter((fod) => isFilteredFod ? !FiltersCheck(fod, filters) : FiltersCheck(fod, filters));
        const sortedArray = sortByFilter(filters, initFilteredArray);
        const filteredArray = sortedArray.filter(fod => !doubleAccepted.hasOwnProperty(fod.groupId))
        if (filteredArray.length <= 1) return null;
        const filteredIndex = filteredArray.findIndex(item => item.groupId === providedFodId);
        let result = typeof idx == 'number' ? filteredArray[idx] : filteredArray[filteredIndex + 1] || filteredArray[0];
        if (result.groupId == (fod as any).groupId) {
            result = typeof idx == 'number' ? filteredArray[idx + 1] : filteredArray[filteredIndex + 1] || filteredArray[1];
        }
        return result;
    };

    const fetchNextFodDetailedView = async () => {
        setfade(true)
        const nextFod = getNextFod();
        const listFod = await getAllFrames(nextFod);
        if (nextFod) {
            console.log({ listFod })
            const fod = { ...nextFod, FodPoints: listFod.data };
            dispatch(update_DetailViewFod({ fod, isFilteredFod, origin: listFod.origin }));
            getAllFramesFromServer(nextFod, missionState.missionNumber).then((res: any) => {
                console.log({ res })
                const fod = { ...nextFod, FodPoints: res.data };
                dispatch(update_DetailViewFod({ fod, isFilteredFod, origin: res.origin }));
            });
        } else {
            dispatch(reset_DetailedViewFod());
        }
        setTimeout(() => {
            setfade(false)
        }, 200)


    }

    const getPreviousFod = () => {
        const providedFodId = (fod as any).groupId;
        let queue = alertQueue.filter(fod => fod.groupStatus == filters.groupStatus);
        const initFilteredArray = queue.filter((fod) => isFilteredFod ? !FiltersCheck(fod, filters) : FiltersCheck(fod, filters));
        const filteredArray = sortByFilter(filters, initFilteredArray);
        if (filteredArray.length <= 1) return null;
        const filteredIndex = filteredArray.findIndex(item => item.groupId === providedFodId);
        return filteredArray[filteredIndex - 1] || filteredArray[filteredArray.length - 1];
    };

    const fetchPreviousFodDetailedView = async () => {
        setfade(true)
        const prevFod = getPreviousFod();
        const listFod = await getAllFrames(prevFod);
        if (prevFod) {
            const fod = { ...prevFod, FodPoints: listFod.data };
            dispatch(update_DetailViewFod({ fod, isFilteredFod, origin: listFod.origin }));
            getAllFramesFromServer(prevFod, missionState.missionNumber).then((res: any) => {
                console.log({ res })
                const fod = { ...prevFod, FodPoints: res.data };
                dispatch(update_DetailViewFod({ fod, isFilteredFod, origin: res.origin }));
            });
        } else {
            dispatch(reset_DetailedViewFod());
        }
        setTimeout(() => {
            setfade(false)
        }, 200)
    }

    const handleAccept = async () => {
        setAcceptButtonStatus(true);
        setAcceptButtonStatus(false);
        setfade(true);
        if ((fod as any).groupStatus == "ACCEPTED") {
            dispatch(doubleAccept((fod as any).groupId))
        } else {
            dispatch(acceptFod({ ...(fod as any), missionId: missionState.missionNumber }));
        }
        setTimeout(async () => {
            try {
                const nextFod = getNextFod(0);
                const listFod = await getAllFrames(nextFod);
                if (nextFod) {
                    const fod = { ...nextFod, FodPoints: listFod.data };
                    dispatch(update_DetailViewFod({ fod, isFilteredFod, origin: listFod.origin }));
                } else {
                    dispatch(reset_DetailedViewFod());
                }
            } catch (e) {
                toast.error('Failed to load next FOD frames');
            } finally {
                setfade(false);
            }
        }, 200)
    }

    const handleReject = async () => {
        console.log("Reject start");
        setRejectButtonStatus(true);
        setRejectButtonStatus(false);
        setfade(true);
        setTimeout(async () => {
            try {
                dispatch(rejectFod({ ...(fod as any), missionId: missionState.missionNumber }));
                const nextFod = getNextFod(0);
                const listFod = await getAllFrames(nextFod);
                if (nextFod) {
                    const fod = { ...nextFod, FodPoints: listFod.data };
                    dispatch(update_DetailViewFod({ fod, isFilteredFod, origin: listFod.origin }));
                } else {
                    dispatch(reset_DetailedViewFod());
                }
                setfade(false);
            } catch (e) {
                toast.error('Failed to load next FOD frames');
            } finally {
                setfade(false);
            }
        }, 200)
    }

    const keyboardPointersAction = (count) => {
        setSelectedFrameIdx((prevIdx) => {
            let currentIdx = prevIdx + count;

            if (currentIdx < 0 || currentIdx >= frames.length) {
                return prevIdx;
            }

            setselectedFrame(frames[currentIdx]);

            const ele = document.getElementById(`selectedFrame${currentIdx}`);
            if (ele) {
                ele.scrollIntoView({
                    behavior: 'smooth', // Smooth scrolling animation
                    block: 'center',    // Align the element vertically in the center of the viewport
                    inline: 'nearest'   // Align the element horizontally (if needed)
                });
            }

            return currentIdx; // Return the new index
        });
    };


    // Reset selected frame when fod changes
    useEffect(() => {
        setSelectedFrameIdx(0);
        setselectedFrame(null);
    }, [fod?.id, (fod as any)?.groupId]);

    const handleAcceptRejectKeyDown = async (event) => {
        if (event.key === 'Escape' || event.keyCode === 27) {
            dispatch(removeDetailedViewFod());
            return;
        }

        switch (event.keyCode) {
            case 87:
                keyboardPointersAction(-3)
                break;
            case 83:
                keyboardPointersAction(3)
                break;
            case 65:
                fetchPreviousFodDetailedView();
                break;
            case 68:
                fetchNextFodDetailedView();
                break;
        }

        if (!isOpen || isAcceptDisabled || isRejectDisabled) {
            return;
        }

        if (event.keyCode === 255 || event.keyCode === 81) { // F7
            await handleAccept();
        } else if (event.keyCode === 115 || event.keyCode === 69) { // F4
            await handleReject();
        }
    }


    //adding event for listening keyboard
    useEffect(() => {
        window.addEventListener('keydown', handleAcceptRejectKeyDown);
        return () => {
            window.removeEventListener('keydown', handleAcceptRejectKeyDown);
        };
    }, [isOpen, fod, isAcceptDisabled, isRejectDisabled]);

    //adding event to closing modal
    useEffect(() => {
        function handleClickOutside(event) {
            if (detailedViewRef.current && !detailedViewRef.current.contains(event.target)) {
                dispatch(removeDetailedViewFod());
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside); // Add touchstart event listener

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside); // Remove touchstart event listener
        };
    }, [dispatch, detailedViewRef]);


    return (
        <>
            {isOpen && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center text-[#696972] z-50 animate-fadeIn">
                {fade && <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[999]">
                    <CircleLoader />
                </div>}
                <div className={`h-[80%] w-[80%] max-w-[1200px] rounded-xl p-5 bg-white shadow-2xl flex justify-between items-center relative transition-all duration-300 ${fade ? "opacity-50 animate-shrinkFade" : "opacity-100 animate-expandFromCenter"}`} ref={detailedViewRef} onClick={handleButtonClick}>
                    <div onClick={fetchPreviousFodDetailedView} className="absolute -left-28 top-1/2 transform -translate-y-1/2 z-20 active:scale-95 cursor-pointer">
                        {/* <FaArrowLeft className="text-3xl text-gray-700 hover:text-gray-900" /> */}
                        <Image src={leftArrowImg} width={100} height={100} alt={""} />
                    </div>
                    <div className="w-[55%] h-full rounded-md bg-[#EBEBEB] flex flex-wrap gap-2.5 pt-5 pl-5 overflow-y-auto overflow-x-hidden">
                        <div className=" w-full grid grid-cols-2 2xl:grid-cols-3 gap-3 justify-center ">
                            {frames.map((frame, index) => {
                                const isSelected = selectedFrame ? frame?.id === selectedFrame?.id : index === selectedFrameIdx;
                                return (
                                    <div
                                        id={`selectedFrame${index}`}
                                        onClick={() => {
                                            setSelectedFrameIdx(index);
                                            setselectedFrame(frame);
                                        }}
                                        key={index}
                                        className={`max-h-80 overflow-hidden cursor-pointer rounded-lg transition-all duration-150 ${
                                            isSelected ? "border-2 border-[#017ED7] shadow-md ring-2 ring-blue-400/40 scale-[1.02]" : "border border-gray-300 opacity-80 hover:opacity-100"
                                        } w-[220px] h-[220px]`}
                                    >
                                        <Image
                                            src={`${config.ImagesBase}/${missionState.missionNumber}/${frame.groupId}/${frame.id}.jpg`}
                                            className="w-full h-full object-cover object-center"
                                            alt="FOD frame"
                                            width={220}
                                            height={220}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="h-full w-[45%] flex flex-col justify-between items-center py-5 px-5">
                        <div className="h-[65%] w-full flex flex-col justify-start items-center">
                            <div className="flex justify-between items-center h-[20%] mb-2.5 w-full text-3xl font-black">
                                <div className="flex items-center gap-3">
                                    <span>Fod Id {Fod_FodId(fod)}</span>
                                    {`${origin}` === 'backend' ? (
                                        <span className="w-3.5 h-3.5 rounded-full bg-green-500 inline-block" title="Backend synced" />
                                    ) : (
                                        <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 inline-block" title="Local detection" />
                                    )}
                                </div>
                                <button
                                    onClick={() => dispatch(removeDetailedViewFod())}
                                    className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800 cursor-pointer"
                                    title="Close (Esc)"
                                >
                                    <RxCross1 className="text-2xl" />
                                </button>
                            </div>
                            <div className="h-full w-full flex flex-col justify-between items-center">
                                <div className="h-[25%] w-full rounded-md bg-[#F7F7F7] my-1 flex justify-between items-center px-3">
                                    <span>CAM ID</span>
                                    <span>{!!selectedFrame ? selectedFrame?.sysid : frames[0]?.sysid}</span>
                                </div>
                                <div className="h-[25%] w-full rounded-md bg-[#F7F7F7] my-1 flex justify-between items-center px-3">
                                    <span>Size</span>
                                    <span>{!!selectedFrame ? selectedFrame.size : frames[0]?.size}mm</span>
                                </div>
                                <div className="h-[25%] w-full rounded-md bg-[#F7F7F7] my-1 flex justify-between items-center px-3">
                                    <span>Class</span>
                                    <span>{!!selectedFrame ? selectedFrame.class : frames[0]?.class}</span>
                                </div>
                                <div className="h-[25%] w-full rounded-md bg-[#F7F7F7] my-1 flex justify-between items-center px-3">
                                    <span>Velocity</span>
                                    <span>{!!selectedFrame ? Math.floor(selectedFrame.velocity) : Math.floor(frames[0]?.velocity)}Km/h</span>
                                </div>
                                <div className="h-[25%] w-full rounded-md bg-[#F7F7F7] my-1 flex justify-between items-center px-3">
                                    <span>
                                        Distance
                                    </span>
                                    <span><Distance {...{ selectedFrame }} /></span>
                                </div>
                            </div>
                        </div>
                        <div className="h-[15%] w-full flex gap-5 justify-center items-center">
                            <button onClick={handleAccept} disabled={isAcceptDisabled} className="h-full w-1/2 rounded-md bg-[#017ED7] text-white flex justify-center items-center text-xl gap-1 active:scale-95 active:bg-blue-600 cursor-pointer">
                                <PiCheckBold className="text-[22px] stroke-[3px]" />
                                <span className="text-2xl font-semibold">Accept</span>
                            </button>
                            <button onClick={handleReject} disabled={isRejectDisabled} className="h-full w-1/2 rounded-md bg-[#C8CDD1] text-white flex justify-center items-center text-xl gap-1 active:scale-95 active:bg-gray-600 cursor-pointer">
                                <RxCross1 className="stroke-[1px]" />
                                <span className="text-2xl font-semibold">Reject</span>
                            </button>
                        </div>
                    </div>
                    {/* Next Arrow */}
                    <div onClick={fetchNextFodDetailedView} className="absolute -right-28 top-1/2 transform -translate-y-1/2 z-20 active:scale-95 cursor-pointer">
                        {/* <FaArrowRight className="text-3xl text-gray-700 hover:text-gray-900" /> */}
                        <Image src={rightArowImg} width={100} height={100} alt={""} />
                    </div>
                </div>
            </div>}
        </>
    );
};

export default DetailedView;
