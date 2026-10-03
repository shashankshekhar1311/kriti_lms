"use client";

import { Focus, Layers, Maximize2, PenTool, Printer, ShieldAlert, Zap } from "lucide-react";
import type { AppMode } from "@/lib/types";

interface LessonHeaderProps {
  title: string;
  breadcrumb: string;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  mode?: AppMode;
  marathonEnabled?: boolean;
  onToggleMarathon?: () => void;
  onOpenPractice?: (tab?: "workout" | "mock" | "vault") => void;
  onOpenWritten?: () => void;
  onOpenFlashcards?: () => void;
  onOpenRevisionSheet?: () => void;
  mistakeCount?: number;
}

export function LessonHeader({
  title,
  breadcrumb,
  focusMode,
  onToggleFocusMode,
  mode = "learn",
  marathonEnabled = false,
  onToggleMarathon,
  onOpenPractice,
  onOpenWritten,
  onOpenFlashcards,
  onOpenRevisionSheet,
  mistakeCount = 0,
}: LessonHeaderProps) {
  return (
    <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-baseline gap-2 sm:gap-3">
        <h2 className="truncate text-base font-semibold text-[color:var(--layout-text)] sm:text-lg">
          {title}
        </h2>
        <p className="truncate text-xs text-[color:var(--layout-muted)]">{breadcrumb}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {mode === "exam_prep" ? (
          <>
            <button
              type="button"
              onClick={() => onOpenPractice?.("workout")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--layout-accent)]/50 bg-[color:var(--layout-accent-soft)] px-3 py-1.5 text-xs font-bold text-[color:var(--layout-accent)] transition hover:brightness-95 shadow-sm"
              title="Open Chapter Practice Arena with infinite workouts, 15-min mock tests & mistake vault"
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              <span className="hidden lg:inline">Practice Arena</span>
            </button>

            <button
              type="button"
              onClick={onOpenWritten}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-300 transition hover:bg-indigo-500/25 shadow-sm"
              title="Open CBSE Written Subjective Answer Mastery & Drona AI Rubric Grader"
            >
              <PenTool className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Written Prep</span>
            </button>

            <button
              type="button"
              onClick={onOpenFlashcards}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25 shadow-sm"
              title="60-second concept flashcards for last-minute revision"
            >
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Flashcards</span>
            </button>

            <button
              type="button"
              onClick={onOpenRevisionSheet}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] px-2.5 py-1.5 text-xs font-bold text-[color:var(--layout-text)]/80 transition hover:bg-[color:var(--layout-accent-soft)]"
              title="Download printable 2-page Kriti Exam Revision Sheet PDF"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Worksheet</span>
            </button>

            {mistakeCount > 0 ? (
              <button
                type="button"
                onClick={() => onOpenPractice?.("vault")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-drona-rose/50 bg-drona-rose/15 px-2.5 py-1.5 text-xs font-bold text-drona-rose transition hover:bg-drona-rose/25"
                title={`${mistakeCount} unresolved questions in Mistake Vault`}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Vault: {mistakeCount}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onToggleMarathon}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                marathonEnabled
                  ? "border-drona-amber/60 bg-drona-amber/20 text-drona-amber shadow-sm shadow-drona-amber/20"
                  : "border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] text-[color:var(--layout-text)]/70 hover:border-drona-amber/40 hover:text-[color:var(--layout-text)]"
              }`}
              title="Autoplay all chapter videos continuously for marathon revision"
            >
              <Zap className={`h-3.5 w-3.5 ${marathonEnabled ? "fill-drona-amber text-drona-amber" : ""}`} />
              <span className="hidden sm:inline">{marathonEnabled ? "Marathon: ON" : "Marathon"}</span>
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={onToggleFocusMode}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
            focusMode
              ? "border-[color:var(--layout-accent)]/50 bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-accent)]"
              : "border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] text-[color:var(--layout-text)]/70 hover:border-[color:var(--layout-accent)]/40 hover:text-[color:var(--layout-text)]"
          }`}
          title="Collapse both sidebars"
        >
          {focusMode ? (
            <Maximize2 className="h-3.5 w-3.5" />
          ) : (
            <Focus className="h-3.5 w-3.5" />
          )}
          Focus Mode
        </button>
      </div>
    </div>
  );
}
