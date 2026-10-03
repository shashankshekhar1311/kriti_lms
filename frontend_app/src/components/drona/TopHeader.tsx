"use client";

import { LayoutTemplate } from "lucide-react";
import type { AppMode } from "@/lib/types";

interface TopHeaderProps {
  classLabel: string;
  streak: number;
  masteredCount: number;
  totalLessons: number;
  completionPct: number;
  mode?: AppMode;
  onModeChange?: (mode: AppMode) => void;
  mistakeCount?: number;
  onOpenMistakes?: () => void;
  onOpenLayoutChooser?: () => void;
  layoutLabel?: string;
}

export function TopHeader({
  classLabel,
  streak,
  masteredCount,
  totalLessons,
  completionPct,
  mode = "learn",
  onModeChange,
  mistakeCount = 0,
  onOpenMistakes,
  onOpenLayoutChooser,
  layoutLabel,
}: TopHeaderProps) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-[color:var(--layout-border)] bg-[color:var(--layout-surface)] px-3 text-[color:var(--layout-text)] sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--layout-accent)]">
          Kriti · Drona
        </p>
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-[color:var(--layout-muted)] sm:text-[13px]">
          <span className="whitespace-nowrap rounded-md border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] px-2 py-1 font-medium text-[color:var(--layout-text)]">
            {classLabel}
          </span>
          <span className="opacity-30">|</span>
          <span className="whitespace-nowrap rounded-md border border-[color:var(--layout-border)] bg-[color:var(--layout-accent-soft)] px-2 py-1 text-[color:var(--layout-accent)]">
            {streak} Day Streak
          </span>
          <span className="opacity-30">|</span>
          <span className="whitespace-nowrap rounded-md border border-[color:var(--layout-border)] bg-[color:var(--layout-accent-soft)] px-2 py-1 text-[color:var(--layout-accent)]">
            {masteredCount}/{totalLessons} Mastered ({completionPct}%)
          </span>

          {mistakeCount > 0 ? (
            <>
              <span className="opacity-30">|</span>
              <button
                type="button"
                onClick={onOpenMistakes}
                className="whitespace-nowrap rounded-md border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/25"
                title="Open Shuddhi Mistake Vault"
              >
                {mistakeCount} Mistake{mistakeCount === 1 ? "" : "s"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {onOpenLayoutChooser ? (
          <button
            type="button"
            onClick={onOpenLayoutChooser}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] px-2.5 py-1 text-xs font-medium text-[color:var(--layout-text)] transition hover:opacity-90"
            title="Choose Soft Studio, Focus Theater, or Warm Academic"
          >
            <LayoutTemplate className="h-3.5 w-3.5 text-[color:var(--layout-accent)]" />
            <span className="hidden sm:inline">{layoutLabel || "Layout"}</span>
          </button>
        ) : null}

        {mode === "exam_prep" ? (
          <span className="hidden items-center gap-1 rounded-md border border-[color:var(--layout-border)] bg-[color:var(--layout-accent-soft)] px-2 py-1 text-[11px] font-medium text-[color:var(--layout-accent)] md:inline-flex">
            Exam Revision Mode
          </span>
        ) : null}

        <div className="flex items-center rounded-lg border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onModeChange?.("learn")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
              mode === "learn"
                ? "bg-[color:var(--layout-accent)] text-[color:var(--layout-accent-ink)] shadow-sm"
                : "text-[color:var(--layout-muted)] hover:text-[color:var(--layout-text)]"
            }`}
            title="Step-by-step learning mode with gate checks"
          >
            Learn
          </button>
          <button
            type="button"
            onClick={() => onModeChange?.("exam_prep")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
              mode === "exam_prep"
                ? "bg-[color:var(--layout-accent)] text-[color:var(--layout-accent-ink)] shadow-sm"
                : "text-[color:var(--layout-muted)] hover:text-[color:var(--layout-text)]"
            }`}
            title="Rapid revision mode: free scrubbing, speed controls & marathon playback"
          >
            Exam Prep
          </button>
        </div>
      </div>
    </header>
  );
}
