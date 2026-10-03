"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { BooleanFlagsWidget } from "@/components/drona/BooleanFlagsWidget";
import { MatchFollowingWidget } from "@/components/drona/MatchFollowingWidget";
import { MultipleChoiceWidget } from "@/components/drona/MultipleChoiceWidget";
import { MultipleSelectWidget } from "@/components/drona/MultipleSelectWidget";
import { NumericWidget } from "@/components/drona/NumericWidget";
import { OrderingWidget } from "@/components/drona/OrderingWidget";
import { TextEntryWidget } from "@/components/drona/TextEntryWidget";
import {
  arraysEqual,
  checkNumeric,
  checkTextAnswer,
  getHints,
  getSolution,
  normalizeOrderingItems,
  sampleQuizItems,
} from "@/lib/utils";
import type {
  AppMode,
  BooleanFlagsItem,
  MatchFollowingItem,
  MultiStepOrderingItem,
  MultipleChoiceItem,
  MultipleSelectItem,
  NumericEntryItem,
  QuizItem,
  QuizPayload,
} from "@/lib/types";

type AnswerState =
  | { type: "numeric_entry"; value: string }
  | { type: "boolean_flags"; values: (boolean | null)[] }
  | { type: "multi_step_ordering"; order: string[] }
  | { type: "multiple_choice"; value: string | null }
  | { type: "multiple_select"; values: string[] }
  | { type: "match_following"; matches: Record<string, string> }
  | { type: "text_entry"; value: string };

interface QuizOverlayProps {
  open: boolean;
  quiz: QuizPayload;
  seenItemIds: string[];
  alreadyMastered?: boolean;
  isPracticeMode?: boolean;
  mode?: AppMode;
  canGoNext?: boolean;
  onNextLesson?: () => void;
  onCloseReview: () => void;
  onReviewVideo: (timestampSeconds: number) => void;
  onComplete: (result: {
    passed: boolean;
    score: number;
    attemptedIds: string[];
    failedItems?: QuizItem[];
    solvedIds?: string[];
  }) => void;
}

function initAnswer(item: QuizItem): AnswerState {
  if (item.type === "numeric_entry") {
    return { type: "numeric_entry", value: "" };
  }
  if (item.type === "boolean_flags") {
    return {
      type: "boolean_flags",
      values: item.statements.map(() => null),
    };
  }
  if (item.type === "multiple_choice") {
    return { type: "multiple_choice", value: null };
  }
  if (item.type === "multiple_select") {
    return { type: "multiple_select", values: [] };
  }
  if (item.type === "match_following") {
    return { type: "match_following", matches: {} };
  }
  if (item.type === "text_entry") {
    return { type: "text_entry", value: "" };
  }
  if (item.type === "multi_step_ordering") {
    const normalized = normalizeOrderingItems(item);
    const shuffled = [...normalized]
      .map((entry) => entry.id)
      .sort(() => Math.random() - 0.5);
    // Avoid starting already correct
    if (arraysEqual(shuffled, item.correct_order) && shuffled.length > 1) {
      const tmp = shuffled[0];
      shuffled[0] = shuffled[1];
      shuffled[1] = tmp;
    }
    return { type: "multi_step_ordering", order: shuffled };
  }
  return { type: "text_entry", value: "" };
}

function gradeItem(item: QuizItem, answer: AnswerState | undefined): boolean {
  if (!answer || answer.type !== item.type) return false;

  if (item.type === "numeric_entry" && answer.type === "numeric_entry") {
    return checkNumeric(
      answer.value,
      item.correct_answer,
      item.tolerance ?? 0
    );
  }

  if (item.type === "boolean_flags" && answer.type === "boolean_flags") {
    return item.statements.every(
      (statement, index) => answer.values[index] === statement.correct_flag
    );
  }

  if (item.type === "multi_step_ordering" && answer.type === "multi_step_ordering") {
    return arraysEqual(answer.order, item.correct_order);
  }

  if (item.type === "multiple_choice" && answer.type === "multiple_choice") {
    return (
      answer.value != null &&
      answer.value.trim().toLowerCase() ===
        item.correct_answer.trim().toLowerCase()
    );
  }

  if (item.type === "multiple_select" && answer.type === "multiple_select") {
    const normAnswer = answer.values.map((v) => v.trim().toLowerCase()).sort();
    const normCorrect = item.correct_answers
      .map((v) => v.trim().toLowerCase())
      .sort();
    if (normAnswer.length !== normCorrect.length) return false;
    return normAnswer.every((v, i) => v === normCorrect[i]);
  }

  if (item.type === "match_following" && answer.type === "match_following") {
    if (item.pairs.length === 0) return false;
    return item.pairs.every((pair) => {
      const matched = answer.matches[pair.left];
      return (
        matched != null &&
        matched.trim().toLowerCase() === pair.right.trim().toLowerCase()
      );
    });
  }

  if (item.type === "text_entry" && answer.type === "text_entry") {
    return checkTextAnswer(answer.value, item.correct_answer);
  }

  return false;
}

export function QuizOverlay({
  open,
  quiz,
  seenItemIds,
  alreadyMastered = false,
  isPracticeMode = false,
  mode = "learn",
  canGoNext = false,
  onNextLesson,
  onCloseReview,
  onReviewVideo,
  onComplete,
}: QuizOverlayProps) {
  const [attemptItems, setAttemptItems] = useState<QuizItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [phase, setPhase] = useState<"answering" | "failed" | "passed">(
    "answering"
  );
  const [hintLevel, setHintLevel] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const attemptBootstrappedRef = useRef(false);
  const seenItemIdsRef = useRef(seenItemIds);
  seenItemIdsRef.current = seenItemIds;

  const startAttempt = useCallback(() => {
    const sampled = sampleQuizItems(quiz, seenItemIdsRef.current);
    const nextAnswers: Record<string, AnswerState> = {};
    for (const item of sampled) {
      nextAnswers[item.id] = initAnswer(item);
    }
    setAttemptItems(sampled);
    setAnswers(nextAnswers);
    setPhase("answering");
    setHintLevel(0);
    setScore(0);
    setResults({});
  }, [quiz]);

  useEffect(() => {
    if (!open) {
      attemptBootstrappedRef.current = false;
      return;
    }

    // In Exam Prep / Practice Mode: ALWAYS start fresh practice attempt with interactive questions!
    if (isPracticeMode || mode === "exam_prep") {
      attemptBootstrappedRef.current = true;
      startAttempt();
      return;
    }

    // Already unlocked (in Learn mode) — show mastery handoff, but with option to Practice Again!
    if (alreadyMastered) {
      setPhase("passed");
      setScore(1);
      attemptBootstrappedRef.current = true;
      return;
    }

    // Only bootstrap one attempt per open cycle.
    // Do NOT restart when parent updates seenItemIds after a pass.
    if (attemptBootstrappedRef.current) return;
    attemptBootstrappedRef.current = true;
    startAttempt();
  }, [open, alreadyMastered, isPracticeMode, mode, startAttempt]);

  const remediationTs = useMemo(() => {
    const fromItems = attemptItems
      .map((item) => item.video_remediation_timestamp_seconds)
      .find((v) => typeof v === "number");
    return (
      fromItems ??
      quiz.video_remediation_timestamp_seconds ??
      0
    );
  }, [attemptItems, quiz.video_remediation_timestamp_seconds]);

  const submit = () => {
    const graded: Record<string, boolean> = {};
    let correct = 0;
    const failedItems: QuizItem[] = [];
    const solvedIds: string[] = [];
    for (const item of attemptItems) {
      const ok = gradeItem(item, answers[item.id]);
      graded[item.id] = ok;
      if (ok) {
        correct += 1;
        solvedIds.push(item.id);
      } else {
        failedItems.push(item);
      }
    }

    const total = attemptItems.length || 1;
    const nextScore = correct / total;
    // Spec: 100% required to pass gate
    const passed = correct === attemptItems.length && attemptItems.length > 0;

    setResults(graded);
    setScore(nextScore);

    if (passed) {
      setPhase("passed");
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.65 },
        colors: ["#50C878", "#00FFFF", "#FFBF00", "#FFFFFF"],
      });
      onComplete({
        passed: true,
        score: nextScore,
        attemptedIds: attemptItems.map((i) => i.id),
        failedItems,
        solvedIds,
      });
    } else {
      setPhase("failed");
      onComplete({
        passed: false,
        score: nextScore,
        attemptedIds: attemptItems.map((i) => i.id),
        failedItems,
        solvedIds,
      });
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        data-quiz-overlay
        className="absolute inset-0 z-30 flex items-end justify-center bg-[color:var(--layout-bg)]/85 p-4 backdrop-blur-sm sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          data-quiz-panel
          className="max-h-[90%] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[color:var(--layout-border)] bg-[color:var(--layout-surface)] text-[color:var(--layout-text)] shadow-2xl"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[color:var(--layout-border)] bg-[color:var(--layout-surface)]/95 px-5 py-4 backdrop-blur">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--layout-accent)]">
                {isPracticeMode || mode === "exam_prep"
                  ? "Drona Practice Arena"
                  : "Drona Exit Gate"}
              </p>
              <h3 className="text-lg font-semibold text-[color:var(--layout-text)]">
                {phase === "passed"
                  ? isPracticeMode || mode === "exam_prep"
                    ? "Practice Round Complete"
                    : "Lesson Mastered"
                  : isPracticeMode || mode === "exam_prep"
                    ? "Exam Practice Quiz"
                    : "Anti-Guessing Assessment"}
              </h3>
            </div>
            <div className="flex items-center gap-2.5">
              {phase === "passed" ? (
                <div className="rounded-full border border-[color:var(--layout-accent)]/40 bg-[color:var(--layout-accent)]/10 px-3 py-1 text-xs font-medium text-[color:var(--layout-accent)]">
                  {isPracticeMode || mode === "exam_prep" ? "Practiced ✓" : "Unlocked ✓"}
                </div>
              ) : (
                <div className="rounded-full border border-[color:var(--layout-accent)]/40 bg-[color:var(--layout-accent)]/10 px-3 py-1 text-xs font-medium text-[color:var(--layout-accent)]">
                  {attemptItems.length} item{attemptItems.length === 1 ? "" : "s"}
                  {isPracticeMode || mode === "exam_prep"
                    ? " · Exam Practice"
                    : " · 100% to unlock"}
                </div>
              )}
              <button
                type="button"
                onClick={onCloseReview}
                className="rounded-lg p-1 text-[color:var(--layout-muted)] transition hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-text)]"
                aria-label="Close quiz overlay"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-6 px-5 py-5">
            {phase === "passed" ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-[color:var(--layout-accent)]/20 text-[color:var(--layout-accent)]"
                >
                  <Sparkles className="h-10 w-10" />
                </motion.div>
                <h4 className="text-2xl font-bold text-[color:var(--layout-text)]">
                  {isPracticeMode || mode === "exam_prep"
                    ? "Practice Complete!"
                    : "You've mastered this lesson!"}
                </h4>
                <p className="max-w-md text-sm text-[color:var(--layout-text)]/70">
                  {isPracticeMode || mode === "exam_prep"
                    ? `Great practice session! You scored ${Math.round(score * 100)}%. Solve another round of questions to reinforce your memory or continue to the next lesson.`
                    : "Great work — this micro-lesson is complete. Click Next to continue to the next lesson."}
                </p>
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--layout-accent)]/50 bg-[color:var(--layout-accent)]/15 px-4 py-2 text-sm font-semibold text-[color:var(--layout-accent)]">
                  <CheckCircle2 className="h-4 w-4" /> Score{" "}
                  {Math.round(score * 100)}%
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={startAttempt}
                    className="inline-flex items-center gap-2 rounded-xl border border-drona-amber/60 bg-drona-amber/20 px-4 py-2.5 text-sm font-bold text-drona-amber transition hover:bg-drona-amber/30"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Practice Again (Fresh Questions)
                  </button>

                  {canGoNext && onNextLesson ? (
                    <button
                      type="button"
                      onClick={onNextLesson}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[color:var(--layout-accent)] to-[color:var(--layout-accent)] px-4 py-2.5 text-sm font-bold text-[color:var(--layout-accent-ink)] transition hover:brightness-110"
                    >
                      Next Micro-Lesson
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={onCloseReview}
                    className="inline-flex items-center justify-center rounded-xl border border-[color:var(--layout-border)] bg-[color:var(--layout-accent-soft)] px-4 py-2.5 text-sm font-semibold text-[color:var(--layout-text)]/80 transition hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-text)]"
                  >
                    Back to Video
                  </button>
                </div>
                {!canGoNext ? (
                  <p className="text-xs text-[color:var(--layout-muted)]">
                    You&apos;re at the end of the available lesson path.
                  </p>
                ) : null}
              </div>
            ) : null}

            {phase !== "passed"
              ? attemptItems.map((item, index) => {
                  const answer = answers[item.id];
                  const failed = phase === "failed" && results[item.id] === false;
                  const ok = phase === "failed" && results[item.id] === true;
                  const hints = getHints(item);

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-4 ${
                        failed
                          ? "border-drona-amber/50 bg-drona-amber/5"
                          : ok
                            ? "border-[color:var(--layout-accent)]/40 bg-[color:var(--layout-accent)]/5"
                            : "border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)]"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--layout-muted)]">
                          Question {index + 1}
                        </span>
                        {phase === "failed" ? (
                          ok ? (
                            <span className="inline-flex items-center gap-1 text-xs text-[color:var(--layout-accent)]">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Correct
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-drona-amber">
                              <XCircle className="h-3.5 w-3.5" /> Needs review
                            </span>
                          )
                        ) : null}
                      </div>

                      {item.type === "numeric_entry" &&
                      answer?.type === "numeric_entry" ? (
                        <NumericWidget
                          question={item.question}
                          unit={(item as NumericEntryItem).unit}
                          value={answer.value}
                          disabled={phase !== "answering"}
                          onChange={(value) =>
                            setAnswers((prev) => ({
                              ...prev,
                              [item.id]: { type: "numeric_entry", value },
                            }))
                          }
                        />
                      ) : null}

                      {item.type === "boolean_flags" &&
                      answer?.type === "boolean_flags" ? (
                        <BooleanFlagsWidget
                          question={item.question}
                          statements={(item as BooleanFlagsItem).statements}
                          values={answer.values}
                          disabled={phase !== "answering"}
                          onChange={(i, value) =>
                            setAnswers((prev) => {
                              const current = prev[item.id];
                              if (current?.type !== "boolean_flags") return prev;
                              const values = [...current.values];
                              values[i] = value;
                              return {
                                ...prev,
                                [item.id]: { type: "boolean_flags", values },
                              };
                            })
                          }
                        />
                      ) : null}

                      {item.type === "multi_step_ordering" &&
                      answer?.type === "multi_step_ordering" ? (
                        <OrderingWidget
                          question={item.question}
                          items={normalizeOrderingItems(
                            item as MultiStepOrderingItem
                          )}
                          order={answer.order}
                          disabled={phase !== "answering"}
                          onChange={(order) =>
                            setAnswers((prev) => ({
                              ...prev,
                              [item.id]: {
                                type: "multi_step_ordering",
                                order,
                              },
                            }))
                          }
                        />
                      ) : null}

                      {item.type === "multiple_choice" &&
                      answer?.type === "multiple_choice" ? (
                        <MultipleChoiceWidget
                          question={item.question}
                          options={(item as MultipleChoiceItem).options}
                          value={answer.value}
                          disabled={phase !== "answering"}
                          onChange={(value) =>
                            setAnswers((prev) => ({
                              ...prev,
                              [item.id]: { type: "multiple_choice", value },
                            }))
                          }
                        />
                      ) : null}

                      {item.type === "multiple_select" &&
                      answer?.type === "multiple_select" ? (
                        <MultipleSelectWidget
                          question={item.question}
                          options={(item as MultipleSelectItem).options}
                          values={answer.values}
                          disabled={phase !== "answering"}
                          onChange={(values) =>
                            setAnswers((prev) => ({
                              ...prev,
                              [item.id]: { type: "multiple_select", values },
                            }))
                          }
                        />
                      ) : null}

                      {item.type === "match_following" &&
                      answer?.type === "match_following" ? (
                        <MatchFollowingWidget
                          question={item.question}
                          pairs={(item as MatchFollowingItem).pairs}
                          matches={answer.matches}
                          disabled={phase !== "answering"}
                          onChange={(left, right) =>
                            setAnswers((prev) => {
                              const current = prev[item.id];
                              if (current?.type !== "match_following") return prev;
                              return {
                                ...prev,
                                [item.id]: {
                                  type: "match_following",
                                  matches: { ...current.matches, [left]: right },
                                },
                              };
                            })
                          }
                        />
                      ) : null}

                      {item.type === "text_entry" &&
                      answer?.type === "text_entry" ? (
                        <TextEntryWidget
                          question={item.question}
                          value={answer.value}
                          disabled={phase !== "answering"}
                          onChange={(value) =>
                            setAnswers((prev) => ({
                              ...prev,
                              [item.id]: { type: "text_entry", value },
                            }))
                          }
                        />
                      ) : null}

                      {failed ? (
                        <div className="mt-4 space-y-3 rounded-lg border border-[color:var(--layout-border)] bg-[color:var(--layout-bg)] p-3">
                          <div className="flex items-start gap-2 text-sm text-drona-amber">
                            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                            <div className="space-y-1">
                              <p className="font-medium">Progressive hints</p>
                              {hints.length === 0 ? (
                                <p className="text-[color:var(--layout-text)]/70">
                                  Revisit the concept in the video, then retry.
                                </p>
                              ) : (
                                hints
                                  .slice(0, Math.max(1, hintLevel + 1))
                                  .map((hint, hi) => (
                                    <p key={hi} className="text-[color:var(--layout-text)]/75">
                                      Hint {hi + 1}: {hint}
                                    </p>
                                  ))
                              )}
                              {hints.length > hintLevel + 1 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setHintLevel((v) =>
                                      Math.min(hints.length - 1, v + 1)
                                    )
                                  }
                                  className="pt-1 text-xs font-semibold text-[color:var(--layout-accent)] hover:underline"
                                >
                                  Show next hint
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <p className="text-sm text-[color:var(--layout-text)]/80">
                            <span className="font-semibold text-[color:var(--layout-accent)]">
                              Solution:{" "}
                            </span>
                            {getSolution(item)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              : null}

            {phase === "answering" ? (
              <button
                type="button"
                onClick={submit}
                disabled={attemptItems.length === 0}
                className="w-full rounded-xl bg-[color:var(--layout-accent)] px-4 py-3 text-sm font-bold text-[color:var(--layout-accent-ink)] transition hover:brightness-110 disabled:opacity-40"
              >
                Submit Assessment
              </button>
            ) : null}

            {phase === "failed" ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    onReviewVideo(remediationTs);
                    onCloseReview();
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[color:var(--layout-accent)]/50 bg-[color:var(--layout-accent)]/10 px-4 py-3 text-sm font-semibold text-[color:var(--layout-accent)] transition hover:bg-[color:var(--layout-accent)]/20"
                >
                  <Video className="h-4 w-4" />
                  Review Concept in Video
                </button>
                <button
                  type="button"
                  onClick={startAttempt}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[color:var(--layout-accent)] px-4 py-3 text-sm font-bold text-[color:var(--layout-accent-ink)] transition hover:brightness-110"
                >
                  <RotateCcw className="h-4 w-4" />
                  Retry Assessment
                </button>
                <button
                  type="button"
                  onClick={onCloseReview}
                  className="rounded-xl border border-[color:var(--layout-border)] bg-[color:var(--layout-accent-soft)] px-4 py-3 text-sm font-semibold text-[color:var(--layout-text)]/80 transition hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-text)]"
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export { QuizOverlay as DronaQuizOverlay };
