import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import Fodcard from "./FodCards/FodCard";
import { FiltersCheck, sortByFilter } from "../../utils/FiltersCheck";
import { updateDetailViewFod } from "../../store/actions/FodDetailedView";
import { RootState, AppDispatch } from "@/store";

const FilteredFods = () => {
  const dispatch = useDispatch<AppDispatch>();
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'filtered' | 'unfiltered'>('filtered');
  const [startY, setStartY] = useState(null);
  const [endY, setEndY] = useState(null);
  const alertQueue = useSelector((state:RootState)  => state.FodReducer.fods);
  const {filters,doubleAccepted} = useSelector((state:RootState)  => state.FodReducer);
  const { groupStatus } = useSelector((state:RootState) => state.FodReducer.filters);
  const handleDetailViewRequest = React.useCallback(
    (fod: any) => {
      dispatch(updateDetailViewFod(fod, true));
    },
    [dispatch]
  );

  useEffect(() => {
    const handleTouchStart = (event) => {
      const touchY = event.touches[0].clientY;
      const swipeRange = isVisible ? 400 : 100;
      if (touchY >= window.innerHeight - swipeRange) {
        setStartY(touchY);
      }
    };

    const handleTouchEnd = (event) => {
      const touchY = event.changedTouches[0].clientY;
      if (startY !== null && touchY !== null) {
        const swipeDistance = startY - touchY;
        if (swipeDistance > 150 && !isVisible) {
          setIsVisible(true); // Swipe from bottom to up to open
        } else if (swipeDistance < -50 && isVisible) {
          setIsVisible(false); // Swipe from up to bottom to close
        }
      }
      setStartY(null);
    };

    const handleMouseDown = (event) => {
      const swipeRange = isVisible ? 400 : 100;
      if (event.clientY >= window.innerHeight - swipeRange) {
        setStartY(event.clientY);
      }
    };

    const handleMouseMove = (event) => {
      if (startY !== null) {
        setEndY(event.clientY);
      }
    };

    const handleMouseUp = () => {
      if (startY !== null && endY !== null) {
        const swipeDistance = startY - endY;
        if (swipeDistance > 150 && !isVisible) {
          setIsVisible(true); // Swipe from bottom to up to open
        } else if (swipeDistance < -50 && isVisible) {
          setIsVisible(false); // Swipe from up to bottom to close
        }
      }
      setStartY(null);
      setEndY(null);
    };

    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isVisible, startY, endY]);

  const toggleVisibility = () => {
    setIsVisible((prevState) => !prevState);
  };

  const activeStatus = groupStatus || "NEW";

  // "Filtered" = FODs excluded from the main grid by the active class/size
  // filter (still reviewable here). "Unfiltered" = the passing set.
  const excludedFods = sortByFilter(
    filters,
    alertQueue.filter((fod) => fod.groupStatus === activeStatus && !FiltersCheck(fod, filters) && !doubleAccepted.hasOwnProperty(fod.groupId))
  ) || [];
  const passingFods = sortByFilter(
    filters,
    alertQueue.filter((fod) => fod.groupStatus === activeStatus && FiltersCheck(fod, filters) && !doubleAccepted.hasOwnProperty(fod.groupId))
  ) || [];

  const openTab = (tab: 'filtered' | 'unfiltered') => {
    setActiveTab(tab);
    setIsVisible(true);
  };

  const shownFods = activeTab === 'filtered' ? excludedFods : passingFods;

  return (
    <div className={`absolute fixed w-[100%] transition-all duration-300 bottom-[-1px] z-20 overflow-hidden`}>
      <div className="flex justify-center">
        <div
          className={`tooltip h-35 w-[200px] rounded-tl-md flex justify-center items-center text-xl cursor-pointer ${activeTab === 'filtered' ? 'bg-blue-500 text-white' : 'bg-gray-300 text-black'}`}
          onClick={() => openTab('filtered')}
        >
          Filtered FOD ({excludedFods.length})
        </div>
        <div
          className={`tooltip h-35 w-[200px] rounded-tr-md flex justify-center items-center text-xl cursor-pointer ${activeTab === 'unfiltered' ? 'bg-blue-500 text-white' : 'bg-gray-300 text-black'}`}
          onClick={() => openTab('unfiltered')}
        >
          Unfiltered ({passingFods.length})
        </div>
      </div>
      {isVisible && (
        <div className="bg-gray-300">
          <div className="flex justify-between items-center px-3 py-1 bg-gray-400 text-white">
            <span className="text-sm font-semibold">{activeTab === 'filtered' ? 'Filtered-out FODs' : 'Unfiltered FODs'} ({shownFods.length})</span>
            <button className="text-white font-bold px-2" onClick={() => setIsVisible(false)}>✕</button>
          </div>
          <div className="filtered_fods_list flex px-2 h-[250px] gap-4 items-center overflow-x-auto overflow-y-hidden">
            {shownFods.length === 0
              ? <div className="w-full text-center text-gray-600">No FODs in this tab</div>
              : shownFods.map((fod, index) => (
                  <Fodcard key={fod.id ?? index} fod={fod} handleDetailViewRequest={handleDetailViewRequest} />
                ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FilteredFods;
