
import React, { useEffect, useState, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { SlidersHorizontal } from "lucide-react";

import {
  set_Class_Size,
  set_SortBy,
  setDashboardStatus,
} from "@/store/slices/fodReducer-slice";

import { RootState } from "@/store";
import { useTranslations } from "@/hooks/useTranslations";
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
  const t = useTranslations("fod");

  const { sortby } = useSelector(
    (state: RootState) => state.FodReducer.filters,
  );

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs font-medium text-slate-500 dark:text-[#A8B0BA]">
        {t("sort-by")}
      </span>

      <div className="relative">
        <select
          onChange={(e) => dispatch(set_SortBy(e.target.value))}
          value={sortby}
          className="bg-white dark:bg-[#181D24] text-slate-800 dark:text-white border border-slate-300 dark:border-[#2B323D] hover:border-slate-400 dark:hover:border-[#3E4755] rounded-lg pl-3 pr-8 py-1.5 text-xs font-semibold appearance-none cursor-pointer shadow-xs focus:outline-none focus:border-[#388AEB] transition-colors"
        >
          <option value="latest">{t("latest")}</option>
          <option value="oldest">{t("oldest")}</option>
          <option value="biggestTosmallest">{t("size-largest")}</option>
          <option value="smallestTobiggest">{t("size-smallest")}</option>
          <option value="nearestFirst">{t("distance-nearest")}</option>
        </select>

        <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center px-2 text-slate-500 dark:text-[#7E8691]">
          <RxChevronDown className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
};

// FOD STATUS TABS
const FodStatusTabs = () => {
  const dispatch = useDispatch();
  const t = useTranslations("fod");

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
        {t("fod-left")} ({String(leftCount).padStart(2, "0")})
      </button>

      <button
        type="button"
        onClick={() => dispatch(setDashboardStatus("ACCEPTED"))}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
          !isLeftActive ? activeTabStyle : inactiveTabStyle
        }`}
      >
        {t("fod-found")} ({String(foundCount).padStart(2, "0")})
      </button>
    </div>
  );
};

// FILTERS
const Filters = () => {
  const dispatch = useDispatch();
  const t = useTranslations("fod");
  const fods = useSelector((state: RootState) => state.FodReducer.fods) as any[];

  const fodSizeBounds = useMemo(() => {
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < fods.length; i++) {
      const sz = Number(fods[i]?.size);
      if (Number.isFinite(sz) && sz >= 0) {
        if (sz < minVal) minVal = sz;
        if (sz > maxVal) maxVal = sz;
      }
    }
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
      return { minSize: 0, maxSize: 100 };
    }
    const flooredMin = Math.floor(minVal);
    const ceiledMax = Math.ceil(maxVal);
    return {
      minSize: flooredMin,
      maxSize: ceiledMax > flooredMin ? ceiledMax : flooredMin + 1,
    };
  }, [fods]);

  const [formData, setFormData] = useState({
    Metallic: true,
    "Rocks/Ashpalt": true,
    Organic: true,
    "Non-Metallic": true,
  });

  const [isToolTipOpen, setToolTipVisibility] = useState(false);
  const [rangeValue, setRangeValue] = useState<number>(fodSizeBounds.minSize);
  const [hasCustomSize, setHasCustomSize] = useState(false);

  useEffect(() => {
    if (!hasCustomSize) {
      setRangeValue(fodSizeBounds.minSize);
    } else {
      setRangeValue((prev) =>
        Math.min(fodSizeBounds.maxSize, Math.max(fodSizeBounds.minSize, prev))
      );
    }
  }, [fodSizeBounds.minSize, fodSizeBounds.maxSize, hasCustomSize]);

  const classes = [
    { name: "Metallic Objects", value: "Metallic" },
    { name: "Rocks/Ashpalt Chunks", value: "Rocks/Ashpalt" },
    { name: "Organic Objects", value: "Organic" },
    { name: "Non-metallic objects", value: "Non-Metallic" },
  ];

  const handleRangeChange = (nextVal: number) => {
    if (!Number.isFinite(nextVal)) return;
    setHasCustomSize(true);
    setRangeValue(nextVal);
  };

  const handleChange = (e: any) => {
    const { value, checked } = e.target;

    setFormData((prevState) => ({
      ...prevState,
      [value]: checked,
    }));
  };

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
        <span>{t("filter")}</span>
      </button>

      {isToolTipOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-32px)] bg-white dark:bg-[#1C222A] border border-slate-200 dark:border-[#454B53] text-slate-800 dark:text-white rounded-xl shadow-2xl p-4 z-50 animate-in fade-in duration-150">
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
              setHasCustomSize(false);
              setRangeValue(fodSizeBounds.minSize);

              dispatch(
                set_Class_Size({
                  classes: Object.keys(defaultClasses),
                  minSize: fodSizeBounds.minSize,
                }),
              );

              setToolTipVisibility(false);
            }}
            rangeValue={rangeValue}
            sizeBounds={fodSizeBounds}
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
  sizeBounds,
  handleRangeChange,
  classes,
  formData,
  handleChange,
  handleApply,
  handleReset,
}: any) => {
  const minBound = sizeBounds?.minSize ?? 0;
  const maxBound = sizeBounds?.maxSize ?? 100;
  const clampedValue = Math.min(maxBound, Math.max(minBound, Number(rangeValue) || minBound));

  return (
    <form onSubmit={handleApply} className="w-full space-y-3">
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-[#454B53]">
        <h3 className="text-xs font-bold text-slate-900 dark:text-[#D9DDE2] uppercase tracking-wider">
          Filter FOD Classes
        </h3>

        <span className="text-xs font-mono font-semibold text-[#287FC5] dark:text-[#4CA5FF]">
          Min: {clampedValue} mm
        </span>
      </div>

      <div className="py-1 space-y-1">
        <input
          type="range"
          min={minBound}
          max={maxBound}
          step={1}
          value={clampedValue}
          onChange={(e) => handleRangeChange(Number(e.target.value))}
          className="w-full accent-[#4C9FE8] cursor-pointer"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500">
          <span>{minBound} mm</span>
          <span>{maxBound} mm</span>
        </div>
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
