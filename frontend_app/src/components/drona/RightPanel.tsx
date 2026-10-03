"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Layers, NotebookPen, PenTool, Printer, ShieldAlert, ShieldCheck, TextQuote, Zap } from "lucide-react";
import {
  activeTranscriptIndex,
  buildTimedTranscript,
} from "@/lib/transcript";
import type { AppMode, MicroLessonMeta, QuizPayload } from "@/lib/types";

type PanelTab = "transcript" | "quiz" | "notes";

interface RightPanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  narration: string;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  selected: MicroLessonMeta | null;
  quiz: QuizPayload | null;
  lessonPath: string | null;
  mode?: AppMode;
  onOpenQuiz?: () => void;
  onOpenPractice?: (tab?: "workout" | "mock" | "vault") => void;
  onOpenWritten?: () => void;
  onOpenFlashcards?: () => void;
  onOpenRevisionSheet?: () => void;
  mistakeCount?: number;
}

function notesKey(lessonPath: string) {
  return `drona-notes:${lessonPath}`;
}

export function RightPanel({
  collapsed,
  onToggleCollapsed,
  narration,
  currentTime,
  duration,
  onSeek,
  selected,
  quiz,
  lessonPath,
  mode = "learn",
  onOpenQuiz,
  onOpenPractice,
  onOpenWritten,
  onOpenFlashcards,
  onOpenRevisionSheet,
  mistakeCount = 0,
}: RightPanelProps) {
  const [tab, setTab] = useState<PanelTab>("transcript");
  const [notes, setNotes] = useState("");
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const lines = useMemo(
    () => buildTimedTranscript(narration, duration),
    [narration, duration]
  );
  const activeIndex = activeTranscriptIndex(lines, currentTime);

  useEffect(() => {
    if (!lessonPath) {
      setNotes("");
      return;
    }
    try {
      setNotes(localStorage.getItem(notesKey(lessonPath)) || "");
    } catch {
      setNotes("");
    }
  }, [lessonPath]);

  useEffect(() => {
    if (tab !== "transcript") return;
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [activeIndex, tab]);

  const saveNotes = (value: string) => {
    setNotes(value);
    if (!lessonPath) return;
    try {
      localStorage.setItem(notesKey(lessonPath), value);
    } catch {
      // ignore quota errors
    }
  };

  if (collapsed) {
    return (
      <aside className="relative flex h-full w-10 shrink-0 flex-col items-center border-l border-[color:var(--layout-border)] bg-[color:var(--layout-surface)] transition-all duration-300">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="mt-3 rounded-lg p-2 text-[color:var(--layout-muted)] hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-accent)]"
          aria-label="Expand right panel"
          title="Expand panel"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="mt-6 flex flex-col items-center gap-4 text-[color:var(--layout-muted)]">
          <TextQuote className="h-4 w-4" />
          <ShieldCheck className="h-4 w-4" />
          <NotebookPen className="h-4 w-4" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-[color:var(--layout-border)] bg-[color:var(--layout-surface)] transition-all duration-300 xl:w-[360px]">
      <div className="flex items-center gap-1 border-b border-[color:var(--layout-border)] px-2 py-2">
        {(
          [
            { id: "transcript", label: "Transcript", icon: TextQuote },
            { id: "quiz", label: "Quiz Gate", icon: ShieldCheck },
            { id: "notes", label: "Notes", icon: NotebookPen },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
              tab === id
                ? "bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-accent)]"
                : "text-[color:var(--layout-muted)] hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-text)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-lg p-2 text-[color:var(--layout-muted)] hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-text)]"
          aria-label="Collapse right panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "transcript" ? (
          <div className="space-y-1.5">
            {lines.length === 0 ? (
              <p className="text-sm text-[color:var(--layout-muted)]">
                No narration.txt for this lesson.
              </p>
            ) : (
              lines.map((line, index) => {
                const active = index === activeIndex;
                return (
                  <button
                    key={line.id}
                    ref={active ? activeRef : null}
                    type="button"
                    onClick={() => onSeek(line.start)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-[color:var(--layout-accent-soft)] ring-1 ring-[color:var(--layout-accent)]/40"
                        : "hover:bg-[color:var(--layout-accent-soft)]"
                    }`}
                  >
                    <span className="mb-1 block text-[10px] font-medium tabular-nums text-[color:var(--layout-muted)]">
                      {formatClock(line.start)}
                    </span>
                    <span
                      className={`text-sm leading-relaxed ${
                        active ? "text-[color:var(--layout-text)]" : "text-[color:var(--layout-text)]/70"
                      }`}
                    >
                      {line.text}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}

        {tab === "quiz" ? (
          <div className="space-y-4 text-sm text-[color:var(--layout-text)]/80">
            {mode === "exam_prep" ? (
              /* EXAM PREP PRACTICE ACTIONS */
              <div className="space-y-2.5">
                <div className="rounded-xl border border-[color:var(--layout-accent)]/30 bg-[color:var(--layout-surface-2)] p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--layout-accent)]">
                      Chapter Practice Arena
                    </span>
                    <span className="rounded bg-[color:var(--layout-accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--layout-accent)]">
                      Multi-Format
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[color:var(--layout-text)]/75">
                    Test your recall with balanced active questions sampled dynamically from the entire chapter.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenPractice?.("workout")}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[color:var(--layout-accent)] to-[color:var(--layout-accent)] px-3.5 py-2 text-xs font-bold text-[color:var(--layout-accent-ink)] transition hover:brightness-110"
                    >
                      <Zap className="h-3.5 w-3.5 fill-current" />
                      5-Question Quick Workout
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenPractice?.("mock")}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-drona-amber/50 bg-drona-amber/15 px-3.5 py-2 text-xs font-bold text-drona-amber transition hover:bg-drona-amber/25"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      15-Min CBSE Mock Exam (10 Qs)
                    </button>
                    <button
                      type="button"
                      onClick={onOpenWritten}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/50 bg-indigo-500/15 px-3.5 py-2 text-xs font-bold text-indigo-300 transition hover:bg-indigo-500/25"
                    >
                      <PenTool className="h-3.5 w-3.5" />
                      CBSE Written Subjective Prep
                    </button>
                    <button
                      type="button"
                      onClick={onOpenFlashcards}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/15 px-3.5 py-2 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      60-Sec Concept Flashcards
                    </button>
                    <button
                      type="button"
                      onClick={onOpenRevisionSheet}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--layout-border)] bg-[color:var(--layout-accent-soft)] px-3.5 py-2 text-xs font-bold text-[color:var(--layout-text)]/90 transition hover:bg-[color:var(--layout-accent-soft)]"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Download Exam Worksheet PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenPractice?.("vault")}
                      className="flex w-full items-center justify-between rounded-xl border border-drona-rose/40 bg-drona-rose/10 px-3.5 py-2 text-xs font-semibold text-drona-rose transition hover:bg-drona-rose/20"
                    >
                      <span className="flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Shuddhi Mistake Vault
                      </span>
                      <span className="rounded-full bg-drona-rose/80 px-2 py-0.2 text-[10px] font-bold text-white">
                        {mistakeCount}
                      </span>
                    </button>
                  </div>
                </div>

                {quiz && onOpenQuiz ? (
                  <button
                    type="button"
                    onClick={onOpenQuiz}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] px-3 py-2 text-xs text-[color:var(--layout-text)]/75 hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-text)]"
                  >
                    <span>Practice Micro-Lesson Quiz ({quiz.item_pool?.length || 0} Qs)</span>
                  </button>
                ) : null}
              </div>
            ) : (
              /* LEARN MODE EXIT GATE */
              <div className="rounded-xl border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--layout-accent)]">
                    Exit Gate Assessment
                  </span>
                  {quiz ? (
                    <span className="rounded bg-[color:var(--layout-accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--layout-accent)]">
                      {quiz.item_pool?.length ?? 0} Questions
                    </span>
                  ) : (
                    <span className="rounded bg-[color:var(--layout-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--layout-muted)]">
                      No Quiz
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[color:var(--layout-text)]/75">
                  {selected?.hasVideo
                    ? "Watch the full micro-lesson to unlock the exit gate, or launch the quiz manually below to test your mastery."
                    : "Video not rendered yet — use the button below to start the exit gate quiz."}
                </p>

                {quiz && onOpenQuiz ? (
                  <button
                    type="button"
                    onClick={onOpenQuiz}
                    className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[color:var(--layout-accent)] to-[color:var(--layout-accent)] px-4 py-2.5 text-xs font-bold text-[color:var(--layout-accent-ink)] shadow-md transition hover:brightness-110"
                  >
                    <Zap className="h-4 w-4 fill-current" />
                    Open Exit Gate Quiz
                  </button>
                ) : null}
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-xs">
              <span
                className={`rounded-full px-2.5 py-1 ${
                  selected?.hasVideo
                    ? "bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-accent)]"
                    : "bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-muted)]"
                }`}
              >
                Video
              </span>
              <span
                className={`rounded-full px-2.5 py-1 ${
                  selected?.hasQuiz
                    ? "bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-accent)]"
                    : "bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-muted)]"
                }`}
              >
                Quiz gate
              </span>
              <span
                className={`rounded-full px-2.5 py-1 ${
                  selected?.hasNarration
                    ? "bg-drona-amber/15 text-drona-amber"
                    : "bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-muted)]"
                }`}
              >
                Narration
              </span>
            </div>

            {quiz ? (
              <div className="rounded-xl border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] p-3 text-xs text-[color:var(--layout-muted)]">
                <p>
                  Pool size:{" "}
                  <span className="text-[color:var(--layout-text)]">{quiz.item_pool?.length ?? 0}</span>
                </p>
                <p className="mt-1">
                  Per attempt:{" "}
                  <span className="text-[color:var(--layout-text)]">
                    {quiz.gating_config?.questions_per_attempt ?? 5}
                  </span>
                </p>
                <p className="mt-1">
                  Pass rule: <span className="text-[color:var(--layout-accent)]">100%</span>
                </p>
              </div>
            ) : (
              <p className="text-[color:var(--layout-muted)]">No quiz.json for this lesson.</p>
            )}
          </div>
        ) : null}

        {tab === "notes" ? (
          <div className="flex h-full min-h-[280px] flex-col gap-2">
            <p className="text-xs text-[color:var(--layout-muted)]">
              Personal notes for this micro-lesson (saved locally).
            </p>
            <textarea
              value={notes}
              onChange={(e) => saveNotes(e.target.value)}
              placeholder="Jot down key ideas, formulas, or questions…"
              className="min-h-[240px] flex-1 resize-none rounded-xl border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] px-3 py-2 text-sm text-[color:var(--layout-text)] outline-none placeholder:text-[color:var(--layout-muted)] focus:border-[color:var(--layout-accent)]/40"
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}
