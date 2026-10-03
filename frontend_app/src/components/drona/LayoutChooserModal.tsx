"use client";

import { Check, LayoutTemplate, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LAYOUT_OPTIONS,
  LAYOUT_ORDER,
  type LayoutId,
} from "@/lib/layout-preference";
import { useLayoutPreference } from "./LayoutPreferenceProvider";

const SWATCHES: Record<LayoutId, { bg: string; accent: string; surface: string }> = {
  soft: { bg: "#1A1B1E", accent: "#2DD4BF", surface: "#242628" },
  theater: { bg: "#050505", accent: "#FBBF24", surface: "#0E0E0E" },
  warm: { bg: "#F4F0E8", accent: "#C45C26", surface: "#FFFCF7" },
};

export function LayoutChooserModal() {
  const { chooserOpen, closeChooser, layoutId, setLayoutId } =
    useLayoutPreference();

  if (!chooserOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6">
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#121212] text-white shadow-2xl"
        role="dialog"
        aria-modal
        aria-labelledby="layout-chooser-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">
              Personalize
            </p>
            <h2
              id="layout-chooser-title"
              className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight"
            >
              <LayoutTemplate className="h-5 w-5 text-white/70" />
              Choose your learning layout
            </h2>
            <p className="mt-1 max-w-xl text-[13px] text-white/55">
              Pick the look that fits how you study. You can change this anytime —
              your progress stays the same.
            </p>
          </div>
          <button
            type="button"
            onClick={closeChooser}
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {LAYOUT_ORDER.map((id) => {
            const opt = LAYOUT_OPTIONS[id];
            const swatch = SWATCHES[id];
            const active = layoutId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setLayoutId(id);
                  closeChooser();
                }}
                className={cn(
                  "rounded-2xl border p-3 text-left transition",
                  active
                    ? "border-white/40 bg-white/10 ring-2 ring-white/20"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
                )}
              >
                <div
                  className="mb-3 overflow-hidden rounded-xl border border-black/20"
                  style={{ background: swatch.bg }}
                >
                  <div className="flex h-24 gap-1.5 p-2">
                    {id === "soft" && (
                      <>
                        <div
                          className="w-1/4 rounded-md"
                          style={{ background: swatch.surface }}
                        />
                        <div className="flex flex-1 flex-col gap-1.5">
                          <div
                            className="flex-1 rounded-md"
                            style={{ background: swatch.accent, opacity: 0.35 }}
                          />
                          <div
                            className="h-3 rounded"
                            style={{ background: swatch.accent }}
                          />
                        </div>
                        <div
                          className="w-1/4 rounded-md"
                          style={{ background: swatch.surface }}
                        />
                      </>
                    )}
                    {id === "theater" && (
                      <div className="relative flex flex-1 items-end rounded-md bg-black/40 p-2">
                        <div
                          className="h-2 w-full rounded-full"
                          style={{ background: swatch.accent }}
                        />
                      </div>
                    )}
                    {id === "warm" && (
                      <div className="flex flex-1 flex-col gap-1.5 p-1">
                        <div className="grid flex-1 grid-cols-2 gap-1.5">
                          <div
                            className="rounded-md"
                            style={{ background: swatch.surface }}
                          />
                          <div
                            className="rounded-md"
                            style={{ background: swatch.surface }}
                          />
                        </div>
                        <div
                          className="h-3 rounded"
                          style={{ background: swatch.accent }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-[11px]" style={{ color: swatch.accent }}>
                      {opt.tagline}
                    </p>
                  </div>
                  {active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold">
                      <Check className="h-3 w-3" />
                      Active
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/55">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>

        <div className="border-t border-white/10 px-5 py-3 text-[12px] text-white/45">
          Tip: try layouts in the{" "}
          <a href="/design-lab" className="text-white/75 underline-offset-2 hover:underline">
            Design Lab
          </a>{" "}
          first, then tap “Use in LMS”.
        </div>
      </div>
    </div>
  );
}
