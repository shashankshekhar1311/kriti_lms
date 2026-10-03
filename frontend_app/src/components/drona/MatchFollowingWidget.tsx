"use client";

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import type { MatchPair } from "@/lib/types";

interface MatchFollowingWidgetProps {
  question: string;
  pairs: MatchPair[];
  matches: Record<string, string>;
  disabled?: boolean;
  onChange: (left: string, right: string) => void;
}

export function MatchFollowingWidget({
  question,
  pairs,
  matches,
  disabled,
  onChange,
}: MatchFollowingWidgetProps) {
  // Deterministically shuffle right-side choices once
  const rightOptions = useMemo(() => {
    const list = Array.from(new Set(pairs.map((p) => p.right)));
    // Simple deterministic pseudo-shuffle based on length & char codes
    return list.slice().sort((a, b) => {
      const codeA = (a.charCodeAt(0) * 17 + a.length * 31) % 97;
      const codeB = (b.charCodeAt(0) * 17 + b.length * 31) % 97;
      return codeA - codeB;
    });
  }, [pairs]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-base leading-relaxed text-[color:var(--layout-text)]">{question}</p>
        <span className="inline-flex items-center rounded-full border border-drona-amber/30 bg-drona-amber/10 px-2.5 py-0.5 text-xs font-semibold text-drona-amber">
          Match the Following
        </span>
      </div>
      <div className="space-y-2.5">
        {pairs.map((pair, index) => {
          const selectedRight = matches[pair.left] || "";
          return (
            <div
              key={`${pair.left}-${index}`}
              className="grid grid-cols-1 items-center gap-2.5 rounded-xl border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] p-3 transition hover:border-[color:var(--layout-border)] sm:grid-cols-[1fr_auto_1fr]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--layout-accent)]/15 text-xs font-bold text-[color:var(--layout-accent)]">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-[color:var(--layout-text)]">
                  {pair.left}
                </span>
              </div>

              <div className="hidden sm:flex sm:justify-center">
                <ArrowRight className="h-4 w-4 text-[color:var(--layout-muted)]" />
              </div>

              <div>
                <select
                  value={selectedRight}
                  disabled={disabled}
                  onChange={(e) => onChange(pair.left, e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-xs sm:text-sm outline-none transition ${
                    selectedRight
                      ? "border-[color:var(--layout-accent)]/50 bg-[color:var(--layout-surface)] text-[color:var(--layout-text)]"
                      : "border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] text-[color:var(--layout-muted)]"
                  } disabled:opacity-50`}
                >
                  <option value="" disabled className="text-[color:var(--layout-muted)]">
                    -- Select match --
                  </option>
                  {rightOptions.map((choice) => (
                    <option
                      key={choice}
                      value={choice}
                      className="bg-[color:var(--layout-surface-2)] text-[color:var(--layout-text)]"
                    >
                      {choice}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
