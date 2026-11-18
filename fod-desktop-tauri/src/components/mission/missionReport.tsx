import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { jsPDF } from "jspdf";
import { RxDownload } from "react-icons/rx";
import { toast } from "react-toastify";

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

const CLASS_COLORS: Record<string, string> = {
  Metallic: "bg-[#D51F32]",
  "Non-Metallic": "bg-[#4C9FE8]",
  Organic: "bg-[#00B957]",
  "Rocks/Asphalt": "bg-[#E5A12B]",
  "Rocks/Ashpalt": "bg-[#E5A12B]",
};

const SIZE_BUCKET_COUNT = 10;

function formatEdge(val: number): string {
  const rounded = Math.round(val * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getBucketStyle(index: number) {
  if (index <= 2) return { color: "bg-[#4C9FE8]", hex: [76, 159, 232] as const };
  if (index <= 5) return { color: "bg-[#00B957]", hex: [0, 185, 87] as const };
  if (index <= 7) return { color: "bg-[#E5A12B]", hex: [229, 161, 43] as const };
  return { color: "bg-[#D51F32]", hex: [213, 31, 50] as const };
}

const PAGE_SIZE = 60;

interface MissionReportProps {
  fodsOverride?: any[];
  missionNumberOverride?: number | string;
  displayIdOverride?: number | string;
  durationOverride?: number | null;
  statusOverride?: string;
  onClose?: () => void;
}

const MissionReport: React.FC<MissionReportProps> = ({
  fodsOverride,
  missionNumberOverride,
  displayIdOverride,
  durationOverride,
  statusOverride,
  onClose,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const storeFods = useSelector((state: RootState) => state.FodReducer.fods) as any[];
  const missionState = useSelector((state: RootState) => state.MissionState);
  const isDark = useSelector((state: RootState) => state.theme.theme === "dark");

  const fods = fodsOverride ?? storeFods;
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const missionNumber = missionNumberOverride ?? missionState?.missionNumber;
  const displayId = displayIdOverride ?? missionState?.displayId;
  const durationMs = durationOverride !== undefined ? durationOverride : missionState?.duration;
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
    const sizes: number[] = [];
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
        sizes.push(sz);
        if (sz < minSize) minSize = sz;
        if (sz > maxSize) maxSize = sz;
      }

      const pt = extractLatLon(f);
      if (pt && isFinite(pt.lat) && isFinite(pt.lon) && (pt.lat !== 0 || pt.lon !== 0)) {
        points.push({ lat: pt.lat, lon: pt.lon, status: st });
      }
    }

    const classEntries = Object.entries(classCounts).sort((a, b) => b[1] - a[1]);

    const sizeBucketCounts = new Array<number>(SIZE_BUCKET_COUNT).fill(0);
    const lo = sizeCount > 0 ? Math.floor(minSize) : 0;
    const rawHi = sizeCount > 0 ? Math.ceil(maxSize) : SIZE_BUCKET_COUNT;
    const hi = rawHi > lo ? rawHi : lo + SIZE_BUCKET_COUNT;
    const step = (hi - lo) / SIZE_BUCKET_COUNT;

    if (sizeCount > 0) {
      for (let i = 0; i < sizes.length; i++) {
        const idx = Math.min(
          SIZE_BUCKET_COUNT - 1,
          Math.max(0, Math.floor((sizes[i] - lo) / step))
        );
        sizeBucketCounts[idx] += 1;
      }
    }

    const sizeBuckets = sizeBucketCounts.map((count, idx) => {
      const start = lo + idx * step;
      const end = lo + (idx + 1) * step;
      const rangeText = `${formatEdge(start)}–${formatEdge(end)}`;
      const style = getBucketStyle(idx);
      return {
        key: `bin-${idx}`,
        rangeText,
        label: `${rangeText} mm`,
        count,
        pct: sizeCount > 0 ? Math.round((count / sizeCount) * 100) : 0,
        ...style,
      };
    });
    const maxSizeBucketCount = sizeBuckets.reduce((m, b) => Math.max(m, b.count), 0);

    return {
      total: fods.length,
      pending,
      accepted,
      cleared,
      rejected,
      avgSize: sizeCount > 0 ? sizeSum / sizeCount : 0,
      minSize: sizeCount > 0 ? minSize : 0,
      maxSize: sizeCount > 0 ? maxSize : 0,
      sizeCount,
      sizeBuckets,
      maxSizeBucketCount,
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

    // Background matching other screens' inner surface (#22262B dark / #F8FAFC light)
    ctx.fillStyle = isDark ? "#22262B" : "#F8FAFC";
    ctx.fillRect(0, 0, w, h);

    // Subtle grid lines matching systemStats (#383D44 dark / #E2E8F0 light)
    ctx.strokeStyle = isDark ? "#383D44" : "#E2E8F0";
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
        // Color ramp matching app theme palette: #4C9FE8 -> #00B957 -> #E5A12B -> #D51F32
        let color = "rgba(76, 159, 232, 0.55)";
        if (t > 0.8) color = "rgba(213, 31, 50, 0.88)";
        else if (t > 0.6) color = "rgba(229, 161, 43, 0.82)";
        else if (t > 0.35) color = "rgba(0, 185, 87, 0.72)";

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

  const statusText = statusOverride
    ? statusOverride
    : missionState?.isActive
    ? missionState?.isPause
      ? "PAUSED"
      : "ACTIVE"
    : missionState?.isExplore
    ? "EXPLORE"
    : "COMPLETED";

  const handleDownloadPdf = () => {
    try {
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
        { label: "Duration", value: formatDuration(durationMs) },
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
        { label: "Pending", value: summary.pending, rgb: [229, 161, 43] as const },
        { label: "Confirmed", value: summary.accepted, rgb: [0, 185, 87] as const },
        { label: "Cleared", value: summary.cleared, rgb: [76, 159, 232] as const },
        { label: "False", value: summary.rejected, rgb: [213, 31, 50] as const },
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
          doc.setFillColor(76, 159, 232);
          doc.rect(margin, y + 4.5, (contentW * pct) / 100, 2, "F");
          y += 8.5;
        }
        y += 3;
      }

      // FOD Size Distribution
      if (summary.sizeCount > 0) {
        ensureSpace(34);
        doc.setTextColor(51, 65, 85);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("FOD Size Distribution", margin, y);
        y += 4;

        for (const bucket of summary.sizeBuckets) {
          ensureSpace(8);
          const relPct =
            summary.maxSizeBucketCount > 0
              ? (bucket.count / summary.maxSizeBucketCount) * 100
              : 0;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(15, 23, 42);
          doc.text(bucket.label, margin, y + 3);
          doc.setTextColor(100, 116, 139);
          doc.text(
            `${bucket.count.toLocaleString()} (${bucket.pct}%)`,
            pageW - margin,
            y + 3,
            { align: "right" }
          );
          doc.setFillColor(226, 232, 240);
          doc.rect(margin, y + 4.5, contentW, 2, "F");
          doc.setFillColor(bucket.hex[0], bucket.hex[1], bucket.hex[2]);
          doc.rect(margin, y + 4.5, (contentW * relPct) / 100, 2, "F");
          y += 8;
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

      const fileName = `mission-${displayId ?? missionNumber ?? "report"}-report.pdf`;
      doc.save(fileName);
      toast.success(`Report downloaded (${fileName})`);
    } catch (error) {
      console.error("Failed to generate PDF report:", error);
      toast.error("Failed to download report");
    }
  };

  const cardClass = `rounded-xl border overflow-hidden transition-all ${
    isDark
      ? "bg-[#292D33] border-[#383D44]"
      : "bg-white border-slate-200 shadow-xs"
  }`;

  const cardHeaderClass = `px-4 py-2.5 border-b flex items-center justify-between gap-2 ${
    isDark
      ? "bg-[#353A42] border-[#3E434C]"
      : "bg-slate-50 border-slate-200"
  }`;

  const headingClass = `text-xs font-semibold ${
    isDark ? "text-slate-100" : "text-slate-800"
  }`;

  const mutedText = isDark ? "text-[#8E95A2]" : "text-slate-500";

  const statusBadgeClass =
    statusText === "ACTIVE"
      ? "bg-[#00B957]/15 text-[#00B957] border border-[#00B957]/40"
      : statusText === "PAUSED"
      ? "bg-[#E5A12B]/15 text-[#E5A12B] border border-[#E5A12B]/40"
      : "bg-[#31475D] text-[#5AA7EA] border border-[#5AA7EA]/40";

  return (
    <div
      className={`h-full w-full flex flex-col justify-start overflow-y-auto p-3 xl:p-4 gap-3 select-none transition-colors duration-200 ${
        isDark ? "bg-[#22262B] text-slate-100" : "bg-[#F8FAFC] text-slate-900"
      }`}
    >
      {/* Top Page Header Row (consistent with SystemStats, MissionExplore, Settings) */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h1
              className={`text-xl font-bold tracking-tight ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              {missionTitle} Report
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass}`}
            >
              {statusText}
            </span>
          </div>
          <p className={`text-xs mt-0.5 ${mutedText}`}>
            Mission ID: {missionNumber ?? "—"} · Generated {new Date().toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4C9FE8] hover:bg-[#3B91DC] text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
          >
            <RxDownload className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition active:scale-95 cursor-pointer ${
                isDark
                  ? "bg-[#292D33] border-[#3E444D] text-slate-200 hover:bg-[#353A42]"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              Back
            </button>
          )}
        </div>
      </div>

      {/* Mission Summary Stat Strip (4 cards, consistent with MissionExplore & SystemStats) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 xl:gap-3 shrink-0">
        <div className={`${cardClass} px-3.5 py-2.5 xl:px-4 xl:py-3`}>
          <div className={`text-xs font-medium truncate ${mutedText}`}>Mission</div>
          <div
            className={`text-base xl:text-lg font-bold font-mono mt-0.5 truncate ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            {missionTitle}
          </div>
        </div>

        <div className={`${cardClass} px-3.5 py-2.5 xl:px-4 xl:py-3`}>
          <div className={`text-xs font-medium truncate ${mutedText}`}>Duration</div>
          <div
            className={`text-base xl:text-lg font-bold font-mono mt-0.5 truncate ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            {formatDuration(durationMs)}
          </div>
        </div>

        <div className={`${cardClass} px-3.5 py-2.5 xl:px-4 xl:py-3`}>
          <div className={`text-xs font-medium truncate ${mutedText}`}>Total FODs</div>
          <div className="text-base xl:text-lg font-bold font-mono mt-0.5 text-[#E5A12B] truncate">
            {summary.total.toLocaleString()}
          </div>
        </div>

        <div className={`${cardClass} px-3.5 py-2.5 xl:px-4 xl:py-3`}>
          <div className={`text-xs font-medium truncate ${mutedText}`}>Active Cameras</div>
          <div
            className={`text-base xl:text-lg font-bold font-mono mt-0.5 truncate ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            {summary.cameraCount || "—"}
          </div>
        </div>
      </div>

      {/* Middle 2-Column Grid: Status Breakdown & Classification Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 shrink-0">
        {/* Status Breakdown Card */}
        <div className={`${cardClass} flex flex-col`}>
          <div className={cardHeaderClass}>
            <h2 className={headingClass}>Status Breakdown</h2>
            <span className={`text-xs font-mono ${mutedText}`}>
              Avg Size: {summary.avgSize > 0 ? `${summary.avgSize.toFixed(1)} mm` : "—"} (
              {summary.minSize > 0
                ? `${summary.minSize.toFixed(0)}–${summary.maxSize.toFixed(0)} mm`
                : "—"}
              )
            </span>
          </div>

          <div className="p-3.5 xl:p-4 flex-1 flex items-center">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full">
              <div className="rounded-lg p-3 bg-[#E5A12B]/10 border border-[#E5A12B]/30">
                <div className="text-[11px] font-semibold text-[#E5A12B]">Pending</div>
                <div
                  className={`text-xl font-bold font-mono mt-0.5 ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  {summary.pending}
                </div>
              </div>

              <div className="rounded-lg p-3 bg-[#00B957]/10 border border-[#00B957]/30">
                <div className="text-[11px] font-semibold text-[#00B957]">Confirmed</div>
                <div
                  className={`text-xl font-bold font-mono mt-0.5 ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  {summary.accepted}
                </div>
              </div>

              <div className="rounded-lg p-3 bg-[#4C9FE8]/10 border border-[#4C9FE8]/30">
                <div className="text-[11px] font-semibold text-[#4C9FE8]">Cleared</div>
                <div
                  className={`text-xl font-bold font-mono mt-0.5 ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  {summary.cleared}
                </div>
              </div>

              <div className="rounded-lg p-3 bg-[#D51F32]/10 border border-[#D51F32]/30">
                <div className="text-[11px] font-semibold text-[#D51F32] dark:text-rose-400">
                  False
                </div>
                <div
                  className={`text-xl font-bold font-mono mt-0.5 ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  {summary.rejected}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Classification Breakdown Card */}
        <div className={`${cardClass} flex flex-col`}>
          <div className={cardHeaderClass}>
            <h2 className={headingClass}>Classification Breakdown</h2>
            <span className={`text-xs font-mono ${mutedText}`}>
              {summary.classEntries.length} classes
            </span>
          </div>

          <div className="p-3.5 xl:p-4 flex-1 flex flex-col justify-center">
            {summary.classEntries.length === 0 ? (
              <p className={`text-xs italic py-4 text-center ${mutedText}`}>
                No FOD detections recorded yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {summary.classEntries.map(([cls, cnt]) => {
                  const pct = summary.total > 0 ? Math.round((cnt / summary.total) * 100) : 0;
                  const barColor = CLASS_COLORS[cls] || "bg-[#4C9FE8]";
                  return (
                    <div key={cls} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span
                          className={`font-semibold ${
                            isDark ? "text-slate-200" : "text-slate-700"
                          }`}
                        >
                          {cls}
                        </span>
                        <span className={`font-mono ${mutedText}`}>
                          {cnt.toLocaleString()} ({pct}%)
                        </span>
                      </div>
                      <div
                        className={`h-2 w-full rounded-full overflow-hidden ${
                          isDark ? "bg-[#22262B]" : "bg-slate-100"
                        }`}
                      >
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FOD Size Range Bar Graph */}
      <div className={`${cardClass} shrink-0 flex flex-col`}>
        <div className={cardHeaderClass}>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className={headingClass}>FOD Size Distribution</h2>
            <span className={`text-xs ${mutedText}`}>
              {summary.sizeCount > 0
                ? `${summary.sizeCount.toLocaleString()} measured · Range ${summary.minSize.toFixed(0)}–${summary.maxSize.toFixed(0)} mm`
                : "No size measurements recorded"}
            </span>
          </div>
          {summary.avgSize > 0 && (
            <span className={`text-xs font-mono ${mutedText}`}>
              Avg {summary.avgSize.toFixed(1)} mm
            </span>
          )}
        </div>

        <div className="p-3.5 xl:p-4">
          {summary.sizeCount === 0 ? (
            <p className={`text-xs italic py-6 text-center ${mutedText}`}>
              No FOD size data recorded yet.
            </p>
          ) : (
            <div className="relative pt-5">
              {/* Subtle horizontal reference gridlines */}
              <div className="pointer-events-none absolute inset-x-0 top-5 bottom-8 flex flex-col justify-between">
                {[0, 1, 2, 3].map((line) => (
                  <div
                    key={line}
                    className={`w-full border-t border-dashed ${
                      isDark ? "border-[#383D44]" : "border-slate-200"
                    }`}
                  />
                ))}
              </div>

              <div className="relative z-10 grid grid-cols-5 sm:grid-cols-10 gap-2 items-end h-44">
                {summary.sizeBuckets.map((bucket) => {
                  const heightPct =
                    summary.maxSizeBucketCount > 0
                      ? (bucket.count / summary.maxSizeBucketCount) * 100
                      : 0;
                  return (
                    <div
                      key={bucket.key}
                      className="group h-full flex flex-col items-center justify-end"
                      title={`${bucket.label}: ${bucket.count.toLocaleString()} FODs (${bucket.pct}%)`}
                    >
                      <div className="w-full flex-1 flex flex-col items-center justify-end min-h-0">
                        <span
                          className={`text-[11px] font-mono font-semibold mb-1 truncate max-w-full ${
                            isDark ? "text-slate-200" : "text-slate-700"
                          }`}
                        >
                          {bucket.count.toLocaleString()}
                        </span>
                        <div
                          className={`w-full max-w-[44px] rounded-t-md transition-all duration-500 ease-out group-hover:opacity-85 ${
                            bucket.count > 0 ? bucket.color : isDark ? "bg-[#353A42]" : "bg-slate-200"
                          }`}
                          style={{
                            height:
                              bucket.count > 0
                                ? `${Math.max(4, Math.round(heightPct))}%`
                                : "2px",
                          }}
                        />
                      </div>
                      <div className="mt-2 text-center leading-tight w-full">
                        <div
                          className={`text-[10px] font-semibold truncate ${
                            isDark ? "text-slate-300" : "text-slate-700"
                          }`}
                        >
                          {bucket.rangeText}
                        </div>
                        <div className={`text-[9px] font-mono ${mutedText}`}>
                          mm · {bucket.pct}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Card: Spatial Density Heatmap */}
      <div className={`${cardClass} flex-1 min-h-[240px] flex flex-col`}>
        <div className={cardHeaderClass}>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className={headingClass}>Spatial Density Heatmap</h2>
            <span className={`text-xs ${mutedText}`}>
              {summary.points.length.toLocaleString()} geo-located detections · Peak cell:{" "}
              <span
                className={`font-mono font-semibold ${
                  isDark ? "text-slate-200" : "text-slate-700"
                }`}
              >
                {heatmapMeta.peakCount}
              </span>{" "}
              FODs
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className={mutedText}>Low</span>
            <div className="flex h-2 w-24 rounded-full overflow-hidden">
              <div className="flex-1 bg-[#4C9FE8]/65" />
              <div className="flex-1 bg-[#00B957]/75" />
              <div className="flex-1 bg-[#E5A12B]/85" />
              <div className="flex-1 bg-[#D51F32]" />
            </div>
            <span className={mutedText}>High</span>
          </div>
        </div>

        <div className="p-3.5 xl:p-4 flex-1 flex flex-col justify-between gap-2 min-h-0">
          <div
            className={`relative flex-1 min-h-[160px] w-full overflow-hidden rounded-lg border ${
              isDark ? "border-[#383D44]" : "border-slate-200"
            }`}
          >
            <canvas
              ref={heatmapCanvasRef}
              width={960}
              height={260}
              className="w-full h-full block"
            />
            {summary.points.length === 0 && (
              <div
                className={`absolute inset-0 flex items-center justify-center text-xs ${mutedText}`}
              >
                No geo-located FOD coordinates available for heatmap.
              </div>
            )}
          </div>

          {summary.points.length > 0 && (
            <div className={`flex justify-between text-[11px] font-mono shrink-0 ${mutedText}`}>
              <span>
                SW: {heatmapMeta.minLat.toFixed(5)}, {heatmapMeta.minLon.toFixed(5)}
              </span>
              <span>
                NE: {heatmapMeta.maxLat.toFixed(5)}, {heatmapMeta.maxLon.toFixed(5)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MissionReport;
