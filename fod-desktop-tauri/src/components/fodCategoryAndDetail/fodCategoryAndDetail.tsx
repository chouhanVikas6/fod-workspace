import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RxCross1 } from "react-icons/rx";
import { HiOutlineCheck } from "react-icons/hi";
import FodListcard from "./fodListCard";
import FodDetail from "./fodDetail";
import { close_SideBarFodDetail, setSideBarVisibility } from "@/store/slices/selectedFod-slice";
import { RootState } from "@/store";
import { GiCardPickup } from "react-icons/gi";

const FodCategoryAndDetail = () => {
    const dispatch = useDispatch();
    const [touchStartX, setTouchStartX] = useState<number | null>(null);
    const [mouseStartX, setMouseStartX] = useState<number | null>(null);
    const [selectedList, setSelectedList] = useState<string>("ACCEPTED");
    const [swipeRange, setSwipeRange] = useState(100); // Range for swipes
    const fods = useSelector((state: RootState) => state.FodReducer.fods);
    const selectedFod = useSelector((state: RootState) => state.SelectedFod);
    const { isSidebarVisible, isSidebarFodDetailVisible } = selectedFod;

    //opening and closing right side bar (categories)
    useEffect(() => {
        const handleTouchStart = (event: TouchEvent) => {
            // Only detect the swipe if the touch starts within the swipe range on the right side of the screen
            const touchX = event.touches[0].clientX;
            if (!isSidebarVisible && touchX >= window.innerWidth - swipeRange) {
                setTouchStartX(touchX);
            } else if (isSidebarVisible) {
                setTouchStartX(touchX);
            }
        };

        const handleTouchEnd = (event: TouchEvent) => {
            if (touchStartX !== null) {
                const touchEndX = event.changedTouches[0].clientX;
                const swipeDistance = touchStartX - touchEndX;

                if (swipeDistance > 150 && !isSidebarVisible) {
                    // Swipe left to open
                    dispatch(setSideBarVisibility(true));
                } else if (swipeDistance < -150 && isSidebarVisible) {
                    // Swipe right to close
                    dispatch(setSideBarVisibility(false));
                }
            }
            setTouchStartX(null);
        };

        const handleMouseDown = (event: MouseEvent) => {
            const mouseX = event.clientX;
            if (!isSidebarVisible && mouseX >= window.innerWidth - swipeRange) {
                setMouseStartX(mouseX);
            } else if (isSidebarVisible) {
                setMouseStartX(mouseX);
            }
        };

        const handleMouseUp = (event: MouseEvent) => {
            if (mouseStartX !== null) {
                const mouseEndX = event.clientX;
                const swipeDistance = mouseStartX - mouseEndX;

                if (swipeDistance > 150 && !isSidebarVisible) {
                    // Swipe left to open
                    dispatch(setSideBarVisibility(true));
                } else if (swipeDistance < -150 && isSidebarVisible) {
                    // Swipe right to close
                    dispatch(setSideBarVisibility(false));
                }
            }
            setMouseStartX(null);
        };

        document.addEventListener("touchstart", handleTouchStart);
        document.addEventListener("touchend", handleTouchEnd);
        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("touchstart", handleTouchStart);
            document.removeEventListener("touchend", handleTouchEnd);
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isSidebarVisible, touchStartX, mouseStartX]);

    const setList = (listName: string) => {
        setSelectedList(listName);
    }

    const formatLargeNumber = (input) => {
        let val = input;

        if (val < 10000) {
            val = String(val);
        } else if (val < 100000) {
            val = (val / 1000).toFixed(1) + 'K';
        } else if (val < 10000000) {
            val = (val / 100000).toFixed(1) + 'L';
        } else {
            val = (val / 10000000).toFixed(1) + 'C';
        }

        return val;
    }

    const listLengthFn = () => {
        let total = {
            ACCEPTED: 0,
            REJECTED: 0,
            CLEARED: 0
        };

        fods.forEach((ele) => {
            if (ele.groupStatus == "ACCEPTED") {
                total.ACCEPTED++;
            } else if (ele.groupStatus == "REJECTED") {
                total.REJECTED++;
            } else if (ele.groupStatus == "CLEARED") {
                total.CLEARED++;
            }
        });

        // Apply formatLargeNumber to each value in the total object
        total.ACCEPTED = formatLargeNumber(total.ACCEPTED);
        total.REJECTED = formatLargeNumber(total.REJECTED);
        total.CLEARED = formatLargeNumber(total.CLEARED);

        return total;
    }

    const selectedListTitle = () => {

        if (selectedList == "none") return "";
        if (selectedList == "ACCEPTED") return "Alert Marker's";
        let string = selectedList.toLowerCase();
        return string.charAt(0).toUpperCase() + string.slice(1) + " Fod's";
    }
    const listLength = listLengthFn();

    return (
        <div className={`absolute  h-full w-[350px] flex justify-end items-center overflow-x-hidden transition-all  duration-300 z-10  font-bold text-white ${isSidebarVisible ? "right-[0px]" : "right-[-320px]"}`}>
            <div className="w-[35px] h-[200px] rounded-l-md bg-[#017ED7] flex flex-col justify-center items-center overflow-hidden" onDoubleClick={() => dispatch(setSideBarVisibility(!isSidebarVisible))} onClick={() => dispatch(close_SideBarFodDetail())}>
                <button className={`h-[33.33%] w-full flex flex-col-reverse items-center justify-center z-3 ${selectedList === 'CLEARED' ? 'bg-[#002756]' : ''} rotate`} onClick={() => setList('CLEARED')}>
                    <GiCardPickup className="w-5 h-auto stroke-1" />
                    <span>{listLength.CLEARED}</span>
                </button>
                <div className="h-[1px] w-[80%] bg-white"></div>
                <button className={`h-[33.33%] w-full flex flex-col-reverse items-center justify-center z-3 ${selectedList === 'REJECTED' ? 'bg-[#002756]' : ''} rotate`} onClick={() => setList('REJECTED')}>
                    <RxCross1 className="w-50% h-auto stroke-1" />
                    <span>{listLength.REJECTED}</span>
                </button>
                <div className="h-[1px] w-[80%] bg-white"></div>
                <button className={`h-[33.33%] w-full flex flex-col-reverse items-center justify-center z-3 ${selectedList === 'ACCEPTED' ? 'bg-[#002756]' : ''} rotate`} onClick={() => setList('ACCEPTED')}>
                    <HiOutlineCheck className="transform rotate-[-90deg] w-5 h-5 stroke-2" />
                    <span>{listLength.ACCEPTED}</span>
                </button>
            </div>

            <div className={`h-full w-full bg-[#EBEBEB] overflow-y-auto transition ease duration-300  ${isSidebarVisible ? "right-0" : ""}`}>
                {isSidebarFodDetailVisible ?
                    <FodDetail /> :
                    <>
                        <div className="ml-3 mt-2 text-[grey]">{selectedListTitle()}</div>
                        {selectedList !== 'none' && fods.map((fod, index) => {

                            if (fod.groupStatus == selectedList) {
                                return <FodListcard key={index} fod={fod} />
                            };
                        }
                        )}
                    </>
                }
            </div>
        </div>
    )
};

export default FodCategoryAndDetail;
