import React from "react";
import { set_selectedQueue } from "@/store/slices/mapReducer-slice";
import { useSelector, useDispatch } from "react-redux";
import Selected from "@/assets/images/svg/map/selected.svg";
import { RootState } from "@/store";
import Image from "next/image";

function Tickbox({ color = "bg-[#FF8360]" }) {
  return (
    <div className={`w-4 h-4 shrink-0 ${color} flex items-center justify-center overflow-hidden rounded-[4px]`}>
      <Image src={Selected} alt="" width={11} height={11} />
    </div>
  );
}

const FILTER_OPTIONS = [
  { key: "ACCEPTED", label: "Accepted FOD", boxColor: "bg-red-500", textColor: "text-red-500" },
  { key: "CLEARED", label: "Cleared FOD", boxColor: "bg-green-500", textColor: "text-green-500" },
  { key: "REJECTED", label: "Rejected FOD", boxColor: "bg-gray-500", textColor: "text-gray-500 dark:text-slate-300" },
  { key: "NEW", label: "New FOD", boxColor: "bg-yellow-500", textColor: "text-yellow-500" },
  { key: "MISSED", label: "Missed FOD", boxColor: "bg-orange-500", textColor: "text-orange-500" },
];

export default function FilterBox() {
  const dispatch = useDispatch();
  const selected_queue = useSelector((state: RootState) => state.MapReducer.selectedQueue);

  const checkSelected = (item: string) => selected_queue.includes(item);

  return (
    <div className="absolute bottom-full right-0 mb-2.5 z-50">
      <div className="w-[168px] rounded-xl bg-white/95 dark:bg-[#1E2228]/95 backdrop-blur-md border border-slate-200/90 dark:border-white/15 shadow-xl p-1.5 flex flex-col gap-0.5">
        {FILTER_OPTIONS.map((opt) => {
          const isSelected = checkSelected(opt.key);
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => dispatch(set_selectedQueue(opt.key))}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold tracking-normal whitespace-nowrap hover:bg-slate-100/80 dark:hover:bg-white/10 transition-colors cursor-pointer text-left"
            >
              {isSelected ? (
                <Tickbox color={opt.boxColor} />
              ) : (
                <div className="w-4 h-4 shrink-0 border border-slate-300 dark:border-white/25 rounded-[4px]" />
              )}
              <span
                className={`text-xs font-semibold leading-none ${
                  isSelected
                    ? opt.textColor
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
