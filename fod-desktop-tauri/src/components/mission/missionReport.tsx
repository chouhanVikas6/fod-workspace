import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { config } from "@/config/clientConfig";
import { updateDetailViewFod } from "@/store/actions/FodDetailedView";
import { jsPDF } from "jspdf";
import { RxDownload, RxFileText } from "react-icons/rx";

function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !isFinite(ms) || ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function extractLatLon(fod: any): { lat: number; lon: number } | null {
  const loc = fod?._loc ?? fod?.location;
  if (!loc) return null;
  if (typeof loc.lat === "number" && typeof loc.lon === "number") {
    return { lat: loc.lat, lon: loc.lon };
  }
  if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const [lon, lat] = loc.coordinates;
    if (typeof lat === "number" && typeof lon === "number") {
      return { lat, lon };
    }
  }
  return null;
}

const STATUS_BADGE: Record<string, string> = {
  NEW: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  ACCEPTED: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  CLEARED: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  REJECTED: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
};

const CLASS_COLORS: Record<string, string> = {
  Metallic: "bg-rose-500",
  "Non-Metallic": "bg-blue-500",
  Organic: "bg-emerald-500",
  "Rocks/Asphalt": "bg-amber-500",
  "Rocks/Ashpalt": "bg-amber-500",
};

const PAGE_SIZE = 60;

const MissionReport: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const fods = useSelector((state: RootState) => state.FodReducer.fods) as any[];
  const missionState = useSelector((state: RootState) => state.MissionState);
  const isDark = useSelector((state: RootState) => state.theme.theme === "dark");

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const missionNumber = missionState?.missionNumber;
  const displayId = missionState?.displayId;
  const missionTitle = displayId ? `Mission #${displayId}` : `Mission ${missionNumber ?? "—"}`;

  // Aggregate FOD Summary
  const summary = useMemo(() => {
    let pending = 0;
    let accepted = 0;
    let cleared = 0;
    let rejected = 0;
    let sizeSum = 0;
    let sizeCount = 0;
    let minSize = Infinity;
    let maxSize = -Infinity;

    const classCounts: Record<string, number> = {};
    const camSet = new Set<string>();
    const points: Array<{ lat: number; lon: number; status: string }> = [];

    for (let i = 0; i < fods.length; i++) {
      const f = fods[i];
      const st = f?.groupStatus || f?.status || "NEW";
      if (st === "ACCEPTED") accepted++;
      else if (st === "CLEARED") cleared++;
      else if (st === "REJECTED") rejected++;
      else pending++;

      const cls = f?.class || f?.className || f?.class_name || "Unknown";
      classCounts[cls] = (classCounts[cls] || 0) + 1;

      const cam = f?.camId || f?.cam_id;
      if (cam) camSet.add(String(cam));

      const sz = Number(f?.size);
      if (isFinite(sz) && sz > 0) {
        sizeSum += sz;
        sizeCount++;
        if (sz < minSize) minSize = sz;
        if (sz > maxSize) maxSize = sz;
      }

      const pt = extractLatLon(f);
      if (pt && isFinite(pt.lat) && isFinite(pt.lon) && (pt.lat !== 0 || pt.lon !== 0)) {
        points.push({ lat: pt.lat, lon: pt.lon, status: st });
      }
    }

    const classEntries = Object.entries(classCounts).sort((a, b) => b[1] - a[1]);

    return {
      total: fods.length,
      pending,
      accepted,
      cleared,
      rejected,
      avgSize: sizeCount > 0 ? sizeSum / sizeCount : 0,
      minSize: sizeCount > 0 ? minSize : 0,
      maxSize: sizeCount > 0 ? maxSize : 0,
      cameraCount: camSet.size,
      classEntries,
      points,
    };
  }, [fods]);

  // Spatial Heatmap bounds & peak cell
  const heatmapMeta = useMemo(() => {
    const pts = summary.points;
    if (pts.length === 0) {
      return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0, peakCount: 0, cols: 48, rows: 24 };
    }
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    const cols = 48;
    const rows = 24;
    const latSpan = Math.max(1e-6, maxLat - minLat);
    const lonSpan = Math.max(1e-6, maxLon - minLon);
    const grid = new Uint32Array(cols * rows);
    let peakCount = 0;

    for (const p of pts) {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(((p.lon - minLon) / lonSpan) * (cols - 1))));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(((maxLat - p.lat) / latSpan) * (rows - 1))));
      const idx = cy * cols + cx;
      grid[idx] += 1;
      if (grid[idx] > peakCount) peakCount = grid[idx];
    }

    return { minLat, maxLat, minLon, maxLon, peakCount, cols, rows, grid };
  }, [summary.points]);

  // Render canvas heatmap
  useEffect(() => {
    const canvas = heatmapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = isDark ? "#11161d" : "#f8fafc";
    ctx.fillRect(0, 0, w, h);

    // Subtle grid lines
    ctx.strokeStyle = isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(100, 116, 139, 0.12)";
    ctx.lineWidth = 1;
    const stepX = w / 8;
    const stepY = h / 4;
    for (let x = stepX; x < w; x += stepX) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = stepY; y < h; y += stepY) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!heatmapMeta.grid || heatmapMeta.peakCount === 0) return;

    const { cols, rows, grid, peakCount } = heatmapMeta;
    const cellW = w / cols;
    const cellH = h / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = grid[r * cols + c];
        if (val === 0) continue;
        const t = Math.min(1, Math.sqrt(val / peakCount));
        // Color ramp: blue -> cyan -> emerald -> amber -> red
        let color = "rgba(59, 130, 246, 0.45)";
        if (t > 0.8) color = "rgba(239, 68, 68, 0.85)";
        else if (t > 0.6) color = "rgba(245, 158, 11, 0.78)";
        else if (t > 0.4) color = "rgba(16, 185, 129, 0.68)";
        else if (t > 0.2) color = "rgba(6, 182, 212, 0.58)";

        ctx.fillStyle = color;
        ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }, [heatmapMeta, isDark]);

  // Filtered thumbnails
  const filteredFods = useMemo(() => {
    if (statusFilter === "ALL") return fods;
    return fods.filter((f) => (f?.groupStatus || f?.status || "NEW") === statusFilter);
  }, [fods, statusFilter]);

  const visibleFods = useMemo(
    () => filteredFods.slice(0, visibleCount),
    [filteredFods, visibleCount]
  );

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentW = pageW - margin * 2;
    let y = 14;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - 14) {
        doc.addPage();
        y = 14;
      }
    };

    // Header
    doc.setFillColor(30, 58, 138);
    doc.roundedRect(margin, y, contentW, 22, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(`${missionTitle} Report`, margin + 5, y + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Mission ID: ${missionNumber ?? "—"}   |   Status: ${statusText}   |   Generated: ${new Date().toLocaleString()}`,
      margin + 5,
      y + 16
    );
    y += 28;

    // 1. Mission Summary
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("1. MISSION SUMMARY", margin, y);
    y += 4;

    const missionCols = [
      { label: "Mission", value: missionTitle },
      { label: "Duration", value: formatDuration(missionState?.duration) },
      { label: "Total FODs", value: summary.total.toLocaleString() },
      { label: "Active Cameras", value: String(summary.cameraCount || "—") },
    ];
    const colW = (contentW - 9) / 4;
    missionCols.forEach((col, i) => {
      const x = margin + i * (colW + 3);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, colW, 16, 2, 2, "FD");
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(col.label, x + 3, y + 5.5);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(col.value, x + 3, y + 12.5);
    });
    y += 22;

    // 2. FOD Summary
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("2. FOD SUMMARY", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(
      `Avg Size: ${summary.avgSize > 0 ? `${summary.avgSize.toFixed(1)} mm` : "—"} (${
        summary.minSize > 0 ? `${summary.minSize.toFixed(0)}–${summary.maxSize.toFixed(0)} mm` : "—"
      })`,
      pageW - margin,
      y,
      { align: "right" }
    );
    y += 4;

    const statusBoxes = [
      { label: "Pending", value: summary.pending, rgb: [217, 119, 6] as const },
      { label: "Confirmed", value: summary.accepted, rgb: [5, 150, 105] as const },
      { label: "Cleared", value: summary.cleared, rgb: [37, 99, 235] as const },
      { label: "False", value: summary.rejected, rgb: [225, 29, 72] as const },
    ];
    statusBoxes.forEach((box, i) => {
      const x = margin + i * (colW + 3);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, colW, 16, 2, 2, "FD");
      doc.setTextColor(box.rgb[0], box.rgb[1], box.rgb[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(box.label, x + 3, y + 5.5);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.text(box.value.toLocaleString(), x + 3, y + 12.5);
    });
    y += 21;

    // Classification breakdown
    if (summary.classEntries.length > 0) {
      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Classification Breakdown", margin, y);
      y += 4;

      for (const [cls, cnt] of summary.classEntries) {
        ensureSpace(9);
        const pct = summary.total > 0 ? Math.round((cnt / summary.total) * 100) : 0;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(cls, margin, y + 3);
        doc.setTextColor(100, 116, 139);
        doc.text(`${cnt.toLocaleString()} (${pct}%)`, pageW - margin, y + 3, { align: "right" });
        doc.setFillColor(226, 232, 240);
        doc.rect(margin, y + 4.5, contentW, 2, "F");
        doc.setFillColor(59, 130, 246);
        doc.rect(margin, y + 4.5, (contentW * pct) / 100, 2, "F");
        y += 8.5;
      }
      y += 3;
    }

    // 3. Spatial Heatmap
    ensureSpace(64);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("3. SPATIAL FOD DENSITY HEATMAP", margin, y);
    y += 3.5;

    const canvas = heatmapCanvasRef.current;
    if (canvas && summary.points.length > 0) {
      const imgData = canvas.toDataURL("image/png");
      const imgH = 48;
      doc.setDrawColor(203, 213, 225);
      doc.rect(margin, y, contentW, imgH);
      doc.addImage(imgData, "PNG", margin, y, contentW, imgH);
      y += imgH + 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `SW: ${heatmapMeta.minLat.toFixed(5)}, ${heatmapMeta.minLon.toFixed(5)}   |   Peak cell: ${heatmapMeta.peakCount} FODs`,
        margin,
        y
      );
      doc.text(
        `NE: ${heatmapMeta.maxLat.toFixed(5)}, ${heatmapMeta.maxLon.toFixed(5)}`,
        pageW - margin,
        y,
        { align: "right" }
      );
      y += 7;
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text("No geo-located FOD coordinates available for heatmap.", margin, y + 6);
      y += 12;
    }

    // 4. Detections Table (top 30)
    if (fods.length > 0) {
      ensureSpace(22);
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`4. FOD DETECTIONS (Showing ${Math.min(30, fods.length)} of ${fods.length})`, margin, y);
      y += 4;

      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, contentW, 6.5, "F");
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(8);
      doc.text("Group", margin + 2, y + 4.5);
      doc.text("Class", margin + 26, y + 4.5);
      doc.text("Size", margin + 68, y + 4.5);
      doc.text("Status", margin + 92, y + 4.5);
      doc.text("Coordinates", margin + 124, y + 4.5);
      y += 7;

      const sample = fods.slice(0, 30);
      doc.setFont("helvetica", "normal");
      for (const f of sample) {
        ensureSpace(6);
        const pt = extractLatLon(f);
        const coords = pt ? `${pt.lat.toFixed(5)}, ${pt.lon.toFixed(5)}` : "—";
        const st = f?.groupStatus || f?.status || "NEW";
        const cls = f?.class || f?.className || f?.class_name || "Unknown";
        const sz = f?.size ? `${Number(f.size).toFixed(1)} mm` : "—";

        doc.setTextColor(15, 23, 42);
        doc.text(`#${f.groupId}`, margin + 2, y + 4);
        doc.text(String(cls).slice(0, 20), margin + 26, y + 4);
        doc.text(sz, margin + 68, y + 4);
        doc.text(String(st), margin + 92, y + 4);
        doc.text(coords, margin + 124, y + 4);
        doc.setDrawColor(241, 245, 249);
        doc.line(margin, y + 5.5, pageW - margin, y + 5.5);
        y += 5.5;
      }
    }

    doc.save(`mission-${displayId ?? missionNumber ?? "report"}-report.pdf`);
  };

  const cardBg = isDark
    ? "bg-[#22262B] border-[#353A42]"
    : "bg-white border-slate-200 shadow-xs";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";

  const statusText = missionState?.isActive
    ? missionState?.isPause
      ? "PAUSED"
      : "ACTIVE"
    : missionState?.isExplore
    ? "EXPLORE"
    : "COMPLETED";

  return (
    <div
      className={`h-full w-full overflow-y-auto p-5 space-y-5 select-none ${
        isDark ? "bg-[#1A1D22] text-slate-100" : "bg-[#F4F6F9] text-slate-900"
      }`}
    >
      {/* Top Header */}
      <div className={`rounded-2xl border p-5 flex flex-wrap items-center justify-between gap-4 ${cardBg}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-500 flex items-center justify-center">
            <RxFileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight">{missionTitle} Report</h1>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500">
                {statusText}
              </span>
            </div>
            <p className={`text-xs mt-0.5 font-mono ${mutedText}`}>
              Mission ID: {missionNumber ?? "—"} · Generated {new Date().toLocaleString()}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownloadPdf}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#4C9FE8] hover:bg-[#3B91DC] text-white text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95"
        >
          <RxDownload className="w-4 h-4" />
          <span>Download PDF</span>
        </button>
      </div>

      {/* 1. Mission Summary */}
      <section className="space-y-2.5">
        <h2 className={`text-xs font-bold uppercase tracking-wider ${mutedText}`}>
          1. Mission Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className={`rounded-xl border p-4 ${cardBg}`}>
            <div className={`text-xs font-medium ${mutedText}`}>Mission</div>
            <div className="text-lg font-bold mt-1 font-mono">{missionTitle}</div>
          </div>
          <div className={`rounded-xl border p-4 ${cardBg}`}>
            <div className={`text-xs font-medium ${mutedText}`}>Duration</div>
            <div className="text-lg font-bold mt-1 font-mono">
              {formatDuration(missionState?.duration)}
            </div>
          </div>
          <div className={`rounded-xl border p-4 ${cardBg}`}>
            <div className={`text-xs font-medium ${mutedText}`}>Total FODs</div>
            <div className="text-lg font-bold mt-1 font-mono text-amber-500">
              {summary.total.toLocaleString()}
            </div>
          </div>
          <div className={`rounded-xl border p-4 ${cardBg}`}>
            <div className={`text-xs font-medium ${mutedText}`}>Active Cameras</div>
            <div className="text-lg font-bold mt-1 font-mono">
              {summary.cameraCount || "—"}
            </div>
          </div>
        </div>
      </section>

      {/* 2. FOD Summary */}
      <section className="space-y-2.5">
        <h2 className={`text-xs font-bold uppercase tracking-wider ${mutedText}`}>
          2. FOD Summary
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Status Breakdown */}
          <div className={`rounded-2xl border p-5 space-y-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Status Breakdown</span>
              <span className={`text-xs font-mono ${mutedText}`}>
                Avg Size: {summary.avgSize > 0 ? `${summary.avgSize.toFixed(1)} mm` : "—"} (
                {summary.minSize > 0 ? `${summary.minSize.toFixed(0)}–${summary.maxSize.toFixed(0)} mm` : "—"})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl p-3 bg-amber-500/10 border border-amber-500/20">
                <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Pending</div>
                <div className="text-xl font-bold font-mono mt-0.5">{summary.pending}</div>
              </div>
              <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Confirmed</div>
                <div className="text-xl font-bold font-mono mt-0.5">{summary.accepted}</div>
              </div>
              <div className="rounded-xl p-3 bg-blue-500/10 border border-blue-500/20">
                <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Cleared</div>
                <div className="text-xl font-bold font-mono mt-0.5">{summary.cleared}</div>
              </div>
              <div className="rounded-xl p-3 bg-rose-500/10 border border-rose-500/20">
                <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">False</div>
                <div className="text-xl font-bold font-mono mt-0.5">{summary.rejected}</div>
              </div>
            </div>
          </div>

          {/* Classification Breakdown */}
          <div className={`rounded-2xl border p-5 space-y-3 ${cardBg}`}>
            <span className="text-sm font-bold block">Classification Breakdown</span>
            {summary.classEntries.length === 0 ? (
              <p className={`text-xs italic py-4 text-center ${mutedText}`}>
                No FOD detections recorded yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {summary.classEntries.map(([cls, cnt]) => {
                  const pct = summary.total > 0 ? Math.round((cnt / summary.total) * 100) : 0;
                  const barColor = CLASS_COLORS[cls] || "bg-indigo-500";
                  return (
                    <div key={cls} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold">{cls}</span>
                        <span className={`font-mono ${mutedText}`}>
                          {cnt.toLocaleString()} ({pct}%)
                        </span>
                      </div>
                      <div className={`h-2 w-full rounded-full overflow-hidden ${isDark ? "bg-[#15181C]" : "bg-slate-100"}`}>
                        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Spatial FOD Density Heatmap & Thumbnails */}
      <section className="space-y-4">
        <h2 className={`text-xs font-bold uppercase tracking-wider ${mutedText}`}>
          3. Spatial FOD Heatmap &amp; Thumbnails
        </h2>

        {/* Heatmap */}
        <div className={`rounded-2xl border p-5 space-y-3 ${cardBg}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">Spatial Density Heatmap</h3>
              <p className={`text-xs ${mutedText}`}>
                {summary.points.length.toLocaleString()} geo-located detections · Peak cell:{" "}
                <span className="font-mono font-semibold">{heatmapMeta.peakCount}</span> FODs
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className={mutedText}>Low</span>
              <div className="flex h-2.5 w-24 rounded-full overflow-hidden">
                <div className="flex-1 bg-blue-500/60" />
                <div className="flex-1 bg-cyan-500/70" />
                <div className="flex-1 bg-emerald-500/80" />
                <div className="flex-1 bg-amber-500/90" />
                <div className="flex-1 bg-rose-500" />
              </div>
              <span className={mutedText}>High</span>
            </div>
          </div>

          <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 dark:border-[#353A42]">
            <canvas
              ref={heatmapCanvasRef}
              width={960}
              height={260}
              className="w-full h-52 block"
            />
            {summary.points.length === 0 && (
              <div className={`absolute inset-0 flex items-center justify-center text-xs ${mutedText}`}>
                No geo-located FOD coordinates available for heatmap.
              </div>
            )}
          </div>

          {summary.points.length > 0 && (
            <div className={`flex justify-between text-[11px] font-mono ${mutedText}`}>
              <span>
                SW: {heatmapMeta.minLat.toFixed(5)}, {heatmapMeta.minLon.toFixed(5)}
              </span>
              <span>
                NE: {heatmapMeta.maxLat.toFixed(5)}, {heatmapMeta.maxLon.toFixed(5)}
              </span>
            </div>
          )}
        </div>

    
      </section>
    </div>
  );
};

export default MissionReport;
