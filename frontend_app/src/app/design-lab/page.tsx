"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { MockShell } from "@/components/design-lab/MockShell";
import { THEME_ORDER, THEMES, type ThemeId } from "@/components/design-lab/themes";
import { saveLayoutPreference, type LayoutId } from "@/lib/layout-preference";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "kriti-design-lab-theme";

export default function DesignLabPage() {
  const [themeId, setThemeId] = useState<ThemeId>("soft");
  const [ready, setReady] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY) as ThemeId | null;
      if (saved && THEMES[saved]) setThemeId(saved);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      /* ignore */
    }
  }, [themeId, ready]);

  const useInLms = () => {
    saveLayoutPreference(themeId as LayoutId);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 transition hover:border-white/25 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Live LMS
            </Link>
            <div>
              <h1 className="font-display text-base font-semibold tracking-tight sm:text-lg">
                Design Lab
              </h1>
              <p className="text-[11px] text-white/50">
                Try layouts, then save one as your LMS preference.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1">
              {THEME_ORDER.map((id) => {
                const t = THEMES[id];
                const active = themeId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setThemeId(id)}
                    className={cn(
                      "rounded-xl px-3 py-2 text-left transition",
                      active
                        ? "bg-white text-black shadow"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <span className="block text-[12px] font-semibold leading-none">
                      {t.shortLabel}
                    </span>
                    <span
                      className={cn(
                        "mt-1 hidden text-[10px] leading-snug sm:block",
                        active ? "text-black/55" : "text-white/40"
                      )}
                    >
                      {id === "soft"
                        ? "Study desk · 3 columns"
                        : id === "theater"
                          ? "Full-bleed overlays"
                          : "Bookshelf → lesson"}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={useInLms}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-white/90"
            >
              {savedFlash ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Saved
                </>
              ) : (
                "Use in LMS"
              )}
            </button>
            <Link
              href={`/?layout=${themeId}`}
              className="rounded-xl border border-white/15 px-3 py-2 text-[12px] font-medium text-white/80 hover:bg-white/10"
            >
              Open LMS with this
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-3 py-4 sm:px-4">
        <p className="mb-3 max-w-3xl text-[13px] leading-relaxed text-white/55">
          Students can switch Soft Studio, Focus Theater, or Warm Academic anytime
          from the <strong className="text-white/80">Layout</strong> button in the
          LMS header. Progress is shared across all layouts.
        </p>

        <div className="relative min-h-[720px] flex-1">
          {ready ? (
            <MockShell key={themeId} themeId={themeId} />
          ) : (
            <div className="flex h-[720px] items-center justify-center rounded-2xl border border-white/10 text-sm text-white/40">
              Loading prototypes…
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
