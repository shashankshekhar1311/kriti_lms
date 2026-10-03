"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CheckCircle2, Pause, Play, X } from "lucide-react";
import { MOCK_TRANSCRIPT } from "./mockData";
import { THEMES, type ThemeId } from "./themes";

export function useThemeVars(themeId: ThemeId): CSSProperties {
  return THEMES[themeId].vars as CSSProperties;
}

export function useFakeProgress(playing: boolean) {
  const [progress, setProgress] = useState(28);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 0.45));
    }, 120);
    return () => window.clearInterval(id);
  }, [playing]);
  return [progress, setProgress] as const;
}

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function LabRoot({
  themeId,
  children,
  className,
}: {
  themeId: ThemeId;
  children: ReactNode;
  className?: string;
}) {
  const theme = THEMES[themeId];
  const style = useThemeVars(themeId);
  return (
    <div
      className={className}
      style={{
        ...style,
        background: "var(--lab-bg)",
        color: "var(--lab-text)",
        borderColor: "var(--lab-border)",
        boxShadow: "var(--lab-shadow)",
        fontFamily: "var(--font-body), IBM Plex Sans, sans-serif",
      }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-2 text-xs"
        style={{
          borderColor: "var(--lab-border)",
          background: "var(--lab-surface)",
          color: "var(--lab-muted)",
        }}
      >
        <span className="font-medium" style={{ color: "var(--lab-text)" }}>
          {theme.shortLabel} · structural prototype
        </span>
        <span className="hidden sm:inline">{theme.description}</span>
      </div>
      {children}
    </div>
  );
}

export function PlayGlyph({ playing }: { playing: boolean }) {
  return playing ? (
    <Pause className="h-6 w-6" />
  ) : (
    <Play className="ml-0.5 h-6 w-6" />
  );
}

export function TranscriptList() {
  return (
    <ul className="space-y-3">
      {MOCK_TRANSCRIPT.map((line) => (
        <li key={line.t} className="flex gap-3 text-sm">
          <span
            className="w-10 shrink-0 tabular-nums text-[11px] font-medium"
            style={{ color: "var(--lab-accent)" }}
          >
            {line.t}
          </span>
          <span style={{ color: "var(--lab-text)" }}>{line.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function QuizGatePreview() {
  const [picked, setPicked] = useState<number | null>(null);
  const options = [
    "To protect buyers from prices that are too high for essential medicines",
    "To make producers earn unlimited profits",
    "To ban all private pharmacies",
    "To replace demand and supply with barter only",
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">
        Why might the government set a maximum price on lifesaving drugs?
      </p>
      <ul className="space-y-2">
        {options.map((opt, i) => (
          <li key={opt}>
            <button
              type="button"
              onClick={() => setPicked(i)}
              className="w-full rounded-[var(--lab-radius-sm)] border px-3 py-2.5 text-left text-[13px] transition"
              style={{
                borderColor:
                  picked === i ? "var(--lab-accent)" : "var(--lab-border)",
                background:
                  picked === i
                    ? "var(--lab-accent-soft)"
                    : "var(--lab-surface-2)",
                color: "var(--lab-text)",
              }}
            >
              {opt}
            </button>
          </li>
        ))}
      </ul>
      {picked !== null && (
        <p
          className="flex items-center gap-1.5 text-[12px] font-medium"
          style={{
            color: picked === 0 ? "var(--lab-accent)" : "var(--lab-danger)",
          }}
        >
          {picked === 0 ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Correct — ceilings protect buyers on essentials.
            </>
          ) : (
            "Not quite — try again."
          )}
        </p>
      )}
    </div>
  );
}

export function NotesSnippet() {
  return (
    <div
      className="rounded-[var(--lab-radius-sm)] border p-3 text-sm leading-relaxed"
      style={{
        borderColor: "var(--lab-border)",
        background: "var(--lab-surface-2)",
        color: "var(--lab-muted)",
      }}
    >
      Quick note: MSP protects farmers; FSSAI marks safe food; BEE stars save
      electricity. Add your own notes here in the real app.
    </div>
  );
}

export function OverlayDrawer({
  title,
  onClose,
  children,
  serif,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  serif?: boolean;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-6">
      <div
        className="relative max-h-[88%] w-full max-w-3xl overflow-y-auto rounded-[var(--lab-radius)] border p-5"
        style={{
          background: "var(--lab-bg)",
          borderColor: "var(--lab-border)",
          color: "var(--lab-text)",
          boxShadow: "var(--lab-shadow)",
        }}
        role="dialog"
        aria-modal
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3
            className="text-lg font-semibold"
            style={
              serif
                ? { fontFamily: "var(--lab-font-display)" }
                : { fontFamily: "var(--font-display), sans-serif" }
            }
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5"
            style={{ color: "var(--lab-muted)" }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ExamCards({ onClose }: { onClose: () => void }) {
  const cards = [
    {
      id: "practice",
      title: "Practice Arena",
      blurb: "Timed MCQs from this chapter — anti-guessing mode on.",
    },
    {
      id: "written",
      title: "Written Prep",
      blurb: "FSSAI, MSP, and label fields — examiner-style answers.",
    },
    {
      id: "flashcards",
      title: "Flashcards",
      blurb: "Flip through BIS, AGMARK, BEE, and key definitions.",
    },
  ];
  return (
    <OverlayDrawer title="Exam Prep" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="rounded-[var(--lab-radius)] border p-4 text-left transition hover:opacity-95"
            style={{
              background: "var(--lab-surface)",
              borderColor: "var(--lab-border)",
            }}
          >
            <p className="font-semibold">{card.title}</p>
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: "var(--lab-muted)" }}
            >
              {card.blurb}
            </p>
          </button>
        ))}
      </div>
      <p className="mt-4 text-[12px]" style={{ color: "var(--lab-muted)" }}>
        Prototype chrome only — tone sample, not live exam tools.
      </p>
    </OverlayDrawer>
  );
}
