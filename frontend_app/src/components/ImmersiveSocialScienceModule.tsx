"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  Feather,
  Landmark,
  Scale,
  ScrollText,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import type {
  DilemmaOption,
  InteractiveModuleData,
  InvestigationCard,
  InvestigationIcon,
} from "@/lib/types";

const ICON_MAP: Record<InvestigationIcon, ComponentType<{ className?: string }>> = {
  scroll: ScrollText,
  shield: Shield,
  scale: Scale,
  landmark: Landmark,
  feather: Feather,
};

const MODULE_LABELS: Record<InteractiveModuleData["module_type"], string> = {
  decision_dilemma: "Decision Dilemma",
  historical_investigator: "Historical Investigator",
  civic_action_lab: "Civic Action Lab",
};

function impactForOption(option: DilemmaOption): {
  harmony: number;
  trade: number;
  wisdom: number;
} {
  if (option.is_optimal) return { harmony: 82, trade: 68, wisdom: 90 };
  const hash = `${option.id}${option.text}`
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return {
    harmony: 28 + (hash % 35),
    trade: 22 + ((hash * 3) % 40),
    wisdom: 30 + ((hash * 5) % 35),
  };
}

function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02 + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35 + i * 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + 0.45 + i * 0.08);
    });
  } catch {
    // Audio may be blocked; visual feedback is enough.
  }
}

interface ImmersiveSocialScienceModuleProps {
  moduleData: InteractiveModuleData;
  studentName: string;
  onComplete: () => void;
}

export function ImmersiveSocialScienceModule({
  moduleData,
  studentName,
  onComplete,
}: ImmersiveSocialScienceModuleProps) {
  const [inspected, setInspected] = useState<Set<string>>(new Set());
  const [activeCard, setActiveCard] = useState<InvestigationCard | null>(null);
  const [selectedOption, setSelectedOption] = useState<DilemmaOption | null>(
    null
  );
  const [speech, setSpeech] = useState("");
  const [mounted, setMounted] = useState(false);
  const badgePlayed = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activeCard) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [activeCard]);

  const decisionUnlocked = inspected.size >= 2;
  const impact = useMemo(
    () => (selectedOption ? impactForOption(selectedOption) : null),
    [selectedOption]
  );

  useEffect(() => {
    setSpeech(
      `Hey ${studentName}! I'm Gyanu. Inspect at least two clues, then help me decide.`
    );
  }, [studentName, moduleData.scenario_title]);

  useEffect(() => {
    if (!selectedOption || badgePlayed.current) return;
    badgePlayed.current = true;
    playChime();
    setSpeech(selectedOption.socratic_feedback);
  }, [selectedOption]);

  const openCard = (card: InvestigationCard) => {
    setActiveCard(card);
    setInspected((prev) => {
      const next = new Set(prev);
      next.add(card.id);
      return next;
    });
    setSpeech(`Nice eye, ${studentName}. What does this clue change about the story?`);
  };

  return (
    <div className="relative isolate z-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-2xl sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.12),_transparent_55%)]" />

      <div className="relative z-10 space-y-5 text-slate-100">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
              Immersion Lab · {MODULE_LABELS[moduleData.module_type]}
            </p>
            <h3 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
              {moduleData.scenario_title}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              {moduleData.scenario_context}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
            <Sparkles className="h-3.5 w-3.5" />
            Role: {moduleData.role}
          </span>
        </header>

        <div className="flex items-start gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-3 sm:p-4">
          <img
            src="/assets/mascots/gyanu/real_avatar.jpg"
            alt="Gyanu"
            className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-2 ring-cyan-400/40"
          />
          <div className="relative min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5">
            <span className="absolute -left-1.5 top-4 h-3 w-3 rotate-45 border-b border-l border-slate-700 bg-slate-950/80" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
              Gyanu
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-100">{speech}</p>
          </div>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-white">
              Clue & Artifact Inspection
            </h4>
            <span className="text-[11px] text-slate-400">
              Inspected {inspected.size}/{moduleData.investigation_cards.length} ·
              need 2 to unlock decision
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {moduleData.investigation_cards.map((card) => {
              const Icon = ICON_MAP[card.icon] || ScrollText;
              const seen = inspected.has(card.id);
              return (
                <motion.button
                  key={card.id}
                  type="button"
                  layout
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => openCard(card)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    seen
                      ? "border-cyan-400/50 bg-cyan-400/10"
                      : "border-slate-700 bg-slate-900/80 hover:border-slate-500"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    {seen ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                        Inspected
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        Tap to reveal
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-white">{card.label}</p>
                </motion.button>
              );
            })}
          </div>
        </section>

        <AnimatePresence>
          {decisionUnlocked ? (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4"
            >
              <h4 className="text-sm font-semibold text-white">
                Dilemma & Decision
              </h4>
              <p className="text-sm leading-relaxed text-slate-200">
                {moduleData.dilemma_challenge.prompt}
              </p>
              <div className="grid gap-2">
                {moduleData.dilemma_challenge.options.map((option) => {
                  const active = selectedOption?.id === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedOption(option)}
                      className={`rounded-xl border px-3.5 py-3 text-left text-sm transition ${
                        active
                          ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-100"
                          : "border-slate-700 bg-slate-950/70 text-slate-200 hover:border-slate-500"
                      }`}
                    >
                      {option.text}
                    </button>
                  );
                })}
              </div>
            </motion.section>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-700 px-4 py-3 text-center text-xs text-slate-400">
              Inspect at least two clues to unlock Gyanu&apos;s dilemma.
            </p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedOption && impact ? (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-300/15 px-3 py-1 text-xs font-bold text-amber-100">
                  <Award className="h-3.5 w-3.5" />
                  Exploration Badge: Thoughtful Advisor
                </span>
                {selectedOption.is_optimal ? (
                  <span className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                    Strong historical fit
                  </span>
                ) : (
                  <span className="rounded-full border border-sky-400/40 bg-sky-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-200">
                    Productive alternative lens
                  </span>
                )}
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Historical outcome
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-100">
                  {selectedOption.historical_outcome}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Gyanu&apos;s guidance
                </p>
                <p className="mt-1 text-sm leading-relaxed text-cyan-100">
                  {selectedOption.socratic_feedback}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["Community Harmony", impact.harmony],
                    ["Trade Access", impact.trade],
                    ["Civic Wisdom", impact.wisdom],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-700 bg-slate-950/60 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">{label}</span>
                      <span className="font-semibold text-white">+{value}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${value}%` }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={onComplete}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:brightness-110"
              >
                Proceed to Quiz
              </button>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>

      {mounted
        ? createPortal(
            <AnimatePresence>
              {activeCard ? (
                <motion.div
                  key="artifact-modal"
                  className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setActiveCard(null)}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Artifact detail"
                >
                  <motion.div
                    initial={{ scale: 0.92, opacity: 0, y: 8 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.96, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    className="relative z-[121] w-full max-w-md rounded-3xl border border-cyan-400/40 bg-slate-950 p-5 text-slate-100 shadow-[0_25px_80px_rgba(0,0,0,0.75)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveCard(null)}
                      className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                      aria-label="Close clue"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                      Artifact detail
                    </p>
                    <h5 className="mt-1 pr-8 text-lg font-semibold text-white">
                      {activeCard.label}
                    </h5>
                    <p className="mt-3 text-sm leading-relaxed text-slate-200">
                      {activeCard.detail}
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveCard(null)}
                      className="mt-5 w-full rounded-xl border border-cyan-400/50 bg-cyan-400 px-3 py-2.5 text-xs font-bold text-slate-950 transition hover:brightness-110"
                    >
                      Continue investigating
                    </button>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}
    </div>
  );
}
