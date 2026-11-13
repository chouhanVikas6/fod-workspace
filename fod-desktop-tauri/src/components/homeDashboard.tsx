import React, { useState } from "react";
import { useSelector } from "react-redux";

import { RootState } from "@/store";
import FodPanel from "@/components/fodPanel/fodPanel";

type MobileTab = "fod" | "mission" | "alerts";

const HomeDashboard = () => {
  const [activeTab, setActiveTab] = useState<MobileTab>("fod");

  const isDark = useSelector(
    (state: RootState) => state.theme.theme === "dark"
  );

  const missionNumber = useSelector(
    (state: RootState) => state.MissionState?.missionNumber
  );

  // Live FOD data from Redux
  const fods = useSelector((state: RootState) => state.FodReducer.fods);

  // Live FOD counters
  const fodDetected = fods.length;

  const fodLeft = fods.filter((fod) => fod.groupStatus === "NEW").length;

  const fodFound = fods.filter((fod) => fod.groupStatus === "ACCEPTED").length;

  const fodRejected = fods.filter(
    (fod) => fod.groupStatus === "REJECTED"
  ).length;

  const fodCleared = fods.filter((fod) => fod.groupStatus === "CLEARED").length;

  // Theme styles
  const panelBg = isDark ? "bg-[#292D33]" : "bg-white";
  const headerBg = isDark ? "bg-[#353A42]" : "bg-[#F0F1F3]";
  const cardBg = isDark ? "bg-[#22262B]" : "bg-[#F7F8F9]";

  const borderColor = isDark ? "border-[#454B53]" : "border-[#E1E3E6]";

  const primaryText = isDark ? "text-[#D9DDE2]" : "text-[#252A31]";

  const secondaryText = isDark ? "text-[#A8B0BA]" : "text-[#737B85]";

  const Stat = ({
    label,
    value,
    color,
  }: {
    label: string;
    value: string | number;
    color?: string;
  }) => (
    <div className={`min-w-0 rounded-md p-3 ${cardBg}`}>
      <p className={`text-xs truncate ${secondaryText}`}>{label}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          color || primaryText
        }`}
      >
        {value}
      </p>
    </div>
  );

  return (
    <div
      className={`flex flex-col h-full w-full min-h-0 min-w-0 overflow-hidden p-2.5 sm:p-3 ${primaryText}`}
    >
      {/* MOBILE / TABLET (< 900px): Top Summary & Segmented Tab Navigation */}
      <div className="mb-2.5 flex flex-col gap-2 shrink-0 min-[900px]:hidden">
        {/* Compact Live Status Strip */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${panelBg} ${borderColor}`}
        >
          <div className="flex items-center gap-2">
            <span className={`text-[11px] uppercase font-medium ${secondaryText}`}>
              Mission:
            </span>
            <span className="text-xs font-bold tabular-nums">
              {missionNumber || "—"}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs tabular-nums">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#E5A12B]" />
              <span className={secondaryText}>Detected:</span>
              <span className="font-semibold text-[#E5A12B]">{fodDetected}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#4C9FE8]" />
              <span className={secondaryText}>Left:</span>
              <span className="font-semibold text-[#4C9FE8]">{fodLeft}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#00B957]" />
              <span className={secondaryText}>Cleared:</span>
              <span className="font-semibold text-[#00B957]">{fodCleared}</span>
            </div>
          </div>
        </div>

        {/* Clickable Segmented Tabs */}
        <div
          className={`grid grid-cols-3 gap-1 rounded-lg border p-1 ${
            isDark ? "bg-[#1E2227] border-[#454B53]" : "bg-[#EBEDF0] border-[#E1E3E6]"
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab("fod")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 px-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "fod"
                ? `${panelBg} ${primaryText} shadow-sm`
                : `${secondaryText} hover:${primaryText}`
            }`}
          >
            <span>FOD Overview</span>
            {fodLeft > 0 && (
              <span className="rounded-full bg-[#4C9FE8]/20 px-1.5 py-0.2 text-[10px] font-bold text-[#4C9FE8]">
                {fodLeft}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("mission")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 px-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "mission"
                ? `${panelBg} ${primaryText} shadow-sm`
                : `${secondaryText} hover:${primaryText}`
            }`}
          >
            <span>Mission Control</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("alerts")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 px-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "alerts"
                ? `${panelBg} ${primaryText} shadow-sm`
                : `${secondaryText} hover:${primaryText}`
            }`}
          >
            <span>Alerts</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#E5A12B]" />
          </button>
        </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="grid flex-1 min-h-0 min-w-0 grid-cols-1 gap-3 min-[900px]:grid-cols-[240px_minmax(0,1fr)_250px] xl:grid-cols-[250px_minmax(0,1fr)_280px]">
        {/* LEFT: Mission overview */}
        <section
          className={`${
            activeTab === "mission" ? "flex" : "hidden"
          } min-[900px]:flex flex-col min-h-0 min-w-0 overflow-hidden rounded-lg border ${panelBg} ${borderColor}`}
        >
          <div
            className={`shrink-0 border-b px-4 py-3 ${headerBg} ${borderColor}`}
          >
            <h2 className="text-sm font-semibold">MISSION CONTROL</h2>
            <p className={`mt-0.5 text-xs ${secondaryText}`}>
              Mission overview
            </p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 p-3">
            {/* Active mission */}
            <div>
              <p className={`text-xs ${secondaryText}`}>Active Mission</p>
              <p className="mt-1 text-lg font-semibold">
                {missionNumber || "—"}
              </p>
            </div>

            {/* FOD statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 min-[900px]:grid-cols-2 gap-2">
              <Stat
                label="FOD Detected"
                value={fodDetected}
                color="text-[#E5A12B]"
              />
              <Stat
                label="FOD Left"
                value={fodLeft}
                color="text-[#4C9FE8]"
              />
              <Stat
                label="FOD Found"
                value={fodFound}
                color="text-[#00B957]"
              />
              <Stat
                label="False FODs"
                value={fodRejected}
                color="text-[#D51F32]"
              />
              <Stat
                label="FOD Cleared"
                value={fodCleared}
                color="text-[#00B957]"
              />
              <Stat label="Alerts" value="—" color="text-[#E5A12B]" />
            </div>

            {/* Mission progress */}
            <div className={`border-t pt-3 ${borderColor}`}>
              <h3 className="mb-3 text-xs font-semibold">MISSION PROGRESS</h3>

              <div className="flex items-center justify-between text-xs">
                <span className={secondaryText}>Waypoints completed</span>
                <span>— / —</span>
              </div>

              <div
                className={`mt-2 h-2 overflow-hidden rounded-full ${
                  isDark ? "bg-[#454B53]" : "bg-[#E5E7EB]"
                }`}
              >
                <div className="h-full w-0 rounded-full bg-[#00B957]" />
              </div>
            </div>

            {/* Quick stats */}
            <div className={`border-t pt-3 ${borderColor}`}>
              <h3 className="mb-3 text-xs font-semibold">QUICK STATS</h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className={secondaryText}>Mission duration</span>
                  <span>—</span>
                </div>

                <div className="flex justify-between">
                  <span className={secondaryText}>Active alerts</span>
                  <span>—</span>
                </div>
              </div>
            </div>

            {/* Connected devices */}
            <div className={`border-t pt-3 ${borderColor}`}>
              <h3 className="mb-3 text-xs font-semibold">CONNECTED DEVICES</h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={secondaryText}>CAR</span>
                  <span className={secondaryText}>Not connected</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className={secondaryText}>Camera</span>
                  <span className={secondaryText}>Not connected</span>
                </div>
              </div>
            </div>

            {/* Camera focus */}
            <div className={`border-t pt-3 ${borderColor}`}>
              <h3 className="mb-2 text-xs font-semibold">CAMERA FOCUS</h3>

              <div
                className={`flex h-28 items-center justify-center rounded-md text-xs ${
                  isDark
                    ? "bg-[#22262B] text-[#A8B0BA]"
                    : "bg-[#F2F3F5] text-[#737B85]"
                }`}
              >
                Camera preview placeholder
              </div>
            </div>
          </div>
        </section>

        {/* CENTRE: FOD overview */}
        <section
          className={`${
            activeTab === "fod" ? "flex" : "hidden"
          } min-[900px]:flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border ${panelBg} ${borderColor}`}
        >
          <div
            className={`shrink-0 border-b px-4 py-3 ${headerBg} ${borderColor}`}
          >
            <h2 className="text-sm font-semibold">FOD OVERVIEW</h2>
          </div>

          {/* Existing FOD panel */}
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <FodPanel open={true} />
          </div>
        </section>

        {/* RIGHT: Operational alerts */}
        <section
          className={`${
            activeTab === "alerts" ? "flex" : "hidden"
          } min-[900px]:flex flex-col min-h-0 min-w-0 overflow-hidden rounded-lg border ${panelBg} ${borderColor}`}
        >
          <div
            className={`shrink-0 border-b px-4 py-3 ${headerBg} ${borderColor}`}
          >
            <h2 className="text-sm font-semibold">OPERATIONAL ALERTS</h2>
            <p className={`mt-0.5 text-xs ${secondaryText}`}>
              Recent mission notifications
            </p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 p-3">
            {/* FOD detected */}
            <div
              className={`rounded-md border-l-2 border-[#E5A12B] p-3 ${cardBg}`}
            >
              <p className="text-xs font-semibold text-[#E5A12B]">
                FOD DETECTED
              </p>

              <p className={`mt-1 text-xs ${primaryText}`}>
                A new FOD detection alert will appear here.
              </p>

              <p className={`mt-2 text-[10px] ${secondaryText}`}>Placeholder</p>
            </div>

            {/* Device disconnected */}
            <div
              className={`rounded-md border-l-2 border-[#D51F32] p-3 ${cardBg}`}
            >
              <p className="text-xs font-semibold text-[#D51F32]">
                DEVICE DISCONNECTED
              </p>

              <p className={`mt-1 text-xs ${primaryText}`}>
                Device connection alerts will appear here.
              </p>

              <p className={`mt-2 text-[10px] ${secondaryText}`}>Placeholder</p>
            </div>

            {/* Mission status */}
            <div
              className={`rounded-md border-l-2 border-[#00B957] p-3 ${cardBg}`}
            >
              <p className="text-xs font-semibold text-[#00B957]">
                MISSION STATUS
              </p>

              <p className={`mt-1 text-xs ${primaryText}`}>
                Mission status notifications will appear here.
              </p>

              <p className={`mt-2 text-[10px] ${secondaryText}`}>Placeholder</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default HomeDashboard;