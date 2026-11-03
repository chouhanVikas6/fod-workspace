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
          className={`h-8 px-5 rounded-tl-xl flex justify-center items-center text-xs font-bold uppercase tracking-wider cursor-pointer transition-all border-t border-l ${
            activeTab === 'filtered'
              ? 'bg-[#017ED7] text-white border-[#017ED7] shadow-sm'
              : 'bg-[#181C23] text-slate-400 hover:text-white border-[#252B35]'
          }`}
          onClick={() => openTab('filtered')}
        >
          Filtered FOD ({excludedFods.length})
        </div>
        <div
          className={`h-8 px-5 rounded-tr-xl flex justify-center items-center text-xs font-bold uppercase tracking-wider cursor-pointer transition-all border-t border-r border-l ${
            activeTab === 'unfiltered'
              ? 'bg-[#017ED7] text-white border-[#017ED7] shadow-sm'
              : 'bg-[#181C23] text-slate-400 hover:text-white border-[#252B35]'
          }`}
          onClick={() => openTab('unfiltered')}
        >
          Unfiltered ({passingFods.length})
        </div>
      </div>
      {isVisible && (
        <div className="bg-[#181C23] border-t border-[#252B35] shadow-2xl">
          <div className="flex justify-between items-center px-4 py-2 bg-[#14181F] border-b border-[#252B35] text-slate-200">
            <span className="text-xs font-bold uppercase tracking-wider">
              {activeTab === 'filtered' ? 'Filtered-out FODs' : 'Unfiltered FODs'} ({shownFods.length})
            </span>
            <button
              className="text-slate-400 hover:text-white font-bold p-1 rounded-md transition-colors"
              onClick={() => setIsVisible(false)}
            >
              ✕
            </button>
          </div>
          <div className="filtered_fods_list flex px-4 h-[375px] gap-4 items-center overflow-x-auto overflow-y-hidden">
            {shownFods.length === 0 ? (
              <div className="w-full text-center text-xs font-medium text-slate-500">
                No FODs in this tab
              </div>
            ) : (
              shownFods.map((fod, index) => (
                <Fodcard key={fod.id ?? index} fod={fod} handleDetailViewRequest={handleDetailViewRequest} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FilteredFods;
