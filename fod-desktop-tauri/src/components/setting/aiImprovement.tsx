import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { getCurrentUser } from "@/utils/auth";
import { toast } from "react-toastify";
import {
  Lock,
  Sparkles,
  Database,
  Tag,
  CheckCircle2,
  Play,
  RotateCcw,
  BookmarkCheck,
  Bookmark,
} from "lucide-react";

type FodClassLabel =
  | "Metallic"
  | "Non-Metallic"
  | "Organic"
  | "Rocks/Asphalt"
  | "False Positive";

interface AiSample {
  id: string;
  mission: string;
  sizeMm: number;
  aiGuess: FodClassLabel;
  confidence: number;
  assignedClass: FodClassLabel | "";
  marked: boolean;
  source: string;
}

const CLASS_OPTIONS: FodClassLabel[] = [
  "Metallic",
  "Non-Metallic",
  "Organic",
  "Rocks/Asphalt",
  "False Positive",
];

const INITIAL_SAMPLES: AiSample[] = [
  {
    id: "FOD-5042",
    mission: "Mission #5",
    sizeMm: 14,
    aiGuess: "Metallic",
    confidence: 62,
    assignedClass: "Metallic",
    marked: true,
    source: "Low Confidence",
  },
  {
    id: "FOD-5038",
    mission: "Mission #5",
    sizeMm: 19,
    aiGuess: "Non-Metallic",
    confidence: 58,
    assignedClass: "",
    marked: true,
    source: "Operator Correction",
  },
  {
    id: "FOD-4991",
    mission: "Mission #4",
    sizeMm: 11,
    aiGuess: "Rocks/Asphalt",
    confidence: 71,
    assignedClass: "False Positive",
    marked: false,
    source: "False Positive",
  },
  {
    id: "FOD-4976",
    mission: "Mission #4",
    sizeMm: 22,
    aiGuess: "Organic",
    confidence: 67,
    assignedClass: "Organic",
    marked: true,
    source: "Recent Mission",
  },
  {
    id: "FOD-4940",
    mission: "Mission #3",
    sizeMm: 8,
    aiGuess: "Metallic",
    confidence: 54,
    assignedClass: "",
    marked: false,
    source: "Low Confidence",
  },
];

const GATHER_SOURCES = [
  "Low Confidence (<75%)",
  "False Positives",
  "Operator Corrections",
  "Recent Missions",
] as const;

const IMPROVE_STAGES = [
  "Collecting marked & classified frames...",
  "Normalizing bounding boxes & augmentations...",
  "Fine-tuning FOD detection head...",
  "Evaluating validation set mAP...",
];

export default function AiImprovement() {
  const isDark = useSelector((store: RootState) => store.theme.theme === "dark");
  const user = useMemo(() => (getCurrentUser() || {}) as any, []);
  const isCollector = String(user?.role || "").toUpperCase() === "COLLECTOR";

  const [samples, setSamples] = useState<AiSample[]>(INITIAL_SAMPLES);
  const [gatherSource, setGatherSource] = useState<string>(GATHER_SOURCES[0]);
  const [isGathering, setIsGathering] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "marked" | "unclassified">("all");

  const [isImproving, setIsImproving] = useState(false);
  const [improveProgress, setImproveProgress] = useState(0);
  const [modelVersion, setModelVersion] = useState("v2.4");
  const [modelAccuracy, setModelAccuracy] = useState(94.2);

  useEffect(() => {
    if (!isImproving) return;
    const timer = setInterval(() => {
      setImproveProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setIsImproving(false);
          setModelVersion((v) => {
            const minor = Number(v.split(".")[1] || 4) + 1;
            return `v2.${minor}`;
          });
          setModelAccuracy((acc) => +(Math.min(99.4, acc + 0.6)).toFixed(1));
          toast.success("AI improvement data is collected");
          return 100;
        }
        return Math.min(100, prev + 10);
      });
    }, 350);
    return () => clearInterval(timer);
  }, [isImproving]);

  const cardClass = `rounded-xl border transition-colors ${
    isDark ? "bg-[#292D33] border-[#383D44]" : "bg-white border-slate-200 shadow-xs"
  }`;

  const mutedText = isDark ? "text-[#8E95A2]" : "text-slate-500";

  if (isCollector) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6">
        <div className={`${cardClass} max-w-md w-full p-6 text-center space-y-3`}>
          <div className="w-12 h-12 mx-auto rounded-full bg-[#E5A12B]/15 text-[#E5A12B] flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            AI Improvement Locked
          </h2>
          <p className={`text-xs leading-relaxed ${mutedText}`}>
            Dataset curation, classification, and model improvement controls are restricted to Admin accounts.
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#D51F32]/15 text-[#D51F32] dark:text-rose-400">
            <Lock className="w-3 h-3" />
            <span>Role: Collector (Read-only)</span>
          </div>
        </div>
      </div>
    );
  }

  const markedCount = samples.filter((s) => s.marked).length;
  const classifiedCount = samples.filter((s) => Boolean(s.assignedClass)).length;
  const readyCount = samples.filter((s) => s.marked && Boolean(s.assignedClass)).length;

  const visibleSamples = useMemo(() => {
    if (filterMode === "marked") return samples.filter((s) => s.marked);
    if (filterMode === "unclassified") return samples.filter((s) => !s.assignedClass);
    return samples;
  }, [samples, filterMode]);

  const handleGatherData = () => {
    if (isGathering) return;
    setIsGathering(true);
    setTimeout(() => {
      const nextNum = 5050 + samples.length;
      const newRows: AiSample[] = [
        {
          id: `FOD-${nextNum}`,
          mission: "Mission #5",
          sizeMm: 16,
          aiGuess: "Metallic",
          confidence: 64,
          assignedClass: "",
          marked: false,
          source: gatherSource,
        },
        {
          id: `FOD-${nextNum + 1}`,
          mission: "Mission #5",
          sizeMm: 12,
          aiGuess: "Non-Metallic",
          confidence: 69,
          assignedClass: "",
          marked: false,
          source: gatherSource,
        },
      ];
      setSamples((prev) => [...newRows, ...prev]);
      setIsGathering(false);
      toast.success(`Gathered 2 dummy samples from "${gatherSource}"`);
    }, 550);
  };

  const toggleMark = (id: string) => {
    setSamples((prev) =>
      prev.map((s) => (s.id === id ? { ...s, marked: !s.marked } : s))
    );
  };

  const updateClassification = (id: string, label: FodClassLabel | "") => {
    setSamples((prev) =>
      prev.map((s) => (s.id === id ? { ...s, assignedClass: label } : s))
    );
  };

  const handleStartImprove = () => {
    if (isImproving) return;
    if (readyCount === 0) {
      toast.info("Mark and classify at least 1 sample before running improvement.");
      return;
    }
    setImproveProgress(10);
    setIsImproving(true);
  };

  const stageText =
    IMPROVE_STAGES[
      Math.min(IMPROVE_STAGES.length - 1, Math.floor((improveProgress / 100) * IMPROVE_STAGES.length))
    ];

  return (
    <div className="w-full h-full flex flex-col gap-4 overflow-y-auto pb-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
              AI Improvement
            </h1>
          </div>
          <p className={`text-xs mt-0.5 ${mutedText}`}>
            Gather edge-case detections, mark & classify samples, and trigger model improvement runs
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSamples(INITIAL_SAMPLES);
            setImproveProgress(0);
            setIsImproving(false);
            toast.info("Reset demo dataset");
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
            isDark
              ? "bg-[#353A42] border-[#454B53] text-slate-200 hover:bg-[#41464E]"
              : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Demo</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`${cardClass} p-3.5`}>
          <div className={`text-xs font-medium ${mutedText}`}>Active Model</div>
          <div className={`text-lg font-bold font-mono mt-0.5 ${isDark ? "text-white" : "text-slate-900"}`}>
            v8 {modelVersion}
          </div>
          <div className="text-[11px] text-[#00B957] font-semibold mt-0.5">
            {modelAccuracy}% mAP@50
          </div>
        </div>

        <div className={`${cardClass} p-3.5`}>
          <div className={`text-xs font-medium ${mutedText}`}>Gathered Queue</div>
          <div className="text-lg font-bold font-mono mt-0.5 text-[#4C9FE8]">
            {samples.length}
          </div>
          <div className={`text-[11px] mt-0.5 ${mutedText}`}>
            {markedCount} marked for training
          </div>
        </div>

        <div className={`${cardClass} p-3.5`}>
          <div className={`text-xs font-medium ${mutedText}`}>Classified</div>
          <div className="text-lg font-bold font-mono mt-0.5 text-[#E5A12B]">
            {classifiedCount} / {samples.length}
          </div>
          <div className={`text-[11px] mt-0.5 ${mutedText}`}>
            Human-verified labels
          </div>
        </div>

        <div className={`${cardClass} p-3.5`}>
          <div className={`text-xs font-medium ${mutedText}`}>Ready to Train</div>
          <div className="text-lg font-bold font-mono mt-0.5 text-[#00B957]">
            {readyCount}
          </div>
          <div className={`text-[11px] mt-0.5 ${mutedText}`}>
            Marked + classified
          </div>
        </div>
      </div>

      {/* Step 1 & Step 3 Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Gather Data */}
        <div className={`${cardClass} p-4 space-y-3`}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#4C9FE8]/15 text-[#4C9FE8] flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                1. Gather Data
              </h2>
              <p className={`text-[11px] ${mutedText}`}>
                Pull candidate frames from mission logs into the curation queue
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={gatherSource}
              onChange={(e) => setGatherSource(e.target.value)}
              className={`flex-1 min-w-[180px] px-2.5 py-2 rounded-lg border text-xs outline-none ${
                isDark
                  ? "bg-[#22262B] border-[#3E444D] text-slate-100"
                  : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            >
              {GATHER_SOURCES.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleGatherData}
              disabled={isGathering}
              className="px-3.5 py-2 rounded-lg bg-[#4C9FE8] hover:bg-[#3B91DC] disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isGathering ? "Gathering..." : "Gather Data"}</span>
            </button>
          </div>
        </div>

        {/* Improve Process */}
        <div className={`${cardClass} p-4 space-y-3`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#00B957]/15 text-[#00B957] flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  3. Improve Model Process
                </h2>
                <p className={`text-[11px] ${mutedText}`}>
                  Simulate fine-tuning with {readyCount} marked & classified sample(s)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartImprove}
              disabled={isImproving}
              className="px-3.5 py-2 rounded-lg bg-[#00B957] hover:bg-[#009E4A] disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isImproving ? "Improving..." : "Run Improve"}</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className={mutedText}>
                {isImproving
                  ? stageText
                  : improveProgress === 100
                  ? `Completed · Model updated to ${modelVersion}`
                  : "Idle · Ready to start improvement run"}
              </span>
              <span className="font-mono font-semibold text-[#4C9FE8]">{improveProgress}%</span>
            </div>
            <div className={`h-2 w-full rounded-full overflow-hidden ${isDark ? "bg-[#22262B]" : "bg-slate-200"}`}>
              <div
                className="h-full rounded-full bg-[#00B957] transition-all duration-300"
                style={{ width: `${improveProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Step 2: Mark & Classify Table */}
      <div className={`${cardClass} overflow-hidden flex flex-col`}>
        <div
          className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 ${
            isDark ? "bg-[#353A42] border-[#3E434C]" : "bg-slate-50 border-slate-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#4C9FE8]" />
            <h2 className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
              2. Mark & Classify Samples
            </h2>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            {(["all", "marked", "unclassified"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`px-2.5 py-1 rounded-md font-semibold capitalize transition cursor-pointer ${
                  filterMode === mode
                    ? "bg-[#4C9FE8] text-white"
                    : isDark
                    ? "bg-[#292D33] text-slate-300 hover:bg-[#3D434D]"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={isDark ? "bg-[#24282E] text-[#8E95A2]" : "bg-slate-50/70 text-slate-500"}>
              <tr>
                <th className="px-4 py-2.5 font-semibold">Sample</th>
                <th className="px-4 py-2.5 font-semibold">Source</th>
                <th className="px-4 py-2.5 font-semibold">AI Prediction</th>
                <th className="px-4 py-2.5 font-semibold">Classify Label</th>
                <th className="px-4 py-2.5 font-semibold text-right">Mark</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-[#343942]" : "divide-slate-200"}`}>
              {visibleSamples.map((s) => (
                <tr
                  key={s.id}
                  className={isDark ? "hover:bg-[#31363E]/50" : "hover:bg-slate-50"}
                >
                  <td className="px-4 py-2.5">
                    <div className={`font-mono font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                      {s.id}
                    </div>
                    <div className={`text-[11px] ${mutedText}`}>
                      {s.mission} · {s.sizeMm} mm
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 text-[11px] ${mutedText}`}>{s.source}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{s.aiGuess}</span>
                    <span className={`ml-1.5 font-mono text-[11px] ${mutedText}`}>
                      ({s.confidence}%)
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={s.assignedClass}
                      onChange={(e) => updateClassification(s.id, e.target.value as FodClassLabel | "")}
                      className={`px-2 py-1 rounded-md border text-xs outline-none ${
                        isDark
                          ? "bg-[#22262B] border-[#3E444D] text-slate-100"
                          : "bg-white border-slate-200 text-slate-800"
                      }`}
                    >
                      <option value="">Select class...</option>
                      {CLASS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleMark(s.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
                        s.marked
                          ? "bg-[#00B957]/15 border-[#00B957]/40 text-[#00B957]"
                          : isDark
                          ? "bg-[#22262B] border-[#3E444D] text-slate-300 hover:border-[#4C9FE8]"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:border-[#4C9FE8]"
                      }`}
                    >
                      {s.marked ? (
                        <>
                          <BookmarkCheck className="w-3.5 h-3.5" />
                          <span>Marked</span>
                        </>
                      ) : (
                        <>
                          <Bookmark className="w-3.5 h-3.5" />
                          <span>Mark</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              {visibleSamples.length === 0 && (
                <tr>
                  <td colSpan={5} className={`px-4 py-6 text-center text-xs ${mutedText}`}>
                    <div className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#00B957]" />
                      <span>No samples match this filter.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
