
import React, { useState, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { SlidersHorizontal } from "lucide-react";
import InputRange from "react-input-slider";
import { config } from "@/config/clientConfig";

import {
  set_Class_Size,
  set_SortBy,
  setDashboardStatus,
} from "@/store/slices/fodReducer-slice";

import { RootState } from "@/store";
import { RxChevronDown } from "react-icons/rx";

const FilterBar = () => {
  return (
    <div className="w-full min-w-0 flex flex-wrap items-center justify-between gap-2 mb-4 text-slate-700 dark:text-slate-200 select-none shrink-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
        <SortBy />
        <FodStatusTabs />
      </div>
      <Filters />
    </div>
  );
};

export default FilterBar;

// SORT BY
const SortBy = () => {
  const dispatch = useDispatch();

  const { sortby } = useSelector(
    (state: RootState) => state.FodReducer.filters,
  );

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs font-medium text-slate-500 dark:text-[#A8B0BA]">
        Sort By:
      </span>

      <div className="relative">
        <select
          onChange={(e) => dispatch(set_SortBy(e.target.value))}
          value={sortby}
          className="bg-white dark:bg-[#181D24] text-slate-800 dark:text-white border border-slate-300 dark:border-[#2B323D] hover:border-slate-400 dark:hover:border-[#3E4755] rounded-lg pl-3 pr-7 py-1.5 text-xs font-semibold appearance-none cursor-pointer shadow-xs focus:outline-none focus:border-[#388AEB] transition-colors"
        >
          <option value="latest">Latest</option>
          <option value="oldest">Oldest</option>
          <option value="biggestTosmallest">Size: Largest</option>
          <option value="smallestTobiggest">Size: Smallest</option>
          <option value="nearestFirst">Distance: Nearest</option>
        </select>

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500 dark:text-[#7E8691]">
          <RxChevronDown className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
};

// FOD STATUS TABS
const FodStatusTabs = () => {
  const dispatch = useDispatch();

  const { groupStatus } = useSelector(
    (state: RootState) => state.FodReducer.filters,
  );

  const fods = useSelector((state: RootState) => state.FodReducer.fods);

  const { leftCount, foundCount } = useMemo(() => {
    let left = 0;
    let found = 0;

    for (let i = 0; i < fods.length; i++) {
      const status = fods[i].groupStatus;

      if (status === "NEW") {
        left++;
      } else if (status === "ACCEPTED") {
        found++;
      }
    }

    return {
      leftCount: left,
      foundCount: found,
    };
  }, [fods]);

  const isLeftActive = groupStatus === "NEW" || !groupStatus;

  const activeTabStyle =
    "border border-[#4C9FE8]/40 bg-[#4C9FE8]/15 text-[#287FC5] dark:text-[#4CA5FF] shadow-xs";

  const inactiveTabStyle =
    "border border-slate-300 dark:border-[#454B53] bg-white dark:bg-transparent text-slate-600 dark:text-[#A8B0BA] hover:bg-slate-100 dark:hover:bg-[#353A42] hover:text-slate-900 dark:hover:text-[#D9DDE2]";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => dispatch(setDashboardStatus("NEW"))}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
          isLeftActive ? activeTabStyle : inactiveTabStyle
        }`}
      >
        FOD Left ({String(leftCount).padStart(2, "0")})
      </button>

      <button
        type="button"
        onClick={() => dispatch(setDashboardStatus("ACCEPTED"))}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
          !isLeftActive ? activeTabStyle : inactiveTabStyle
        }`}
      >
        FOD Found ({String(foundCount).padStart(2, "0")})
      </button>
    </div>
  );
};

// FILTERS
const Filters = () => {
  const { size } = config.filters;

  const [formData, setFormData] = useState({
    Metallic: true,
    "Rocks/Ashpalt": true,
    Organic: true,
    "Non-Metallic": true,
  });

  const [isToolTipOpen, setToolTipVisibility] = useState(false);
  const [rangeValue, setRangeValue] = useState(size.min);

  const classes = [
    { name: "Metallic Objects", value: "Metallic" },
    { name: "Rocks/Ashpalt Chunks", value: "Rocks/Ashpalt" },
    { name: "Organic Objects", value: "Organic" },
    { name: "Non-metallic objects", value: "Non-Metallic" },
  ];

  const handleRangeChange = (newValue: any) => {
    setRangeValue(newValue.x);
  };

  const handleChange = (e: any) => {
    const { value, checked } = e.target;

    setFormData((prevState) => ({
      ...prevState,
      [value]: checked,
    }));
  };

  const handleApply = (e: any) => {
    e.preventDefault();

    const selectedClasses = Object.entries(formData)
      .filter(([_, value]) => value)
      .map(([key]) => key);

    const filter = {
      classes: selectedClasses,
      minSize: rangeValue,
    };

    const dispatch = useDispatch;
    // Dispatch is handled by the Filters component hook below.
    setToolTipVisibility(false);
  };

  const dispatch = useDispatch();

  const applyFilters = (e: any) => {
    e.preventDefault();

    const selectedClasses = Object.entries(formData)
      .filter(([_, value]) => value)
      .map(([key]) => key);

    dispatch(
      set_Class_Size({
        classes: selectedClasses,
        minSize: rangeValue,
      }),
    );

    setToolTipVisibility(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setToolTipVisibility(!isToolTipOpen)}
        className={`bg-white dark:bg-[#181D24] border rounded-lg px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
          isToolTipOpen
            ? "border-[#388AEB] text-[#287FC5] dark:text-[#4CA5FF]"
            : "border-slate-300 dark:border-[#2B323D] hover:border-slate-400 dark:hover:border-[#3E4755] text-slate-700 dark:text-slate-300"
        }`}
      >
        <SlidersHorizontal
          size={17}
          strokeWidth={2.2}
          className="shrink-0"
        />
        <span>Filter</span>
      </button>

      {isToolTipOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-32px)] bg-white dark:bg-[#1C222A] border border-slate-200 dark:border-[#454B53] text-slate-800 dark:text-white rounded-xl shadow-2xl p-4 z-30 animate-in fade-in duration-150">
          <ClassForm
            classes={classes}
            formData={formData}
            handleChange={handleChange}
            handleApply={applyFilters}
            handleReset={() => {
              const defaultClasses = {
                Metallic: true,
                "Rocks/Ashpalt": true,
                Organic: true,
                "Non-Metallic": true,
              };

              setFormData(defaultClasses);

              dispatch(
                set_Class_Size({
                  classes: Object.keys(defaultClasses),
                  minSize: rangeValue,
                }),
              );

              setToolTipVisibility(false);
            }}
            rangeValue={rangeValue}
            handleRangeChange={handleRangeChange}
          />
        </div>
      )}
    </div>
  );
};

// FILTER FORM
const ClassForm = ({
  rangeValue,
  handleRangeChange,
  classes,
  formData,
  handleChange,
  handleApply,
  handleReset,
}: any) => {
  const { size } = config.filters;

  return (
    <form onSubmit={handleApply} className="w-full space-y-3">
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-[#454B53]">
        <h3 className="text-xs font-bold text-slate-900 dark:text-[#D9DDE2] uppercase tracking-wider">
          Filter FOD Classes
        </h3>

        <span className="text-xs font-mono font-semibold text-[#287FC5] dark:text-[#4CA5FF]">
          Min: {rangeValue} mm
        </span>
      </div>

      <div className="py-1">
        <InputRange
          axis="x"
          xmin={size.min}
          xmax={size.max}
          x={rangeValue}
          onChange={handleRangeChange}
          styles={{
            track: {
              background: "#4C9FE8",
              height: "5px",
            },
            active: {
              background: "#CBD5E1",
            },
            thumb: {
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              backgroundColor: "#FFFFFF",
              border: "2px solid #4C9FE8",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
            },
          }}
        />
      </div>

      <ul className="list-none m-0 p-0 space-y-1.5">
        {classes.map((classData: any, index: number) => (
          <li
            key={index}
            className={`flex items-center rounded-lg py-2 px-2.5 text-xs font-medium cursor-pointer transition-colors ${
              formData[classData.value]
                ? "bg-[#EAF4FF] dark:bg-[#13273D] text-[#287FC5] dark:text-[#4CA5FF] border border-[#4C9FE8]/40"
                : "bg-slate-100 dark:bg-[#222832] text-slate-600 dark:text-[#A8B0BA] border border-transparent"
            }`}
          >
            <input
              id={classData.value}
              type="checkbox"
              value={classData.value}
              checked={formData[classData.value]}
              onChange={handleChange}
              className="hidden"
            />

            <label
              htmlFor={classData.value}
              className="flex items-center cursor-pointer w-full"
            >
              <span
                className={`w-3.5 h-3.5 border rounded mr-2 flex items-center justify-center ${
                  formData[classData.value]
                    ? "bg-[#4C9FE8] border-[#4C9FE8] text-white text-[9px] font-bold"
                    : "border-slate-400 dark:border-slate-500"
                }`}
              >
                {formData[classData.value] ? "✓" : ""}
              </span>

              <span>{classData.name}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 justify-end pt-2 border-t border-slate-200 dark:border-[#454B53]">
        <button
          type="button"
          className="border border-slate-300 dark:border-[#384250] text-slate-600 dark:text-[#A8B0BA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#252C36] rounded-lg py-1.5 px-3 text-xs font-semibold transition-all active:scale-95"
          onClick={handleReset}
        >
          Reset
        </button>

        <button
          type="submit"
          className="bg-[#4C9FE8] hover:bg-[#398BD5] text-white font-bold rounded-lg py-1.5 px-3.5 text-xs shadow transition-all active:scale-95"
        >
          Apply
        </button>
      </div>
    </form>
  );
};
