import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from "react";
import { useSelector, useDispatch } from "react-redux";
import Fodcard from "./FodCards/FodCard";
import { FiltersCheck, sortByFilter } from "../../utils/FiltersCheck";
import { updateDetailViewFod } from "../../store/actions/FodDetailedView";
import { RootState, AppDispatch } from "@/store";

const DRAWER_PAGE_SIZE = 60;

const FilteredFods = () => {
  const dispatch = useDispatch<AppDispatch>();
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'filtered' | 'unfiltered'>('filtered');
  const [renderLimit, setRenderLimit] = useState(DRAWER_PAGE_SIZE);
  const startYRef = useRef<number | null>(null);
  const alertQueue = useSelector((state: RootState) => state.FodReducer.fods);
  const filters = useSelector((state: RootState) => state.FodReducer.filters);
  const doubleAccepted = useSelector((state: RootState) => state.FodReducer.doubleAccepted);
  const missionNumber = useSelector((state: RootState) => state.MissionState?.missionNumber);
  const deferredQueue = useDeferredValue(alertQueue);
  const deferredFilters = useDeferredValue(filters);

  const handleDetailViewRequest = React.useCallback(
    (fod: any) => {
      dispatch(updateDetailViewFod(fod, true));
    },
    [dispatch]
  );

  useEffect(() => {
    const handleTouchStart = (event: TouchEvent) => {
      const touchY = event.touches[0].clientY;
      const swipeRange = isVisible ? 400 : 100;
      if (touchY >= window.innerHeight - swipeRange) {
        startYRef.current = touchY;
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const touchY = event.changedTouches[0].clientY;
      if (startYRef.current !== null) {
        const swipeDistance = startYRef.current - touchY;
        if (swipeDistance > 150 && !isVisible) {
          setIsVisible(true);
        } else if (swipeDistance < -50 && isVisible) {
          setIsVisible(false);
        }
      }
      startYRef.current = null;
    };

    const handleMouseDown = (event: MouseEvent) => {
      const swipeRange = isVisible ? 400 : 100;
      if (event.clientY >= window.innerHeight - swipeRange) {
        startYRef.current = event.clientY;
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (startYRef.current !== null) {
        const swipeDistance = startYRef.current - event.clientY;
        if (swipeDistance > 150 && !isVisible) {
          setIsVisible(true);
        } else if (swipeDistance < -50 && isVisible) {
          setIsVisible(false);
        }
      }
      startYRef.current = null;
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
  }, [isVisible]);

  const activeStatus = deferredFilters.groupStatus || "NEW";

  // Single O(N) pass to compute counts without sorting when drawer is closed
  const { excludedCount, passingCount } = useMemo(() => {
    let excluded = 0;
    let passing = 0;
    for (let i = 0; i < deferredQueue.length; i++) {
      const fod = deferredQueue[i];
      if (fod.groupStatus !== activeStatus) continue;
      if (Object.prototype.hasOwnProperty.call(doubleAccepted, fod.groupId)) continue;
      if (FiltersCheck(fod, deferredFilters)) {
        passing++;
      } else {
        excluded++;
      }
    }
    return { excludedCount: excluded, passingCount: passing };
  }, [deferredQueue, activeStatus, deferredFilters, doubleAccepted]);

  // Only filter and sort the active tab's FOD list when the bottom drawer is actually open
  const shownFods = useMemo(() => {
    if (!isVisible) return [];
    const wantPassing = activeTab === 'unfiltered';
    const matching: any[] = [];
    for (let i = 0; i < deferredQueue.length; i++) {
      const fod = deferredQueue[i];
      if (fod.groupStatus !== activeStatus) continue;
      if (Object.prototype.hasOwnProperty.call(doubleAccepted, fod.groupId)) continue;
      if (Boolean(FiltersCheck(fod, deferredFilters)) === wantPassing) {
        matching.push(fod);
      }
    }
    return sortByFilter(deferredFilters, matching) || [];
  }, [isVisible, activeTab, deferredQueue, activeStatus, deferredFilters, doubleAccepted]);

  const openTab = (tab: 'filtered' | 'unfiltered') => {
    setActiveTab(tab);
    setRenderLimit(DRAWER_PAGE_SIZE);
    setIsVisible(true);
  };

  const handleHorizontalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 400) {
      setRenderLimit((prev) => (prev < shownFods.length ? prev + DRAWER_PAGE_SIZE : prev));
    }
  };

  return (
    <div className={`fixed w-[100%] transition-all duration-300 bottom-[-1px] z-20 overflow-hidden pointer-events-none`}>
      <div className="flex justify-center pointer-events-auto">
        <div
          className={`h-8 px-5 rounded-tl-xl flex justify-center items-center text-xs font-bold uppercase tracking-wider cursor-pointer transition-all border-t border-l ${
            activeTab === 'filtered'
              ? 'bg-[#017ED7] text-white border-[#017ED7] shadow-sm'
              : 'bg-[#181C23] text-slate-400 hover:text-white border-[#252B35]'
          }`}
          onClick={() => openTab('filtered')}
        >
          Filtered FOD ({excludedCount})
        </div>
        <div
          className={`h-8 px-5 rounded-tr-xl flex justify-center items-center text-xs font-bold uppercase tracking-wider cursor-pointer transition-all border-t border-r border-l ${
            activeTab === 'unfiltered'
              ? 'bg-[#017ED7] text-white border-[#017ED7] shadow-sm'
              : 'bg-[#181C23] text-slate-400 hover:text-white border-[#252B35]'
          }`}
          onClick={() => openTab('unfiltered')}
        >
          Unfiltered ({passingCount})
        </div>
      </div>
      {isVisible && (
        <div className="bg-[#181C23] border-t border-[#252B35] shadow-2xl pointer-events-auto">
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
          <div
            onScroll={handleHorizontalScroll}
            className="filtered_fods_list flex px-4 h-[375px] gap-4 items-center overflow-x-auto overflow-y-hidden"
          >
            {shownFods.length === 0 ? (
              <div className="w-full text-center text-xs font-medium text-slate-500">
                No FODs in this tab
              </div>
            ) : (
              shownFods.slice(0, renderLimit).map((fod, index) => (
                <Fodcard
                  key={fod.id ?? index}
                  fod={fod}
                  missionNumber={missionNumber}
                  handleDetailViewRequest={handleDetailViewRequest}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FilteredFods;
