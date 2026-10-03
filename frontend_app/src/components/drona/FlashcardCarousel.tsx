"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  FlipHorizontal2,
  Layers,
  Lightbulb,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import type { ConceptFlashcard, FlashcardsResponse } from "@/lib/types";

interface FlashcardCarouselProps {
  open: boolean;
  onClose: () => void;
  chapterPath: string;
  chapterName: string;
  onOpenRevisionSheet?: () => void;
}

export function FlashcardCarousel({
  open,
  onClose,
  chapterPath,
  chapterName,
  onOpenRevisionSheet,
}: FlashcardCarouselProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<ConceptFlashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showTrickAnswer, setShowTrickAnswer] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !chapterPath) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    setIndex(0);
    setFlipped(false);
    setShowTrickAnswer(false);

    fetch(`/api/flashcards?chapterPath=${encodeURIComponent(chapterPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load flashcards");
        return res.json();
      })
      .then((data: FlashcardsResponse) => {
        if (!mounted) return;
        setCards(data.cards || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Load failed");
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, chapterPath]);

  const go = useCallback(
    (dir: -1 | 1) => {
      setFlipped(false);
      setShowTrickAnswer(false);
      setIndex((prev) => {
        const next = prev + dir;
        if (next < 0) return cards.length - 1;
        if (next >= cards.length) return 0;
        return next;
      });
    },
    [cards.length]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
        setShowTrickAnswer(false);
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, onClose]);

  if (!open) return null;

  const card = cards[index];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0e0e0e] shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#141414] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-white sm:text-base">
                60-Second Concept Flashcards
              </h3>
              <p className="truncate text-xs text-white/50">{chapterName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenRevisionSheet ? (
              <button
                type="button"
                onClick={onOpenRevisionSheet}
                className="hidden rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25 sm:inline-flex"
              >
                Download Worksheet
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-6">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-white/60">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm">Building flashcards from storyboards…</p>
            </div>
          ) : error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : cards.length === 0 ? (
            <p className="text-sm text-white/50">No concept cards found for this chapter.</p>
          ) : (
            <>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                Card {index + 1} of {cards.length} · {card?.lessonName}
              </p>

              {/* 3D Flip Card */}
              <div
                className="relative w-full max-w-lg"
                style={{ perspective: "1200px" }}
                onTouchStart={(e) => setTouchStartX(e.changedTouches[0]?.clientX ?? null)}
                onTouchEnd={(e) => {
                  if (touchStartX == null) return;
                  const dx = (e.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
                  if (dx > 60) go(-1);
                  else if (dx < -60) go(1);
                  setTouchStartX(null);
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setFlipped((f) => !f);
                    setShowTrickAnswer(false);
                  }}
                  className="relative block w-full text-left"
                  style={{ height: "420px" }}
                  aria-label="Flip flashcard"
                >
                  <motion.div
                    className="relative h-full w-full"
                    animate={{ rotateY: flipped ? 180 : 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {/* FRONT */}
                    <div
                      className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-b from-[#1a1510] to-[#12100e] shadow-xl"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                          Concept Front
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-white/40">
                          <FlipHorizontal2 className="h-3 w-3" /> Tap to flip
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-5">
                        {card?.artifactPath ? (
                          <img
                            src={`/api/artifact?path=${encodeURIComponent(card.artifactPath)}`}
                            alt={card.title}
                            className="max-h-48 rounded-xl border border-white/10 object-contain shadow-lg"
                          />
                        ) : (
                          <div className="flex h-36 w-full items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/5">
                            <Layers className="h-10 w-10 text-amber-500/40" />
                          </div>
                        )}
                        <h4 className="text-center text-xl font-bold leading-snug text-white sm:text-2xl">
                          {card?.title}
                        </h4>
                      </div>
                    </div>

                    {/* BACK */}
                    <div
                      className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-[#0f1a1c] to-[#0c1214] shadow-xl"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/80">
                          Summary Back
                        </span>
                        <span className="text-[10px] text-white/40">Tap to flip front</span>
                      </div>
                      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                        <ul className="space-y-2.5">
                          {(card?.bullets || []).map((b, i) => (
                            <li
                              key={i}
                              className="flex gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/90"
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-300">
                                {i + 1}
                              </span>
                              <span className="leading-snug">{b}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="mt-auto rounded-xl border border-amber-500/30 bg-amber-950/30 p-3">
                          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                            <Lightbulb className="h-3.5 w-3.5" />
                            Classic Exam Trick Question
                          </div>
                          <p className="text-xs leading-relaxed text-amber-50/90">
                            {card?.trickQuestion}
                          </p>
                          {card?.trickAnswer ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowTrickAnswer((v) => !v);
                              }}
                              className="mt-2 text-[11px] font-semibold text-amber-300 hover:underline"
                            >
                              {showTrickAnswer ? "Hide answer" : "Reveal answer hint"}
                            </button>
                          ) : null}
                          <AnimatePresence>
                            {showTrickAnswer && card?.trickAnswer ? (
                              <motion.p
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-2 text-[11px] leading-relaxed text-white/70"
                              >
                                {card.trickAnswer}
                              </motion.p>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </button>
              </div>

              {/* Nav */}
              <div className="mt-5 flex w-full max-w-lg items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1a1a1a] px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFlipped((f) => !f);
                    setShowTrickAnswer(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/25"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {flipped ? "Show Front" : "Show Back"}
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1a1a1a] px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Dot strip */}
              <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-1.5">
                {cards.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      setFlipped(false);
                      setShowTrickAnswer(false);
                    }}
                    className={`h-1.5 rounded-full transition ${
                      i === index ? "w-5 bg-amber-400" : "w-1.5 bg-white/20 hover:bg-white/40"
                    }`}
                    aria-label={`Go to card ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
