"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  AlertCircle,
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { BooleanFlagsWidget } from "@/components/drona/BooleanFlagsWidget";
import { MatchFollowingWidget } from "@/components/drona/MatchFollowingWidget";
import { MultipleChoiceWidget } from "@/components/drona/MultipleChoiceWidget";
import { MultipleSelectWidget } from "@/components/drona/MultipleSelectWidget";
import { NumericWidget } from "@/components/drona/NumericWidget";
import { OrderingWidget } from "@/components/drona/OrderingWidget";
import { TextEntryWidget } from "@/components/drona/TextEntryWidget";
import { DronaProgressStore } from "@/lib/progress-store";
import { useLayoutPreference } from "@/components/drona/LayoutPreferenceProvider";
import {
  type AnswerState,
  cn,
  getHints,
  getSolution,
  gradeItem,
  initAnswer,
  normalizeOrderingItems,
} from "@/lib/utils";
import type {
  BooleanFlagsItem,
  ChapterPracticeItem,
  ChapterPracticeResponse,
  MatchFollowingItem,
  MistakeRecord,
  MultiStepOrderingItem,
  MultipleChoiceItem,
  MultipleSelectItem,
  NumericEntryItem,
  ProgressState,
  QuizItem,
} from "@/lib/types";

type TabMode = "workout" | "mock" | "vault";

interface PracticeArenaModalProps {
  open: boolean;
  onClose: () => void;
  chapterPath: string;
  chapterName: string;
  progress: ProgressState;
  onProgressUpdate: (next: ProgressState) => void;
  initialTab?: TabMode;
  /** Header badge opens all chapters; chapter tools stay chapter-scoped. */
  vaultScope?: "chapter" | "all";
}

const MOCK_TIME_LIMIT_SECONDS = 900; // 15 Minutes

export function PracticeArenaModal({
  open,
  onClose,
  chapterPath,
  chapterName,
  progress,
  onProgressUpdate,
  initialTab = "workout",
  vaultScope = "chapter",
}: PracticeArenaModalProps) {
  const { layoutId } = useLayoutPreference();
  const isWarm = layoutId === "warm";
  const [tab, setTab] = useState<TabMode>(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Practice items & answer state
  const [items, setItems] = useState<ChapterPracticeItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  // Workout state
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, boolean>>({});
  const [revealedHints, setRevealedHints] = useState<Record<string, number>>({});
  const [workoutFinished, setWorkoutFinished] = useState(false);

  // Mock Exam state
  const [mockRemainingSeconds, setMockRemainingSeconds] = useState(MOCK_TIME_LIMIT_SECONDS);
  const [mockSubmitted, setMockSubmitted] = useState(false);
  const [mockScore, setMockScore] = useState<number | null>(null);
  const [mockGraded, setMockGraded] = useState<Record<string, boolean>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Mistakes: chapter-scoped from lesson tools, or all chapters from header badge
  const chapterMistakes = useMemo(
    () =>
      DronaProgressStore.getMistakes(
        progress,
        vaultScope === "all" ? undefined : chapterPath || undefined
      ),
    [progress, chapterPath, vaultScope]
  );

  const scopeLabel =
    vaultScope === "all" ? "All chapters" : chapterName || "This chapter";

  // Vault practice override
  const [vaultPracticeActive, setVaultPracticeActive] = useState(false);

  const fetchQuestions = useCallback(
    async (mode: "workout" | "mock") => {
      setLoading(true);
      setError(null);
      setWorkoutFinished(false);
      setMockSubmitted(false);
      setMockScore(null);
      setMockGraded({});
      setSubmittedAnswers({});
      setRevealedHints({});
      setCurrentIndex(0);
      setVaultPracticeActive(false);

      if (mode === "mock") {
        setMockRemainingSeconds(MOCK_TIME_LIMIT_SECONDS);
      }

      try {
        const res = await fetch(
          `/api/practice?chapterPath=${encodeURIComponent(chapterPath)}&mode=${mode}`
        );
        if (!res.ok) {
          throw new Error("Failed to load questions from chapter pool");
        }
        const data: ChapterPracticeResponse = await res.json();
        setItems(data.questions);

        const initialAnswers: Record<string, AnswerState> = {};
        for (const it of data.questions) {
          initialAnswers[it.id] = initAnswer(it);
        }
        setAnswers(initialAnswers);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error loading questions";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [chapterPath]
  );

  // Sync initial tab when modal opens
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      if (initialTab !== "vault") {
        void fetchQuestions(initialTab);
      }
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [open, initialTab, fetchQuestions]);

  // Handle Tab Switching
  const handleTabChange = (newTab: TabMode) => {
    setTab(newTab);
    if (timerRef.current) clearInterval(timerRef.current);
    if (newTab === "vault") {
      setVaultPracticeActive(false);
    } else {
      void fetchQuestions(newTab);
    }
  };

  // Mock Exam Timer
  useEffect(() => {
    if (tab === "mock" && !mockSubmitted && !loading && items.length > 0) {
      timerRef.current = setInterval(() => {
        setMockRemainingSeconds((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            submitMockExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [tab, mockSubmitted, loading, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start dedicated mistake vault workout
  const startMistakeWorkout = () => {
    if (chapterMistakes.length === 0) return;
    const mistakeItems: ChapterPracticeItem[] = chapterMistakes.map((m, idx) => ({
      ...m.item,
      lessonPath: m.lessonPath,
      lessonName: m.lessonName || "Review",
      lessonIndex: idx + 1,
    }));

    setItems(mistakeItems);
    const initialAnswers: Record<string, AnswerState> = {};
    for (const it of mistakeItems) {
      initialAnswers[it.id] = initAnswer(it);
    }
    setAnswers(initialAnswers);
    setSubmittedAnswers({});
    setRevealedHints({});
    setCurrentIndex(0);
    setWorkoutFinished(false);
    setVaultPracticeActive(true);
  };

  const isInstantCheckMode = tab === "workout" || vaultPracticeActive;

  // Instant Check in Workout / Mistake Vault mode
  const handleCheckWorkoutQuestion = (item: ChapterPracticeItem) => {
    const isCorrect = gradeItem(item, answers[item.id]);
    setSubmittedAnswers((prev) => ({ ...prev, [item.id]: isCorrect }));

    if (isCorrect) {
      // Clear from mistake vault if previously recorded
      const updated = DronaProgressStore.clearMistakes(progress, [item.id]);
      onProgressUpdate(updated);
    } else {
      // Record to mistake vault
      const updated = DronaProgressStore.recordMistakes(
        progress,
        item.lessonPath,
        [item],
        item.lessonName
      );
      onProgressUpdate(updated);
    }

    // Check if all questions have been checked
    const allChecked = items.every(
      (it) => it.id === item.id || submittedAnswers[it.id] !== undefined
    );
    if (allChecked) {
      setWorkoutFinished(true);
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });
    }
  };

  const startSingleMistake = (mistake: MistakeRecord) => {
    const item: ChapterPracticeItem = {
      ...mistake.item,
      lessonPath: mistake.lessonPath,
      lessonName: mistake.lessonName || "Review",
      lessonIndex: 1,
    };
    setItems([item]);
    setAnswers({ [item.id]: initAnswer(item) });
    setSubmittedAnswers({});
    setRevealedHints({});
    setCurrentIndex(0);
    setWorkoutFinished(false);
    setVaultPracticeActive(true);
  };

  // Submit Mock Exam
  const submitMockExam = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const graded: Record<string, boolean> = {};
    let correctCount = 0;
    const failedItems: QuizItem[] = [];
    const solvedIds: string[] = [];

    for (const item of items) {
      const ok = gradeItem(item, answers[item.id]);
      graded[item.id] = ok;
      if (ok) {
        correctCount += 1;
        solvedIds.push(item.id);
      } else {
        failedItems.push(item);
      }
    }

    const total = items.length || 1;
    const calculatedScore = Math.round((correctCount / total) * 100);

    setMockGraded(graded);
    setMockScore(calculatedScore);
    setMockSubmitted(true);

    // Save results into progress store
    let nextProg = progress;
    if (failedItems.length > 0) {
      nextProg = DronaProgressStore.recordMistakes(
        nextProg,
        chapterPath,
        failedItems,
        chapterName
      );
    }
    if (solvedIds.length > 0) {
      nextProg = DronaProgressStore.clearMistakes(nextProg, solvedIds);
    }
    onProgressUpdate(nextProg);

    if (calculatedScore >= 80) {
      confetti({
        particleCount: 140,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#50C878", "#00FFFF", "#FFBF00"],
      });
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const currentItem = items[currentIndex];

  if (!open) return null;

  const shellSurface = isWarm
    ? "border-[color:var(--layout-border)] bg-[color:var(--layout-surface)] text-[color:var(--layout-text)]"
    : "border-white/10 bg-[#141414] text-white";
  const headerSurface = isWarm
    ? "border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)]"
    : "border-white/10 bg-[#181818]";
  const mutedText = isWarm
    ? "text-[color:var(--layout-muted)]"
    : "text-white/60";
  const cardSurface = isWarm
    ? "border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)]"
    : "border-white/10 bg-[#1a1a1a]";
  const tabRail = isWarm
    ? "border-[color:var(--layout-border)] bg-[color:var(--layout-bg)]"
    : "border-white/10 bg-[#0e0e0e]";
  const inactiveTab = isWarm
    ? "text-[color:var(--layout-muted)] hover:text-[color:var(--layout-text)]"
    : "text-white/60 hover:text-white";
  const backdrop = isWarm ? "bg-[#1C1410]/45" : "bg-black/85";
  const questionPanel = isWarm
    ? "border-[color:var(--layout-border)] bg-[color:var(--layout-bg)] text-[color:var(--layout-text)]"
    : "border-white/10 bg-[#181818] text-white";
  const chip = isWarm
    ? "border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] text-[color:var(--layout-text)]"
    : "bg-white/10 text-white";
  const navBtn = isWarm
    ? "border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] text-[color:var(--layout-text)] hover:bg-[color:var(--layout-accent-soft)]"
    : "border-white/10 bg-[#1a1a1a] text-white/70 hover:bg-white/10";
  const statusBorder = isWarm
    ? "border-[color:var(--layout-border)]"
    : "border-white/10";

  return (
    <AnimatePresence>
      <motion.div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center p-2 backdrop-blur-md sm:p-4",
          backdrop
        )}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          data-practice-arena
          className={cn(
            "flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl",
            shellSurface
          )}
          style={
            isWarm
              ? undefined
              : ({
                  // Dark arena tokens for Soft Studio / Focus Theater
                  "--layout-bg": "#111111",
                  "--layout-surface": "#181818",
                  "--layout-surface-2": "#222222",
                  "--layout-border": "rgba(255,255,255,0.12)",
                  "--layout-text": "#F5F5F5",
                  "--layout-muted": "rgba(255,255,255,0.55)",
                  "--layout-accent": "#50C878",
                  "--layout-accent-soft": "rgba(80,200,120,0.16)",
                  "--layout-accent-ink": "#111111",
                } as CSSProperties)
          }
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
        >
          {/* Header */}
          <div
            className={cn(
              "flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6",
              headerSurface
            )}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-drona-amber/20 text-drona-amber text-xs font-bold">
                  ⚡
                </span>
                <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--layout-accent)]">
                  Drona Practice Arena
                </p>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px]",
                    isWarm
                      ? "bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-muted)]"
                      : "bg-white/10 text-white/50"
                  )}
                >
                  {tab === "vault" ? scopeLabel : chapterName}
                </span>
              </div>
              <h2
                className={cn(
                  "text-sm font-semibold sm:text-base",
                  isWarm ? "text-[color:var(--layout-text)]" : "text-white"
                )}
              >
                {tab === "workout" && "Infinite Active Recall Workout"}
                {tab === "mock" && "15-Minute CBSE Chapter Mock Exam"}
                {tab === "vault" && "Mistake Vault (Shuddhi Bank)"}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Mode Tabs */}
              <div
                className={cn(
                  "flex items-center rounded-xl border p-1 text-xs",
                  tabRail
                )}
              >
                <button
                  type="button"
                  onClick={() => handleTabChange("workout")}
                  disabled={!chapterPath}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition disabled:opacity-40",
                    tab === "workout"
                      ? "bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-accent)] shadow-sm"
                      : inactiveTab
                  )}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Workout</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.2 text-[10px]",
                      isWarm
                        ? "bg-[color:var(--layout-surface)]"
                        : "bg-white/10"
                    )}
                  >
                    5 Qs
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange("mock")}
                  disabled={!chapterPath}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition disabled:opacity-40",
                    tab === "mock"
                      ? "bg-drona-amber/20 text-drona-amber shadow-sm"
                      : inactiveTab
                  )}
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Mock Exam</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.2 text-[10px]",
                      isWarm
                        ? "bg-[color:var(--layout-surface)]"
                        : "bg-white/10"
                    )}
                  >
                    10 Qs
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange("vault")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition",
                    tab === "vault"
                      ? "bg-drona-rose/20 text-drona-rose shadow-sm"
                      : inactiveTab
                  )}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Mistakes</span>
                  {chapterMistakes.length > 0 ? (
                    <span className="rounded-full bg-drona-rose/80 px-1.5 text-[10px] font-bold text-white">
                      {chapterMistakes.length}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "rounded px-1.5 text-[10px]",
                        isWarm
                          ? "bg-[color:var(--layout-surface)] text-[color:var(--layout-muted)]"
                          : "bg-white/10 text-white/50"
                      )}
                    >
                      0
                    </span>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className={cn(
                  "rounded-lg p-1.5 transition",
                  isWarm
                    ? "text-[color:var(--layout-muted)] hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-text)]"
                    : "text-white/50 hover:bg-white/10 hover:text-white"
                )}
                aria-label="Close Practice Arena"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Modal Content Body */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--layout-accent)] border-t-transparent" />
                <p className={cn("text-xs", mutedText)}>
                  Sampling fresh questions across the chapter pool…
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <AlertCircle className="h-8 w-8 text-drona-rose" />
                <p className="text-sm text-drona-rose">{error}</p>
                <button
                  type="button"
                  onClick={() => fetchQuestions(tab === "mock" ? "mock" : "workout")}
                  className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  Retry Loading
                </button>
              </div>
            ) : tab === "vault" && !vaultPracticeActive ? (
              /* TAB 3: MISTAKE VAULT OVERVIEW */
              <div className="flex flex-1 flex-col">
                <div
                  className={cn(
                    "mb-4 flex items-center justify-between gap-3 rounded-xl border p-4",
                    cardSurface
                  )}
                >
                  <div>
                    <h3
                      className={cn(
                        "text-sm font-bold sm:text-base",
                        isWarm ? "text-[color:var(--layout-text)]" : "text-white"
                      )}
                    >
                      Shuddhi Mistake Vault
                    </h3>
                    <p className={cn("mt-1 text-xs leading-relaxed", mutedText)}>
                      Wrong answers from exit gates and workouts land here. Retry them —
                      get one correct to clear it from the vault.
                      {vaultScope === "all"
                        ? " Showing mistakes across every chapter."
                        : null}
                    </p>
                  </div>
                  {chapterMistakes.length > 0 ? (
                    <button
                      type="button"
                      onClick={startMistakeWorkout}
                      className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-drona-amber to-drona-rose px-4 py-2.5 text-xs font-bold text-[#111111] transition hover:brightness-110"
                    >
                      <Zap className="h-4 w-4 fill-current" />
                      Retry All ({chapterMistakes.length})
                    </button>
                  ) : null}
                </div>

                {chapterMistakes.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-drona-emerald/20 text-drona-emerald">
                      <ShieldCheck className="h-8 w-8" />
                    </div>
                    <h4
                      className={cn(
                        "text-lg font-bold",
                        isWarm ? "text-[color:var(--layout-text)]" : "text-white"
                      )}
                    >
                      Vault 100% Clean!
                    </h4>
                    <p className={cn("max-w-md text-xs", mutedText)}>
                      {vaultScope === "all"
                        ? "You have zero unresolved errors across all chapters."
                        : "You have zero unresolved errors in this chapter."}{" "}
                      {chapterPath
                        ? "Test your retention with an Infinite Workout or a 15-Minute Mock Exam."
                        : "Open a chapter lesson to start a Workout or Mock Exam."}
                    </p>
                    {chapterPath ? (
                      <button
                        type="button"
                        onClick={() => handleTabChange("workout")}
                        className="mt-2 flex items-center gap-1.5 rounded-xl bg-drona-emerald px-4 py-2.5 text-xs font-bold text-[#111111] transition hover:brightness-110"
                      >
                        <Zap className="h-4 w-4" /> Start Quick Workout
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {chapterMistakes.map((m, idx) => (
                      <div
                        key={m.id || idx}
                        className={cn(
                          "flex flex-col gap-3 rounded-xl border p-4 transition",
                          cardSurface,
                          isWarm
                            ? "hover:border-[color:var(--layout-accent)]/40"
                            : "hover:border-white/20"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="rounded bg-[color:var(--layout-accent-soft)] px-2 py-0.5 font-semibold text-[color:var(--layout-accent)]">
                            {m.lessonName || "Chapter Question"}
                            {vaultScope === "all" && m.lessonPath
                              ? ` · ${m.lessonPath.split("/").slice(1, 3).join(" / ")}`
                              : null}
                          </span>
                          <span className={mutedText}>
                            Failed {m.attemptCount} time
                            {m.attemptCount === 1 ? "" : "s"}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "text-sm font-medium",
                            isWarm
                              ? "text-[color:var(--layout-text)]"
                              : "text-white/90"
                          )}
                        >
                          {m.question}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className={cn("text-xs", mutedText)}>
                            Pick an answer and tap{" "}
                            <span className="font-semibold text-drona-emerald">
                              Check Answer
                            </span>{" "}
                            to clear it.
                          </p>
                          <button
                            type="button"
                            onClick={() => startSingleMistake(m)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-drona-amber/50 bg-drona-amber/15 px-3 py-1.5 text-xs font-bold text-drona-amber transition hover:bg-drona-amber/25"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Retry this one
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : tab === "mock" && mockSubmitted ? (
              /* TAB 2: MOCK EXAM SCORECARD */
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-drona-amber/20 text-drona-amber shadow-lg"
                >
                  <Trophy className="h-10 w-10" />
                </motion.div>
                <h3 className="text-2xl font-bold text-white">CBSE Mock Exam Result</h3>
                <p className="mt-1 text-xs text-white/60">
                  Time Spent: {formatTimer(MOCK_TIME_LIMIT_SECONDS - mockRemainingSeconds)} / 15:00
                </p>

                <div className="my-5 flex items-center gap-4">
                  <div className="rounded-2xl border border-drona-cyan/40 bg-drona-cyan/10 px-6 py-4">
                    <span className="text-xs uppercase tracking-wider text-drona-cyan font-semibold">
                      Your Score
                    </span>
                    <p className="text-3xl font-extrabold text-white">{mockScore}%</p>
                  </div>

                  <div className="rounded-2xl border border-drona-emerald/40 bg-drona-emerald/10 px-6 py-4">
                    <span className="text-xs uppercase tracking-wider text-drona-emerald font-semibold">
                      CBSE Grade Band
                    </span>
                    <p className="text-xl font-bold text-drona-emerald">
                      {mockScore && mockScore >= 90
                        ? "A1 (Outstanding)"
                        : mockScore && mockScore >= 75
                          ? "A2 (Excellent)"
                          : mockScore && mockScore >= 60
                            ? "B1 (Good)"
                            : "Needs Revision"}
                    </p>
                  </div>
                </div>

                {/* Question Breakdown List */}
                <div className="w-full max-w-2xl space-y-2.5 text-left mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">
                    Question Analysis ({items.filter((it) => mockGraded[it.id]).length}/{items.length} Correct)
                  </h4>
                  {items.map((item, idx) => {
                    const isOk = mockGraded[item.id];
                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-3 text-xs ${
                          isOk
                            ? "border-drona-emerald/40 bg-drona-emerald/10 text-white"
                            : "border-drona-rose/40 bg-drona-rose/10 text-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-white/90">
                            Q{idx + 1}: {item.lessonName}
                          </span>
                          <span className={`font-bold ${isOk ? "text-drona-emerald" : "text-drona-rose"}`}>
                            {isOk ? "Correct ✓" : "Incorrect ✗"}
                          </span>
                        </div>
                        <p
                          className="text-sm"
                          style={{
                            color: isWarm ? "#1C1410" : "rgba(255,255,255,0.85)",
                          }}
                        >
                          {item.question}
                        </p>
                        {!isOk ? (
                          <p
                            className="mt-1.5 text-xs"
                            style={{
                              color: isWarm ? "#1C1410" : "rgba(255,255,255,0.9)",
                            }}
                          >
                            <span
                              className="font-semibold"
                              style={{ color: isWarm ? "#92400E" : "#FFBF00" }}
                            >
                              Correct Solution:{" "}
                            </span>
                            {getSolution(item)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fetchQuestions("mock")}
                    className="flex items-center gap-2 rounded-xl bg-drona-amber px-4 py-2.5 text-xs font-bold text-[#111111] transition hover:brightness-110"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retake Fresh Mock Exam
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange("vault")}
                    className="flex items-center gap-2 rounded-xl border border-drona-rose/50 bg-drona-rose/10 px-4 py-2.5 text-xs font-semibold text-drona-rose transition hover:bg-drona-rose/20"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    View Mistake Vault ({chapterMistakes.length})
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white/80 transition hover:bg-white/20"
                  >
                    Return to Lesson
                  </button>
                </div>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <HelpCircle
                  className={cn(
                    "mb-2 h-8 w-8",
                    isWarm ? "text-[color:var(--layout-muted)]" : "text-white/40"
                  )}
                />
                <p className={cn("text-sm", mutedText)}>
                  No quiz questions found for this chapter yet.
                </p>
              </div>
            ) : (
              /* ACTIVE QUESTION SOLVER (WORKOUT & ACTIVE MOCK EXAM) */
              <div className="flex flex-1 flex-col">
                {/* Status Bar */}
                <div
                  className={cn(
                    "mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3",
                    statusBorder
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-bold",
                        chip
                      )}
                    >
                      Q {currentIndex + 1} of {items.length}
                    </span>
                    <span className="rounded-lg border border-[color:var(--layout-accent)]/40 bg-[color:var(--layout-accent-soft)] px-2.5 py-1 text-xs font-medium text-[color:var(--layout-accent)]">
                      {currentItem.lessonName}
                    </span>
                    {vaultPracticeActive ? (
                      <span className="rounded-lg border border-drona-rose/40 bg-drona-rose/10 px-2.5 py-1 text-xs font-medium text-drona-rose">
                        🛡️ Mistake Review
                      </span>
                    ) : null}
                  </div>

                  {tab === "mock" ? (
                    <div
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-mono font-bold ${
                        mockRemainingSeconds < 120
                          ? "animate-pulse border-drona-rose/60 bg-drona-rose/20 text-drona-rose"
                          : "border-drona-amber/40 bg-drona-amber/10 text-drona-amber"
                      }`}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatTimer(mockRemainingSeconds)} Remaining</span>
                    </div>
                  ) : vaultPracticeActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        setVaultPracticeActive(false);
                        setItems([]);
                        setAnswers({});
                        setSubmittedAnswers({});
                      }}
                      className="flex items-center gap-1 text-xs font-semibold text-drona-rose hover:underline"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" /> Back to Vault List
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fetchQuestions("workout")}
                      className="flex items-center gap-1 text-xs font-semibold text-[color:var(--layout-accent)] hover:underline"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Shuffle New 5 Questions
                    </button>
                  )}
                </div>

                {/* Mock Exam Question Grid Navigation */}
                {tab === "mock" ? (
                  <div className="mb-4 flex flex-wrap items-center gap-1.5">
                    {items.map((it, idx) => {
                      const isCurrent = idx === currentIndex;
                      const hasAnswer =
                        answers[it.id] &&
                        (answers[it.id].type === "multiple_choice"
                          ? Boolean((answers[it.id] as { value: string | null }).value)
                          : answers[it.id].type === "multiple_select"
                            ? (answers[it.id] as { values: string[] }).values.length > 0
                            : true);

                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => setCurrentIndex(idx)}
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition",
                            isCurrent
                              ? "border-2 border-[color:var(--layout-accent)] bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-accent)] shadow"
                              : hasAnswer
                                ? "bg-drona-emerald/30 text-drona-emerald"
                                : isWarm
                                  ? "bg-[color:var(--layout-surface-2)] text-[color:var(--layout-muted)] hover:bg-[color:var(--layout-accent-soft)]"
                                  : "bg-white/10 text-white/60 hover:bg-white/20"
                          )}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {/* Question Render Container — must match layout text tokens */}
                <div
                  className={cn(
                    "flex-1 rounded-2xl border p-5 shadow-inner sm:p-6",
                    questionPanel
                  )}
                >
                  {currentItem.type === "multiple_choice" &&
                  answers[currentItem.id]?.type === "multiple_choice" ? (
                    <MultipleChoiceWidget
                      question={currentItem.question}
                      options={(currentItem as MultipleChoiceItem).options}
                      value={(answers[currentItem.id] as { value: string | null }).value}
                      disabled={isInstantCheckMode && submittedAnswers[currentItem.id] !== undefined}
                      onChange={(value) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [currentItem.id]: { type: "multiple_choice", value },
                        }))
                      }
                    />
                  ) : null}

                  {currentItem.type === "multiple_select" &&
                  answers[currentItem.id]?.type === "multiple_select" ? (
                    <MultipleSelectWidget
                      question={currentItem.question}
                      options={(currentItem as MultipleSelectItem).options}
                      values={(answers[currentItem.id] as { values: string[] }).values}
                      disabled={isInstantCheckMode && submittedAnswers[currentItem.id] !== undefined}
                      onChange={(values) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [currentItem.id]: { type: "multiple_select", values },
                        }))
                      }
                    />
                  ) : null}

                  {currentItem.type === "match_following" &&
                  answers[currentItem.id]?.type === "match_following" ? (
                    <MatchFollowingWidget
                      question={currentItem.question}
                      pairs={(currentItem as MatchFollowingItem).pairs}
                      matches={(answers[currentItem.id] as { matches: Record<string, string> }).matches}
                      disabled={isInstantCheckMode && submittedAnswers[currentItem.id] !== undefined}
                      onChange={(left, right) =>
                        setAnswers((prev) => {
                          const curr = prev[currentItem.id];
                          if (curr?.type !== "match_following") return prev;
                          return {
                            ...prev,
                            [currentItem.id]: {
                              type: "match_following",
                              matches: { ...curr.matches, [left]: right },
                            },
                          };
                        })
                      }
                    />
                  ) : null}

                  {currentItem.type === "multi_step_ordering" &&
                  answers[currentItem.id]?.type === "multi_step_ordering" ? (
                    <OrderingWidget
                      question={currentItem.question}
                      items={normalizeOrderingItems(currentItem as MultiStepOrderingItem)}
                      order={(answers[currentItem.id] as { order: string[] }).order}
                      disabled={isInstantCheckMode && submittedAnswers[currentItem.id] !== undefined}
                      onChange={(order) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [currentItem.id]: { type: "multi_step_ordering", order },
                        }))
                      }
                    />
                  ) : null}

                  {currentItem.type === "numeric_entry" &&
                  answers[currentItem.id]?.type === "numeric_entry" ? (
                    <NumericWidget
                      question={currentItem.question}
                      unit={(currentItem as NumericEntryItem).unit}
                      value={(answers[currentItem.id] as { value: string }).value}
                      disabled={isInstantCheckMode && submittedAnswers[currentItem.id] !== undefined}
                      onChange={(value) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [currentItem.id]: { type: "numeric_entry", value },
                        }))
                      }
                    />
                  ) : null}

                  {currentItem.type === "boolean_flags" &&
                  answers[currentItem.id]?.type === "boolean_flags" ? (
                    <BooleanFlagsWidget
                      question={currentItem.question}
                      statements={(currentItem as BooleanFlagsItem).statements}
                      values={(answers[currentItem.id] as { values: (boolean | null)[] }).values}
                      disabled={isInstantCheckMode && submittedAnswers[currentItem.id] !== undefined}
                      onChange={(index, val) =>
                        setAnswers((prev) => {
                          const curr = prev[currentItem.id];
                          if (curr?.type !== "boolean_flags") return prev;
                          const nextVals = [...curr.values];
                          nextVals[index] = val;
                          return {
                            ...prev,
                            [currentItem.id]: { type: "boolean_flags", values: nextVals },
                          };
                        })
                      }
                    />
                  ) : null}

                  {currentItem.type === "text_entry" &&
                  answers[currentItem.id]?.type === "text_entry" ? (
                    <TextEntryWidget
                      question={currentItem.question}
                      value={(answers[currentItem.id] as { value: string }).value}
                      disabled={isInstantCheckMode && submittedAnswers[currentItem.id] !== undefined}
                      onChange={(value) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [currentItem.id]: { type: "text_entry", value },
                        }))
                      }
                    />
                  ) : null}

                  {/* Instant-check feedback (Workout + Mistake Vault) */}
                  {isInstantCheckMode && submittedAnswers[currentItem.id] !== undefined ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "mt-4 rounded-xl border p-4",
                        submittedAnswers[currentItem.id]
                          ? isWarm
                            ? "border-emerald-700/30 bg-emerald-50"
                            : "border-drona-emerald/40 bg-drona-emerald/10"
                          : isWarm
                            ? "border-rose-700/30 bg-rose-50"
                            : "border-drona-rose/40 bg-drona-rose/10"
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                        {submittedAnswers[currentItem.id] ? (
                          <>
                            <CheckCircle2
                              className={cn(
                                "h-5 w-5",
                                isWarm ? "text-emerald-700" : "text-drona-emerald"
                              )}
                            />
                            <span
                              className={
                                isWarm ? "text-emerald-800" : "text-drona-emerald"
                              }
                            >
                              {vaultPracticeActive
                                ? "Cleared from Mistake Vault ✓"
                                : "Brilliant! Correct Answer ✓"}
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle
                              className={cn(
                                "h-5 w-5",
                                isWarm ? "text-rose-700" : "text-drona-rose"
                              )}
                            />
                            <span
                              className={
                                isWarm ? "text-rose-800" : "text-drona-rose"
                              }
                            >
                              Incorrect — Saved to Mistake Vault
                            </span>
                          </>
                        )}
                      </div>

                      <p
                        className="text-xs leading-relaxed"
                        style={{
                          color: isWarm ? "#1C1410" : "rgba(255,255,255,0.92)",
                        }}
                      >
                        <span
                          className="font-semibold"
                          style={{
                            color: isWarm ? "#166534" : "#50C878",
                          }}
                        >
                          Explanation:{" "}
                        </span>
                        {getSolution(currentItem)}
                      </p>
                    </motion.div>
                  ) : null}

                  {/* Progressive Hints (Workout / Vault) */}
                  {isInstantCheckMode && submittedAnswers[currentItem.id] === undefined ? (
                    <div
                      className={cn(
                        "mt-4 border-t pt-3",
                        isWarm
                          ? "border-[color:var(--layout-border)]"
                          : "border-white/5"
                      )}
                    >
                      {(() => {
                        const hints = getHints(currentItem);
                        const lvl = revealedHints[currentItem.id] ?? 0;
                        if (hints.length === 0) return null;

                        return (
                          <div className="space-y-1.5">
                            {lvl > 0 ? (
                              <div className="rounded-lg border border-drona-amber/30 bg-drona-amber/10 p-2.5 text-xs text-drona-amber">
                                <p className="mb-1 flex items-center gap-1.5 font-semibold">
                                  <Lightbulb className="h-3.5 w-3.5" /> Hint {lvl} of {hints.length}
                                </p>
                                <p
                                  className="text-xs leading-relaxed"
                                  style={{
                                    color: isWarm
                                      ? "#1C1410"
                                      : "rgba(255,255,255,0.92)",
                                  }}
                                >
                                  {hints[lvl - 1]}
                                </p>
                              </div>
                            ) : null}

                            {lvl < hints.length ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setRevealedHints((prev) => ({
                                    ...prev,
                                    [currentItem.id]: lvl + 1,
                                  }))
                                }
                                className="flex items-center gap-1 text-[11px] font-semibold text-[color:var(--layout-accent)] hover:underline"
                              >
                                <Lightbulb className="h-3 w-3" />
                                {lvl === 0 ? "Need a hint?" : "Show next hint"}
                              </button>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>

                {/* Footer Controls */}
                <div className="mt-4 flex flex-col gap-3">
                  {vaultPracticeActive && workoutFinished ? (
                    <div className="rounded-xl border border-drona-emerald/40 bg-drona-emerald/10 px-4 py-3 text-center text-xs text-drona-emerald">
                      <p className="font-bold">Mistake review complete</p>
                      <p
                        className={cn(
                          "mt-1",
                          isWarm
                            ? "text-[color:var(--layout-muted)]"
                            : "text-white/70"
                        )}
                      >
                        Correct answers are removed from the vault. Incorrect ones stay until you clear them.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setVaultPracticeActive(false);
                          setItems([]);
                          setAnswers({});
                          setSubmittedAnswers({});
                          setWorkoutFinished(false);
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-drona-emerald px-3 py-1.5 text-xs font-bold text-[#111111]"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Return to Vault
                      </button>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
                    disabled={currentIndex === 0}
                    className={cn(
                      "flex items-center gap-1 rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-30",
                      navBtn
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>

                  <div className="flex items-center gap-2">
                    {isInstantCheckMode && submittedAnswers[currentItem.id] === undefined ? (
                      <button
                        type="button"
                        onClick={() => handleCheckWorkoutQuestion(currentItem)}
                        className="rounded-xl bg-drona-emerald px-5 py-2 text-xs font-bold text-[#111111] transition hover:brightness-110 shadow-md"
                      >
                        Check Answer
                      </button>
                    ) : null}

                    {isInstantCheckMode &&
                    submittedAnswers[currentItem.id] === false ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSubmittedAnswers((prev) => {
                            const next = { ...prev };
                            delete next[currentItem.id];
                            return next;
                          });
                          setAnswers((prev) => ({
                            ...prev,
                            [currentItem.id]: initAnswer(currentItem),
                          }));
                        }}
                        className="rounded-xl border border-drona-amber/50 bg-drona-amber/15 px-4 py-2 text-xs font-bold text-drona-amber transition hover:bg-drona-amber/25"
                      >
                        Try Again
                      </button>
                    ) : null}

                    {tab === "mock" ? (
                      <button
                        type="button"
                        onClick={submitMockExam}
                        className="rounded-xl bg-gradient-to-r from-drona-amber to-drona-rose px-4 py-2 text-xs font-bold text-[#111111] transition hover:brightness-110 shadow-md"
                      >
                        Submit Mock Exam
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentIndex((idx) => Math.min(items.length - 1, idx + 1))}
                    disabled={currentIndex === items.length - 1}
                    className={cn(
                      "flex items-center gap-1 rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-30",
                      navBtn
                    )}
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
