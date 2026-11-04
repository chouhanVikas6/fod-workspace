import React, { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RxCross1 } from "react-icons/rx";
import { HiOutlineCheck } from "react-icons/hi";
import { FiThumbsUp } from "react-icons/fi";
import FodListcard from "./fodListCard";
import FodDetail from "./fodDetail";
import { close_SideBarFodDetail, setSideBarVisibility } from "@/store/slices/selectedFod-slice";
import { RootState } from "@/store";

const FodCategoryAndDetail = () => {
  const dispatch = useDispatch();
  const [selectedList, setSelectedList] = useState<string>("ACCEPTED");
  const fods = useSelector((state: RootState) => state.FodReducer.fods);
  const selectedFod = useSelector((state: RootState) => state.SelectedFod);
  const { isSidebarVisible, isSidebarFodDetailVisible } = selectedFod;

  const setList = (listName: string) => {
    setSelectedList(listName);
  };

  const padZero = (n: number | string) => {
    const num = Number(n);
    if (!isNaN(num) && num < 10) return `0${num}`;
    return String(n);
  };

  const listLengthFn = () => {
    let total = {
      ACCEPTED: 0,
      REJECTED: 0,
      CLEARED: 0
    };

    fods.forEach((ele) => {
      if (ele.groupStatus === "ACCEPTED") {
        total.ACCEPTED++;
      } else if (ele.groupStatus === "REJECTED") {
        total.REJECTED++;
      } else if (ele.groupStatus === "CLEARED") {
        total.CLEARED++;
      }
    });

    return total;
  };

  const listLength = listLengthFn();

  const selectedListTitle = () => {
    if (selectedList === "ACCEPTED") return `Accepted FODs (${padZero(listLength.ACCEPTED)})`;
    if (selectedList === "REJECTED") return `Rejected FODs (${padZero(listLength.REJECTED)})`;
    if (selectedList === "CLEARED") return `Cleared FODs (${padZero(listLength.CLEARED)})`;
    return "FOD List";
  };

  const currentItems = fods.filter((fod) => fod.groupStatus === selectedList);

  return (
    <div
      className={`absolute top-0 bottom-0 right-0 h-full flex z-30 pointer-events-none transition-transform duration-300 ease-in-out ${
        isSidebarVisible ? "translate-x-0" : "translate-x-[320px]"
      }`}
    >
      {/* Floating vertical pill counter on the left side of the drawer */}
      <div className="h-full flex items-center pr-2">
        <div
          className="w-[48px] py-4 rounded-2xl bg-[#181D25] border border-[#2B3542] shadow-2xl flex flex-col items-center gap-3.5 pointer-events-auto select-none cursor-pointer"
          onDoubleClick={() => dispatch(setSideBarVisibility(!isSidebarVisible))}
          onClick={() => {
            if (!isSidebarVisible) {
              dispatch(setSideBarVisibility(true));
            }
            dispatch(close_SideBarFodDetail());
          }}
        >
          {/* Cleared FODs */}
          <button
            type="button"
            title="Cleared FODs"
            className={`w-full flex flex-col items-center justify-center gap-0.5 py-1 transition-all ${
              selectedList === "CLEARED" ? "text-blue-400 scale-105" : "text-slate-400 hover:text-white"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setList("CLEARED");
              dispatch(setSideBarVisibility(true));
              dispatch(close_SideBarFodDetail());
            }}
          >
            <FiThumbsUp className="w-4 h-4 stroke-[2]" />
            <span className="text-[11px] font-mono font-bold">{padZero(listLength.CLEARED)}</span>
          </button>

          <div className="w-5 h-[1px] bg-[#2B3542]" />

          {/* Accepted */}
          <button
            type="button"
            title="Accepted FODs"
            className={`w-full flex flex-col items-center justify-center gap-0.5 py-1 transition-all ${
              selectedList === "ACCEPTED" ? "text-emerald-400 scale-105" : "text-slate-400 hover:text-emerald-400"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setList("ACCEPTED");
              dispatch(setSideBarVisibility(true));
              dispatch(close_SideBarFodDetail());
            }}
          >
            <HiOutlineCheck className="w-4 h-4 stroke-[2.5] text-emerald-400" />
            <span className="text-[11px] font-mono font-bold text-emerald-400">
              {padZero(listLength.ACCEPTED)}
            </span>
          </button>

          <div className="w-5 h-[1px] bg-[#2B3542]" />

          {/* Rejected */}
          <button
            type="button"
            title="Rejected FODs"
            className={`w-full flex flex-col items-center justify-center gap-0.5 py-1 transition-all ${
              selectedList === "REJECTED" ? "text-rose-400 scale-105" : "text-slate-400 hover:text-rose-400"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setList("REJECTED");
              dispatch(setSideBarVisibility(true));
              dispatch(close_SideBarFodDetail());
            }}
          >
            <RxCross1 className="w-3.5 h-3.5 stroke-[1.5] text-rose-400" />
            <span className="text-[11px] font-mono font-bold text-rose-400">
              {padZero(listLength.REJECTED)}
            </span>
          </button>
        </div>
      </div>

      {/* Slideout Content Drawer */}
      <div className="w-[320px] h-full bg-[#181C23] border-l border-[#2B3542] flex flex-col pointer-events-auto shadow-2xl">
        {isSidebarFodDetailVisible ? (
          <FodDetail />
        ) : (
          <div className="h-full flex flex-col">
            {/* Drawer Header */}
            <div className="h-12 px-4 flex items-center justify-between border-b border-[#252B35] shrink-0">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                {selectedListTitle()}
              </span>
              <button
                type="button"
                title="Close drawer"
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                onClick={() => dispatch(setSideBarVisibility(false))}
              >
                <RxCross1 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto py-2">
              {currentItems.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-slate-500 text-xs font-medium">
                  No FODs in this category
                </div>
              ) : (
                currentItems.map((fod, index) => (
                  <FodListcard key={fod.id ?? index} fod={fod} />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FodCategoryAndDetail;
