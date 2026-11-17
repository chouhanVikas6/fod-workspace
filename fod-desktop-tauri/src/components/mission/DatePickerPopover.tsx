import React, { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface DatePickerPopoverProps {
  mode: "date" | "month";
  value: string; // "YYYY-MM-DD" or "YYYY-MM"
  onChange: (val: string) => void;
  placeholder?: string;
  isDark?: boolean;
  compact?: boolean;
}

export const DatePickerPopover: React.FC<DatePickerPopoverProps> = ({
  mode,
  value,
  onChange,
  placeholder,
  isDark = false,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const now = new Date();
  const initialYear = value ? Number(value.slice(0, 4)) || now.getFullYear() : now.getFullYear();
  const initialMonth = value && value.length >= 7 ? (Number(value.slice(5, 7)) || 1) - 1 : now.getMonth();

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  useEffect(() => {
    if (value) {
      const y = Number(value.slice(0, 4));
      const m = Number(value.slice(5, 7));
      if (y) setViewYear(y);
      if (m >= 1 && m <= 12) setViewMonth(m - 1);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutside, true);
    document.addEventListener("touchstart", handleOutside, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside, true);
      document.removeEventListener("touchstart", handleOutside, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const formatLabel = () => {
    if (!value) return placeholder || (mode === "month" ? "Select month" : "Select date");
    if (mode === "month") {
      const y = value.slice(0, 4);
      const mIdx = Number(value.slice(5, 7)) - 1;
      return `${MONTHS_SHORT[mIdx] ?? ""} ${y}`;
    }
    return value;
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-1 rounded-md border text-left transition-colors cursor-pointer ${
          compact ? "px-1.5 py-1 text-[10px]" : "px-2 py-1 text-[11px]"
        } ${
          open
            ? "border-[#4C9FE8]"
            : isDark
            ? "border-[#39404B] hover:border-[#4B5563]"
            : "border-slate-200 hover:border-slate-300"
        } ${
          isDark
            ? "bg-[#1A1E24] text-slate-100"
            : "bg-white text-slate-800"
        }`}
      >
        <span className={`truncate ${!value ? "text-slate-400 dark:text-slate-500" : "font-mono"}`}>
          {formatLabel()}
        </span>
        <Calendar size={compact ? 10 : 12} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div
          className={`absolute left-0 top-full mt-1.5 w-[224px] rounded-xl border p-2.5 shadow-2xl z-50 select-none ${
            isDark
              ? "bg-[#1C222A] border-[#3B4452] text-slate-100"
              : "bg-white border-slate-200 text-slate-800"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => (mode === "month" ? setViewYear((y) => y - 1) : prevMonth())}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-[#2A313C] cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-bold">
              {mode === "month" ? viewYear : `${MONTHS_SHORT[viewMonth]} ${viewYear}`}
            </span>
            <button
              type="button"
              onClick={() => (mode === "month" ? setViewYear((y) => y + 1) : nextMonth())}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-[#2A313C] cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {mode === "month" ? (
            <div className="grid grid-cols-3 gap-1">
              {MONTHS_SHORT.map((mName, idx) => {
                const mVal = `${viewYear}-${String(idx + 1).padStart(2, "0")}`;
                const selected = value === mVal;
                return (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => {
                      onChange(mVal);
                      setOpen(false);
                    }}
                    className={`py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      selected
                        ? "bg-[#4C9FE8] text-white"
                        : isDark
                        ? "hover:bg-[#2A313C] text-slate-200"
                        : "hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    {mName}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-0.5 mb-1 text-center">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    {w}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {Array.from({ length: firstDayOffset }).map((_, i) => (
                  <span key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, idx) => {
                  const day = idx + 1;
                  const dVal = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const selected = value === dVal;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        onChange(dVal);
                        setOpen(false);
                      }}
                      className={`h-6 rounded-md text-[11px] font-mono transition-colors cursor-pointer ${
                        selected
                          ? "bg-[#4C9FE8] text-white font-bold"
                          : isDark
                          ? "hover:bg-[#2A313C] text-slate-200"
                          : "hover:bg-slate-100 text-slate-700"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
