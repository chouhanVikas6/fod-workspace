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

import FilterIcon from "@/assets/images/svgr/filterIcon";

import { RootState } from "@/store";

import { RxChevronDown } from "react-icons/rx";

const FilterBar = () => {
  return (
    <div className="w-full min-w-0 flex flex-wrap items-center justify-between gap-2 mb-4 text-slate-200 select-none shrink-0">
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
      <span className="text-xs font-medium text-[#7E8691]">Sort By:</span>

      <div className="relative">
        <select
          onChange={(e) => dispatch(set_SortBy(e.target.value))}
          value={sortby}
          className="bg-[#181D24] text-white border border-[#2B323D] hover:border-[#3E4755] rounded-lg pl-3 pr-7 py-1.5 text-xs font-semibold appearance-none cursor-pointer shadow-xs focus:outline-none focus:border-[#388AEB] transition-colors"
        >
          <option value="latest">Latest</option>
          <option value="oldest">Oldest</option>
          <option value="biggestTosmallest">Size: Largest</option>
          <option value="smallestTobiggest">Size: Smallest</option>
          <option value="nearestFirst">Distance: Nearest</option>
        </select>

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#7E8691]">
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

  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* FOD Left */}
      <button
        type="button"
        onClick={() => dispatch(setDashboardStatus("NEW"))}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
          isLeftActive
            ? "border-[0px] border-[#1E90FF] bg-[#4C9FE8]/20 text-[#4CA5FF] shadow-xs"
            : "border-[1px] border-[#1A4A58]  text-[#7E8691] hover:text-white"
        }`}
      >
        FOD Left ({String(leftCount).padStart(2, "0")})
      </button>

      {/* FOD Found */}
      <button
        type="button"
        onClick={() => dispatch(setDashboardStatus("ACCEPTED"))}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
          !isLeftActive
            ? "border-[0px] border-[#1E90FF] bg-[#4C9FE8]/20 text-[#4CA5FF] shadow-xs"
            : "border-[1px] border-[#1A4A58] text-[#7E8691] hover:text-white"
        }`}
      >
        FOD Found ({String(foundCount).padStart(2, "0")})
      </button>
    </div>
  );
};

// FILTERS
const Filters = () => {
  const dispatch = useDispatch();

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

    dispatch(set_Class_Size(filter));
    setToolTipVisibility(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setToolTipVisibility(!isToolTipOpen)}
        className={`bg-[#181D24] border rounded-lg px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
          isToolTipOpen
            ? "border-[#1E90FF] text-[#4CA5FF]"
            : "border-[#2B323D] hover:border-[#3E4755] text-slate-300"
        }`}
      >
        <SlidersHorizontal
          size={17}
          strokeWidth={2.2}
          className="shrink-0 text-[#D9DDE2]"
        />
        <span>Filter</span>
      </button>

      {isToolTipOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-32px)] bg-[#1C222A] border border-[#2B323D] text-white rounded-xl shadow-2xl p-4 z-30 animate-in fade-in duration-150">
          <ClassForm
            {...{
              classes,
              formData,
              setFormData,
              handleApply,
              handleChange,
              rangeValue,
              handleRangeChange,
              setToolTipVisibility,
            }}
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
  setToolTipVisibility,
}: any) => {
  const dispatch = useDispatch();

  const { size } = config.filters;

  const handleReset = () => {
    const defaultClasses = {
      Metallic: true,
      "Rocks/Ashpalt": true,
      Organic: true,
      "Non-Metallic": true,
    };

    const selectedClasses = Object.entries(defaultClasses)
      .filter(([_, value]) => value)
      .map(([key]) => key);

    const filter = {
      classes: selectedClasses,
      minSize: rangeValue,
    };

    dispatch(set_Class_Size(filter));
    setToolTipVisibility(false);
  };

  return (
    <form onSubmit={handleApply} className="w-full space-y-3">
      <div className="flex items-center justify-between pb-1.5 border-b border-[#2B323D]">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">
          Filter FOD Classes
        </h3>

        <span className="text-xs font-mono font-semibold text-[#4CA5FF]">
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
              background: "#1E90FF",
              height: "5px",
            },
            active: {
              background: "#353A42",
            },
            thumb: {
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              backgroundColor: "white",
              border: "2px solid #1E90FF",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.4)",
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
                ? "bg-[#13273D] text-[#4CA5FF] border border-[#1E90FF]/40"
                : "bg-[#222832] text-[#7E8691] border border-transparent"
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
                    ? "bg-[#1E90FF] border-[#1E90FF] text-white text-[9px] font-bold"
                    : "border-slate-500"
                }`}
              >
                {formData[classData.value] ? "✓" : ""}
              </span>

              <span>{classData.name}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 justify-end pt-2 border-t border-[#2B323D]">
        <button
          type="button"
          className="border border-[#384250] text-[#7E8691] hover:text-white hover:bg-[#252C36] rounded-lg py-1.5 px-3 text-xs font-semibold transition-all active:scale-95"
          onClick={handleReset}
        >
          Reset
        </button>

        <button
          type="submit"
          className="bg-[#1E90FF] hover:bg-[#187bcd] text-white font-bold rounded-lg py-1.5 px-3.5 text-xs shadow transition-all active:scale-95"
        >
          Apply
        </button>
      </div>
    </form>
  );
};
