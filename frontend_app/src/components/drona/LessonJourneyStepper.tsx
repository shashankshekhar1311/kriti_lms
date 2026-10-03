"use client";

import { Check, Lock } from "lucide-react";
import type { LessonJourneyStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS: {
  id: LessonJourneyStep;
  label: string;
  detail: string;
}[] = [
  { id: "watch", label: "1. Watch Lesson", detail: "Video" },
  { id: "immersion", label: "2. Immersion Lab", detail: "Interactive" },
  { id: "quiz", label: "3. Master Quiz", detail: "Exit gate" },
];

interface LessonJourneyStepperProps {
  step: LessonJourneyStep;
  immersionUnlocked: boolean;
  quizUnlocked: boolean;
  quizItemCount?: number;
  onStepChange: (step: LessonJourneyStep) => void;
}

export function LessonJourneyStepper({
  step,
  immersionUnlocked,
  quizUnlocked,
  quizItemCount,
  onStepChange,
}: LessonJourneyStepperProps) {
  return (
    <nav
      className="mb-3 grid gap-2 rounded-2xl border border-[color:var(--layout-border)] bg-[color:var(--layout-surface)] p-2 sm:grid-cols-3"
      aria-label="Lesson journey"
    >
      {STEPS.map((item) => {
        const locked =
          (item.id === "immersion" && !immersionUnlocked) ||
          (item.id === "quiz" && !quizUnlocked);
        const active = step === item.id;
        const detail =
          item.id === "quiz" && quizItemCount
            ? `${quizItemCount} items`
            : item.detail;

        return (
          <button
            key={item.id}
            type="button"
            disabled={locked}
            onClick={() => onStepChange(item.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition",
              active
                ? "border-[color:var(--layout-accent)] bg-[color:var(--layout-accent-soft)]"
                : "border-transparent hover:bg-[color:var(--layout-surface-2)]",
              locked && "cursor-not-allowed opacity-45"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                active
                  ? "bg-[color:var(--layout-accent)] text-[color:var(--layout-accent-ink)]"
                  : "bg-[color:var(--layout-surface-2)] text-[color:var(--layout-muted)]"
              )}
            >
              {locked ? (
                <Lock className="h-3.5 w-3.5" />
              ) : active ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                item.id === "watch" ? "1" : item.id === "immersion" ? "2" : "3"
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-[color:var(--layout-text)]">
                {item.label}
              </span>
              <span className="block truncate text-[10px] text-[color:var(--layout-muted)]">
                {detail}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
