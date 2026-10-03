"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  HelpCircle,
  Layers,
  Lightbulb,
  ListOrdered,
  Mic,
  MicOff,
  PenTool,
  RotateCcw,
  Sparkles,
  Table,
  X,
  Zap,
} from "lucide-react";
import { DronaProgressStore } from "@/lib/progress-store";
import type {
  SubjectiveArchetype,
  SubjectiveQuestion,
  WrittenGradingResult,
  WrittenSubmissionRecord,
} from "@/lib/types";

interface WrittenWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  chapterPath: string;
  chapterName: string;
  initialQuestionId?: string;
}

interface QuestionAnswerState {
  rawText: string;
  points: string[];
  table: {
    headers: [string, string];
    rows: [string, string][];
  };
  instrument: {
    principle: string;
    working: string;
    precautionsOrUnits: string;
  };
  inputMode: "structured" | "freeform";
}

const ARCHETYPE_CONFIG: Record<
  SubjectiveArchetype,
  { label: string; color: string; badgeBg: string; icon: typeof FileText }
> = {
  define: {
    label: "Definition",
    color: "text-purple-400",
    badgeBg: "bg-purple-500/15 border-purple-500/40 text-purple-300",
    icon: FileText,
  },
  differentiate: {
    label: "Distinction Table",
    color: "text-indigo-400",
    badgeBg: "bg-indigo-500/15 border-indigo-500/40 text-indigo-300",
    icon: Table,
  },
  give_reasons: {
    label: "Scientific Reasoning",
    color: "text-amber-400",
    badgeBg: "bg-amber-500/15 border-amber-500/40 text-amber-300",
    icon: Lightbulb,
  },
  describe_instrument: {
    label: "Instrument Deep-Dive",
    color: "text-emerald-400",
    badgeBg: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    icon: Layers,
  },
  points: {
    label: "Step-wise Points",
    color: "text-cyan-400",
    badgeBg: "bg-cyan-500/15 border-cyan-500/40 text-cyan-300",
    icon: ListOrdered,
  },
};

function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function checkKeywordInText(text: string, keyword: string): boolean {
  const normText = normalizeForSearch(text);
  const normKw = normalizeForSearch(keyword);
  if (!normKw || !normText) return false;
  if (normText.includes(normKw)) return true;

  const words = normKw.split(" ").filter((w) => w.length > 2);
  if (words.length > 1) {
    return words.every((w) => {
      const stem = w.replace(/(ing|es|ed|s)$/, "");
      return normText.includes(w) || (stem.length >= 4 && normText.includes(stem));
    });
  } else if (words.length === 1) {
    const stem = words[0].replace(/(ing|es|ed|s)$/, "");
    return stem.length >= 4 && normText.includes(stem);
  }
  return false;
}

export function WrittenWorkspaceModal({
  open,
  onClose,
  chapterPath,
  chapterName,
  initialQuestionId,
}: WrittenWorkspaceModalProps) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<SubjectiveQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [archetypeFilter, setArchetypeFilter] = useState<string>("all");
  const [answers, setAnswers] = useState<Record<string, QuestionAnswerState>>({});
  const [grading, setGrading] = useState(false);
  const [results, setResults] = useState<Record<string, WrittenGradingResult>>({});
  const [showArtifactZoom, setShowArtifactZoom] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeSpeechField, setActiveSpeechField] = useState<string>("rawText");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecognitionRef = useRef<any>(null);

  // Load questions from API
  useEffect(() => {
    if (!open || !chapterPath) return;

    let mounted = true;
    setLoading(true);

    fetch(`/api/written?chapterPath=${encodeURIComponent(chapterPath)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load"))))
      .then((data) => {
        if (!mounted) return;
        const qs: SubjectiveQuestion[] = data.questions || [];
        setQuestions(qs);

        if (initialQuestionId) {
          const idx = qs.findIndex((q) => q.id === initialQuestionId);
          if (idx >= 0) setCurrentIdx(idx);
        }

        // Initialize state for each question
        const initMap: Record<string, QuestionAnswerState> = {};
        for (const q of qs) {
          const tableHeaders: [string, string] = q.structural_template?.columns || [
            "Aspect / Feature",
            "Concept A",
          ];
          const rawRows = q.structural_template?.rows || ["Point 1", "Point 2", "Point 3"];
          const tableRows: [string, string][] = rawRows.map((label: string) => [label, ""] as [string, string]);
          const rawPrompts = q.structural_template?.prompts || ["Point 1", "Point 2", "Point 3"];
          const pointsList = rawPrompts.map(() => "");

          initMap[q.id] = {
            rawText: "",
            points: pointsList.length > 0 ? pointsList : ["", ""],
            table: {
              headers: tableHeaders,
              rows: tableRows,
            },
            instrument: {
              principle: "",
              working: "",
              precautionsOrUnits: "",
            },
            inputMode: q.archetype === "define" ? "freeform" : "structured",
          };
        }
        setAnswers(initMap);

        // Load existing submissions from progress store
        const prog = DronaProgressStore.load();
        const existingSubmissions = DronaProgressStore.getWrittenSubmissions(prog, chapterPath);
        const loadedResults: Record<string, WrittenGradingResult> = {};
        for (const q of qs) {
          const match = existingSubmissions.find((s) => s.questionId === q.id);
          if (match && match.result) {
            loadedResults[q.id] = match.result;
          }
        }
        setResults(loadedResults);

        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading written prep questions:", err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, chapterPath, initialQuestionId]);

  // Speech Recognition Setup (Web Speech API)
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }

        if (transcript) {
          const q = questions[currentIdx];
          if (!q) return;

          setAnswers((prev) => {
            const current = prev[q.id];
            if (!current) return prev;

            if (activeSpeechField === "rawText") {
              const updated = current.rawText ? current.rawText + " " + transcript : transcript;
              return { ...prev, [q.id]: { ...current, rawText: updated } };
            } else if (activeSpeechField.startsWith("point_")) {
              const pIdx = parseInt(activeSpeechField.replace("point_", ""), 10);
              const nextPoints = [...current.points];
              nextPoints[pIdx] = nextPoints[pIdx] ? nextPoints[pIdx] + " " + transcript : transcript;
              return { ...prev, [q.id]: { ...current, points: nextPoints } };
            } else if (activeSpeechField.startsWith("inst_")) {
              const key = activeSpeechField.replace("inst_", "") as keyof typeof current.instrument;
              const nextInst = { ...current.instrument };
              nextInst[key] = nextInst[key] ? nextInst[key] + " " + transcript : transcript;
              return { ...prev, [q.id]: { ...current, instrument: nextInst } };
            }
            return prev;
          });
        }
      };

      recognition.onerror = () => {
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, [questions, currentIdx, activeSpeechField]);

  const toggleSpeechRecording = (fieldKey: string) => {
    if (!speechRecognitionRef.current) {
      alert("Voice input is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (isRecording) {
      speechRecognitionRef.current.stop();
      setIsRecording(false);
    } else {
      setActiveSpeechField(fieldKey);
      speechRecognitionRef.current.start();
      setIsRecording(true);
    }
  };

  // Filtered questions
  const filteredQuestions = useMemo(() => {
    if (archetypeFilter === "all") return questions;
    return questions.filter((q) => q.archetype === archetypeFilter);
  }, [questions, archetypeFilter]);

  const currentQ: SubjectiveQuestion | undefined = filteredQuestions[currentIdx] || filteredQuestions[0];
  const currentState: QuestionAnswerState | undefined = currentQ ? answers[currentQ.id] : undefined;
  const currentResult: WrittenGradingResult | undefined = currentQ ? results[currentQ.id] : undefined;

  // Aggregate current answer text for real-time keyword checking
  const aggregatedText = useMemo(() => {
    if (!currentState) return "";
    let text = currentState.rawText || "";
    if (currentState.points && currentState.points.length > 0) {
      text += " " + currentState.points.join(" ");
    }
    if (currentState.table?.rows) {
      text += " " + currentState.table.rows.map((r) => `${r[0]} ${r[1]}`).join(" ");
    }
    if (currentState.instrument) {
      text += ` ${currentState.instrument.principle} ${currentState.instrument.working} ${currentState.instrument.precautionsOrUnits}`;
    }
    return text;
  }, [currentState]);

  // Real-time matched keywords
  const liveKeywordAnalysis = useMemo<{
    matched: string[];
    missing: string[];
    count: number;
    total: number;
    pct: number;
  }>(() => {
    if (!currentQ) return { matched: [], missing: [], count: 0, total: 0, pct: 0 };
    const mandatory = currentQ.mandatory_keywords || [];
    const matched: string[] = [];
    const missing: string[] = [];

    for (const kw of mandatory) {
      if (checkKeywordInText(aggregatedText, kw)) {
        matched.push(kw);
      } else {
        missing.push(kw);
      }
    }

    return {
      matched,
      missing,
      count: matched.length,
      total: mandatory.length,
      pct: mandatory.length > 0 ? Math.round((matched.length / mandatory.length) * 100) : 100,
    };
  }, [currentQ, aggregatedText]);

  // Evaluation Handler
  const handleGrade = async () => {
    if (!currentQ || !currentState) return;

    setGrading(true);
    try {
      const payload = {
        question: currentQ,
        studentAnswer: aggregatedText,
        structuredAnswer: {
          points: currentState.points.filter((p) => p.trim().length > 0),
          table: currentState.table,
          instrument: currentState.instrument,
          rawText: currentState.rawText,
        },
      };

      const res = await fetch("/api/grade-written", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to evaluate");
      }

      const evalData: WrittenGradingResult = await res.json();
      setResults((prev) => ({ ...prev, [currentQ.id]: evalData }));

      // Save to progress store
      const record: WrittenSubmissionRecord = {
        id: `${currentQ.id}_${Date.now()}`,
        questionId: currentQ.id,
        chapterPath,
        score: evalData.score,
        max_marks: evalData.max_marks,
        percentage: evalData.percentage,
        submittedAt: new Date().toISOString(),
        userAnswer: aggregatedText,
        result: evalData,
      };
      const curProg = DronaProgressStore.load();
      const updatedProg = DronaProgressStore.recordWrittenSubmission(curProg, record);
      DronaProgressStore.save(updatedProg);

      // Trigger topper celebration if score >= 85%
      if (evalData.percentage >= 85) {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#10b981", "#06b6d4", "#f59e0b"],
        });
      }
    } catch (err) {
      console.error("Grading failed:", err);
      alert("Evaluation failed. Please try again.");
    } finally {
      setGrading(false);
    }
  };

  // Reset answer
  const handleReset = () => {
    if (!currentQ) return;
    if (confirm("Reset your answer for this question?")) {
      setAnswers((prev) => {
        const cur = prev[currentQ.id];
        if (!cur) return prev;
        return {
          ...prev,
          [currentQ.id]: {
            ...cur,
            rawText: "",
            points: cur.points.map(() => ""),
            table: {
              ...cur.table,
              rows: cur.table.rows.map(([label]) => [label, ""]),
            },
            instrument: {
              principle: "",
              working: "",
              precautionsOrUnits: "",
            },
          },
        };
      });
      setResults((prev) => {
        const copy = { ...prev };
        delete copy[currentQ.id];
        return copy;
      });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 backdrop-blur-md sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative flex h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0e0e0e] shadow-2xl"
      >
        {/* HEADER BAR */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#141414] px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
              <PenTool className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-bold text-white sm:text-base">
                  CBSE Written Answer Mastery
                </h3>
                <span className="hidden rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300 sm:inline-block">
                  Phase 3 & 4
                </span>
              </div>
              <p className="truncate text-xs text-white/50">{chapterName}</p>
            </div>
          </div>

          {/* Archetype Filter Tabs */}
          <div className="hidden items-center gap-1 rounded-xl bg-black/40 p-1 lg:flex">
            {[
              { id: "all", label: "All Questions" },
              { id: "define", label: "Definitions" },
              { id: "differentiate", label: "Distinctions" },
              { id: "give_reasons", label: "Reasoning" },
              { id: "describe_instrument", label: "Instruments" },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setArchetypeFilter(id);
                  setCurrentIdx(0);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  archetypeFilter === id
                    ? "bg-white/15 text-white shadow"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
            title="Close workspace"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* QUESTION STEPPER BAR */}
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 bg-[#111111] px-4 py-2 sm:px-6">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">
            Questions:
          </span>
          {filteredQuestions.map((q, idx) => {
            const hasResult = results[q.id];
            const isSelected = idx === currentIdx;
            const isHigh = hasResult && hasResult.percentage >= 80;
            const isModerate = hasResult && hasResult.percentage < 80;

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentIdx(idx)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  isSelected
                    ? "border border-indigo-400/80 bg-indigo-500/20 text-indigo-200 shadow-sm"
                    : isHigh
                    ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : isModerate
                    ? "border border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : "border border-white/5 bg-[#181818] text-white/60 hover:bg-white/10"
                }`}
              >
                <span>Q{idx + 1}</span>
                {isHigh ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                ) : isModerate ? (
                  <span className="text-[10px] text-amber-400">{hasResult.score}m</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* MAIN SPLIT VIEW */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <p className="text-sm text-white/60">Loading CBSE Subjective Question Bank...</p>
            </div>
          </div>
        ) : !currentQ ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="text-white/60">No questions found matching this filter.</p>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
            {/* LEFT COLUMN: QUESTION, KEYWORD TRAP & INPUT (7 Cols) */}
            <div className="flex flex-col overflow-y-auto border-r border-white/10 p-4 sm:p-6 lg:col-span-7">
              {/* Question Metadata */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {(() => {
                  const cfg = ARCHETYPE_CONFIG[currentQ.archetype] || ARCHETYPE_CONFIG.define;
                  const Icon = cfg.icon;
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${cfg.badgeBg}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </span>
                  );
                })()}

                <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-bold text-white">
                  {currentQ.marks} Marks (CBSE Standard)
                </span>

                <span className="inline-flex items-center gap-1 text-xs text-white/50">
                  <Clock className="h-3 w-3" />
                  Suggested time: {currentQ.marks * 2} mins
                </span>
              </div>

              {/* Question Text */}
              <div className="mb-4 rounded-xl border border-white/10 bg-[#161616] p-4">
                <p className="text-base font-medium leading-relaxed text-white sm:text-lg">
                  {currentQ.question}
                </p>
                {currentQ.lessonName ? (
                  <p className="mt-2 text-xs font-medium text-white/40">
                    From: {currentQ.lessonName}
                  </p>
                ) : null}
              </div>

              {/* Artifact Reference (e.g. NCERT textbook diagram) */}
              {currentQ.artifact_ref ? (
                <div className="mb-4 rounded-xl border border-white/10 bg-[#121212] p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-drona-cyan">
                      <Eye className="h-4 w-4" />
                      Textbook Figure Reference
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowArtifactZoom(!showArtifactZoom)}
                      className="text-xs text-drona-cyan hover:underline"
                    >
                      {showArtifactZoom ? "Hide Figure" : "View Full Figure"}
                    </button>
                  </div>
                  {showArtifactZoom ? (
                    <div className="mt-2 flex flex-col items-center">
                      <img
                        src={`/api/artifact?path=${encodeURIComponent(chapterPath + "/" + currentQ.artifact_ref)}`}
                        alt="NCERT Instrument Reference"
                        className="max-h-72 rounded-lg border border-white/15 object-contain shadow-lg"
                      />
                      <p className="mt-1 text-[11px] text-white/40">
                        Official NCERT Class 7 Textbook Diagram
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* LIVE KEYWORD TRAP BAR */}
              <div className="mb-4 rounded-xl border border-indigo-500/25 bg-indigo-950/20 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                      CBSE Keyword Trap Bar
                    </span>
                  </div>
                  <span className="text-xs font-bold text-indigo-300">
                    {liveKeywordAnalysis.count} of {liveKeywordAnalysis.total} Keywords (
                    {liveKeywordAnalysis.pct}%)
                  </span>
                </div>

                {/* Progress bar */}
                <div className="my-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${liveKeywordAnalysis.pct}%` }}
                  />
                </div>

                {/* Keyword Chips */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {currentQ.mandatory_keywords.map((kw) => {
                    const matched = liveKeywordAnalysis.matched.includes(kw);
                    return (
                      <span
                        key={kw}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                          matched
                            ? "border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-sm"
                            : "border border-white/10 bg-white/5 text-white/50"
                        }`}
                      >
                        {matched ? (
                          <Check className="h-3 w-3 stroke-[3] text-emerald-400" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                        )}
                        <span>{kw}</span>
                      </span>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-white/40">
                  💡 CBSE examiners award step marks when these mandatory scientific terms appear in your answer.
                </p>
              </div>

              {/* INPUT CONTROLS / MODE TOGGLE */}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/60">
                    Your Written Answer
                  </span>
                  {currentState?.inputMode === "structured" ? (
                    <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                      CBSE Exam Format
                    </span>
                  ) : (
                    <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
                      Paragraph Format
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Speech Dictation Button */}
                  <button
                    type="button"
                    onClick={() => toggleSpeechRecording("rawText")}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      isRecording
                        ? "animate-pulse border border-rose-500 bg-rose-500/20 text-rose-300"
                        : "border border-white/10 bg-[#1a1a1a] text-white/70 hover:bg-white/15"
                    }`}
                    title="Dictate your answer via speech"
                  >
                    {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    <span>{isRecording ? "Listening..." : "Dictate"}</span>
                  </button>

                  {/* Switch Mode Button */}
                  {currentQ.archetype !== "define" ? (
                    <button
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [currentQ.id]: {
                            ...currentState!,
                            inputMode:
                              currentState?.inputMode === "structured"
                                ? "freeform"
                                : "structured",
                          },
                        }))
                      }
                      className="text-xs text-indigo-300 hover:underline"
                    >
                      Switch to {currentState?.inputMode === "structured" ? "Freeform Text" : "Structured Form"}
                    </button>
                  ) : null}
                </div>
              </div>

              {/* ARCHETYPE SPECIFIC FORM */}
              <div className="space-y-3">
                {currentState?.inputMode === "structured" && currentQ.archetype === "differentiate" ? (
                  /* 2-COLUMN DISTINCTION TABLE */
                  <div className="overflow-hidden rounded-xl border border-white/15 bg-[#141414]">
                    <div className="grid grid-cols-2 border-b border-white/15 bg-[#1a1a1a] p-2.5 text-xs font-bold text-white">
                      <div>{currentState.table.headers[0] || "Concept 1"}</div>
                      <div className="border-l border-white/15 pl-3">
                        {currentState.table.headers[1] || "Concept 2"}
                      </div>
                    </div>
                    <div className="divide-y divide-white/10">
                      {currentState.table.rows.map((row, rIdx) => (
                        <div key={rIdx} className="grid grid-cols-2">
                          <div className="p-2">
                            <span className="mb-1 block text-[10px] font-semibold text-white/40">
                              Point {rIdx + 1}
                            </span>
                            <textarea
                              value={row[0]}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAnswers((prev) => {
                                  const cur = prev[currentQ.id];
                                  const nextRows = [...cur.table.rows];
                                  nextRows[rIdx] = [val, nextRows[rIdx][1]];
                                  return { ...prev, [currentQ.id]: { ...cur, table: { ...cur.table, rows: nextRows } } };
                                });
                              }}
                              placeholder="Enter distinction point..."
                              rows={2}
                              className="w-full rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-white placeholder-white/30 focus:border-indigo-400 focus:outline-none"
                            />
                          </div>
                          <div className="border-l border-white/15 p-2">
                            <span className="mb-1 block text-[10px] font-semibold text-white/40">
                              Contrast {rIdx + 1}
                            </span>
                            <textarea
                              value={row[1]}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAnswers((prev) => {
                                  const cur = prev[currentQ.id];
                                  const nextRows = [...cur.table.rows];
                                  nextRows[rIdx] = [nextRows[rIdx][0], val];
                                  return { ...prev, [currentQ.id]: { ...cur, table: { ...cur.table, rows: nextRows } } };
                                });
                              }}
                              placeholder="Enter contrasting point..."
                              rows={2}
                              className="w-full rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-white placeholder-white/30 focus:border-indigo-400 focus:outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-[#181818] p-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setAnswers((prev) => {
                            const cur = prev[currentQ.id];
                            return {
                              ...prev,
                              [currentQ.id]: {
                                ...cur,
                                table: {
                                  ...cur.table,
                                  rows: [...cur.table.rows, ["", ""]],
                                },
                              },
                            };
                          });
                        }}
                        className="text-xs font-semibold text-indigo-300 hover:underline"
                      >
                        + Add Comparison Row
                      </button>
                    </div>
                  </div>
                ) : currentState?.inputMode === "structured" && currentQ.archetype === "describe_instrument" ? (
                  /* 3-PART INSTRUMENT FORM */
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-[#141414] p-3">
                      <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-emerald-400">
                        <span>1. Principle & Construction</span>
                        <span className="text-[10px] text-white/40">What is it made of?</span>
                      </label>
                      <textarea
                        value={currentState.instrument.principle}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAnswers((prev) => {
                            const cur = prev[currentQ.id];
                            return {
                              ...prev,
                              [currentQ.id]: {
                                ...cur,
                                instrument: { ...cur.instrument, principle: val },
                              },
                            };
                          });
                        }}
                        placeholder="e.g. Funnel, measuring cylinder, cylindrical container..."
                        rows={3}
                        className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 text-xs text-white placeholder-white/30 focus:border-emerald-400 focus:outline-none"
                      />
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#141414] p-3">
                      <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-cyan-400">
                        <span>2. Working Mechanism</span>
                        <span className="text-[10px] text-white/40">How is data recorded?</span>
                      </label>
                      <textarea
                        value={currentState.instrument.working}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAnswers((prev) => {
                            const cur = prev[currentQ.id];
                            return {
                              ...prev,
                              [currentQ.id]: {
                                ...cur,
                                instrument: { ...cur.instrument, working: val },
                              },
                            };
                          });
                        }}
                        placeholder="Explain step-by-step how the instrument operates..."
                        rows={3}
                        className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 text-xs text-white placeholder-white/30 focus:border-cyan-400 focus:outline-none"
                      />
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#141414] p-3">
                      <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-amber-400">
                        <span>3. Precautions, Standards & Units</span>
                        <span className="text-[10px] text-white/40">Measurement unit & error prevention</span>
                      </label>
                      <textarea
                        value={currentState.instrument.precautionsOrUnits}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAnswers((prev) => {
                            const cur = prev[currentQ.id];
                            return {
                              ...prev,
                              [currentQ.id]: {
                                ...cur,
                                instrument: { ...cur.instrument, precautionsOrUnits: val },
                              },
                            };
                          });
                        }}
                        placeholder="e.g. Unit of measurement, placement in open area away from shelter..."
                        rows={2}
                        className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 text-xs text-white placeholder-white/30 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>
                ) : currentState?.inputMode === "structured" &&
                  (currentQ.archetype === "give_reasons" || currentQ.archetype === "points") ? (
                  /* STEP-WISE BULLETED POINTS */
                  <div className="space-y-2">
                    {currentState.points.map((pt, pIdx) => (
                      <div key={pIdx} className="rounded-xl border border-white/10 bg-[#141414] p-3">
                        <label className="mb-1 block text-xs font-bold text-amber-300">
                          Step / Reason #{pIdx + 1}
                        </label>
                        <textarea
                          value={pt}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAnswers((prev) => {
                              const cur = prev[currentQ.id];
                              const nextPts = [...cur.points];
                              nextPts[pIdx] = val;
                              return { ...prev, [currentQ.id]: { ...cur, points: nextPts } };
                            });
                          }}
                          placeholder={`Enter scientific point #${pIdx + 1}...`}
                          rows={2}
                          className="w-full rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-white placeholder-white/30 focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                    ))}
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setAnswers((prev) => {
                            const cur = prev[currentQ.id];
                            return {
                              ...prev,
                              [currentQ.id]: {
                                ...cur,
                                points: [...cur.points, ""],
                              },
                            };
                          });
                        }}
                        className="text-xs font-semibold text-amber-300 hover:underline"
                      >
                        + Add Next Step / Reason
                      </button>
                    </div>
                  </div>
                ) : (
                  /* FREEFORM PARAGRAPH TEXTAREA */
                  <div className="rounded-xl border border-white/10 bg-[#141414] p-3">
                    <textarea
                      value={currentState?.rawText || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAnswers((prev) => {
                          const cur = prev[currentQ.id];
                          return { ...prev, [currentQ.id]: { ...cur, rawText: val } };
                        });
                      }}
                      placeholder="Write your complete answer here. Integrate mandatory CBSE keywords..."
                      rows={8}
                      className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs leading-relaxed text-white placeholder-white/30 focus:border-indigo-400 focus:outline-none"
                    />
                    <div className="mt-2 flex items-center justify-between text-[11px] text-white/40">
                      <span>{currentState?.rawText?.trim().split(/\s+/).filter(Boolean).length || 0} words</span>
                      <span>Target: ~{currentQ.marks * 25} words</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION BAR */}
              <div className="mt-4 flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={handleGrade}
                  disabled={grading || aggregatedText.trim().length < 5}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
                >
                  {grading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>CBSE Examiner Evaluating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Evaluate with Drona AI Examiner</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: EVALUATION RESULT & TOPPER EXEMPLAR (5 Cols) */}
            <div className="flex flex-col overflow-y-auto bg-[#101010] p-4 sm:p-6 lg:col-span-5">
              {currentResult ? (
                /* EVALUATION RESULTS CARD */
                <div className="space-y-4">
                  {/* Score Hero Banner */}
                  <div
                    className={`rounded-2xl border p-4 ${
                      currentResult.percentage >= 80
                        ? "border-emerald-500/40 bg-emerald-950/20"
                        : currentResult.percentage >= 60
                        ? "border-amber-500/40 bg-amber-950/20"
                        : "border-rose-500/40 bg-rose-950/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-white/60">
                        Examiner Score
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          currentResult.percentage >= 80
                            ? "bg-emerald-500/20 text-emerald-300"
                            : currentResult.percentage >= 60
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        {currentResult.cbse_band}
                      </span>
                    </div>

                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-white">
                        {currentResult.score}
                      </span>
                      <span className="text-sm font-semibold text-white/50">
                        / {currentResult.max_marks} Marks
                      </span>
                      <span className="ml-auto text-sm font-bold text-white">
                        {currentResult.percentage}%
                      </span>
                    </div>

                    <p className="mt-3 text-xs leading-relaxed text-white/80">
                      {currentResult.examiner_comment}
                    </p>
                  </div>

                  {/* STEP-BY-STEP RUBRIC BREAKDOWN */}
                  <div className="rounded-xl border border-white/10 bg-[#161616] p-3.5">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-drona-cyan">
                      <Award className="h-4 w-4" />
                      Step-by-Step Marking Breakdown
                    </h4>

                    <div className="mt-3 space-y-2.5">
                      {currentResult.rubric_breakdown.map((step, sIdx) => (
                        <div
                          key={sIdx}
                          className="rounded-lg border border-white/5 bg-black/30 p-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">
                              {step.step}
                            </span>
                            <span
                              className={`text-xs font-bold ${
                                step.marks_awarded === step.max_marks
                                  ? "text-emerald-400"
                                  : step.marks_awarded > 0
                                  ? "text-amber-400"
                                  : "text-rose-400"
                              }`}
                            >
                              {step.marks_awarded} / {step.max_marks}m
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-white/60">
                            {step.feedback}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* KEYWORD MATCH ANALYSIS */}
                  <div className="rounded-xl border border-white/10 bg-[#161616] p-3.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white/70">
                      Examiner Keyword Audit
                    </h4>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {currentResult.keyword_analysis.matched.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
                        >
                          <Check className="h-2.5 w-2.5 text-emerald-400" />
                          {kw}
                        </span>
                      ))}
                      {currentResult.keyword_analysis.missing.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300"
                        >
                          <X className="h-2.5 w-2.5 text-rose-400" />
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* TOPPER MODEL EXEMPLAR */}
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
                        <BookOpen className="h-4 w-4" />
                        CBSE Topper Exemplar Answer
                      </span>
                      <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        100% Score
                      </span>
                    </div>

                    <div className="mt-3 whitespace-pre-line rounded-lg border border-amber-500/20 bg-black/40 p-3 text-xs leading-relaxed text-amber-100/90 font-mono">
                      {currentQ.exemplar_answer}
                    </div>

                    {currentQ.examiner_tips ? (
                      <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                        <span className="font-bold">🎯 Examiner Scoring Tip:</span>{" "}
                        {currentQ.examiner_tips}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                /* EMPTY STATE / GUIDELINES BEFORE EVALUATION */
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 mb-4">
                    <Award className="h-7 w-7" />
                  </div>
                  <h4 className="text-base font-bold text-white">
                    CBSE Board Marking Guidelines
                  </h4>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">
                    Indian school examinations evaluate subjective answers on structured step-wise criteria rather than word volume alone.
                  </p>

                  <div className="mt-6 w-full space-y-2 text-left">
                    <div className="rounded-xl border border-white/5 bg-[#141414] p-3 text-xs text-white/80">
                      <span className="font-bold text-indigo-300">1. Step Marks:</span> Partial credit is strictly awarded for formula, principle, diagram reference, and working.
                    </div>
                    <div className="rounded-xl border border-white/5 bg-[#141414] p-3 text-xs text-white/80">
                      <span className="font-bold text-emerald-300">2. Mandatory Keywords:</span> Ensure all highlighted terms in the trap bar are used in your response.
                    </div>
                    <div className="rounded-xl border border-white/5 bg-[#141414] p-3 text-xs text-white/80">
                      <span className="font-bold text-amber-300">3. Distinction Rules:</span> Always write differences side-by-side in a comparative table with corresponding points.
                    </div>
                  </div>

                  <p className="mt-6 text-[11px] text-white/40">
                    Click &ldquo;Evaluate with Drona AI Examiner&rdquo; when your answer is ready.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* BOTTOM NAV BAR */}
        <div className="flex shrink-0 items-center justify-between border-t border-white/10 bg-[#141414] px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
            disabled={currentIdx === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#1c1c1c] px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Previous Question</span>
          </button>

          <span className="text-xs font-medium text-white/50">
            {filteredQuestions.length > 0
              ? `Question ${currentIdx + 1} of ${filteredQuestions.length}`
              : "0 Questions"}
          </span>

          <button
            type="button"
            onClick={() => setCurrentIdx((prev) => Math.min(filteredQuestions.length - 1, prev + 1))}
            disabled={currentIdx >= filteredQuestions.length - 1}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#1c1c1c] px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-30"
          >
            <span>Next Question</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
