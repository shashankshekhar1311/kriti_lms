"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Flame,
  Lock,
  MessageSquareText,
  NotebookPen,
  Sparkles,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOCK_CURRICULUM,
  MOCK_STATS,
  findLesson,
} from "./mockData";
import {
  ExamCards,
  LabRoot,
  NotesSnippet,
  PlayGlyph,
  QuizGatePreview,
  TranscriptList,
  formatTime,
  useFakeProgress,
} from "./shared";

type SideTab = "notes" | "transcript" | "quiz";

/**
 * Soft Learning Studio — study desk layout (NOT an IDE tree).
 * Left: stacked lesson cards. Center: player. Right: sticky notes/transcript/quiz column.
 */
export function SoftStudioShell() {
  const [lessonId, setLessonId] = useState("ml6");
  const [playing, setPlaying] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>("notes");
  const [examOpen, setExamOpen] = useState(false);
  const [progress] = useFakeProgress(playing);

  const selection = useMemo(() => findLesson(lessonId), [lessonId]);
  const chapter = MOCK_CURRICULUM[0].chapters[0];
  const lessons = chapter.lessons;

  return (
    <LabRoot
      themeId="soft"
      className="relative flex h-full min-h-[720px] flex-col overflow-hidden rounded-2xl border"
    >
      {/* Slim top bar — brand + quiet stats only */}
      <header
        className="flex h-14 shrink-0 items-center justify-between gap-3 px-5"
        style={{ background: "var(--lab-surface)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-bold"
            style={{
              background: "var(--lab-accent)",
              color: "var(--lab-accent-ink)",
            }}
          >
            K
          </div>
          <div>
            <p className="text-[11px]" style={{ color: "var(--lab-muted)" }}>
              Kriti School · Study desk
            </p>
            <p className="text-sm font-semibold tracking-tight">Drona Studio</p>
          </div>
        </div>
        <div
          className="flex items-center gap-4 text-[12px]"
          style={{ color: "var(--lab-muted)" }}
        >
          <span className="inline-flex items-center gap-1">
            <Flame className="h-3.5 w-3.5" style={{ color: "var(--lab-accent)" }} />
            {MOCK_STATS.streak} day streak
          </span>
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5" style={{ color: "var(--lab-accent)" }} />
            {MOCK_STATS.mastery}% mastery
          </span>
          <button
            type="button"
            onClick={() => setExamOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
            style={{
              background: "var(--lab-accent)",
              color: "var(--lab-accent-ink)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Exam Prep
          </button>
        </div>
      </header>

      {/* Three-pane study desk */}
      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* Lesson cards column */}
        <section
          className="flex min-h-0 flex-col overflow-hidden rounded-[var(--lab-radius)] border"
          style={{
            background: "var(--lab-surface)",
            borderColor: "var(--lab-border)",
          }}
        >
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--lab-border)" }}>
            <p className="text-[11px]" style={{ color: "var(--lab-muted)" }}>
              {MOCK_STATS.classLabel} · Social Science
            </p>
            <h2 className="mt-0.5 text-sm font-semibold leading-snug">
              {chapter.title}
            </h2>
          </div>
          <ul className="flex-1 space-y-2 overflow-y-auto p-3">
            {lessons.map((l, i) => {
              const active = l.id === lessonId;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    disabled={l.status === "locked"}
                    onClick={() => {
                      if (l.status !== "locked") setLessonId(l.id);
                    }}
                    className={cn(
                      "w-full rounded-[var(--lab-radius-sm)] border p-3 text-left transition",
                      l.status === "locked" && "opacity-45"
                    )}
                    style={{
                      borderColor: active
                        ? "var(--lab-accent)"
                        : "var(--lab-border)",
                      background: active
                        ? "var(--lab-accent-soft)"
                        : "var(--lab-surface-2)",
                    }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span
                        className="text-[10px] font-semibold"
                        style={{ color: "var(--lab-accent)" }}
                      >
                        Lesson {i + 5}
                      </span>
                      {l.status === "done" ? (
                        <CheckCircle2
                          className="h-3.5 w-3.5"
                          style={{ color: "var(--lab-accent)" }}
                        />
                      ) : l.status === "locked" ? (
                        <Lock className="h-3.5 w-3.5" style={{ color: "var(--lab-muted)" }} />
                      ) : null}
                    </div>
                    <p className="text-[13px] font-medium leading-snug">{l.title}</p>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--lab-muted)" }}>
                      {l.duration}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Player column */}
        <section className="flex min-h-0 flex-col gap-3">
          <div>
            <p className="text-[11px]" style={{ color: "var(--lab-muted)" }}>
              Now learning
            </p>
            <h1
              className="text-xl font-semibold tracking-tight sm:text-2xl"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              {selection?.lesson.title}
            </h1>
          </div>
          <div
            className="relative flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-[var(--lab-radius)] border"
            style={{
              background: "var(--lab-player-bg)",
              borderColor: "var(--lab-border)",
            }}
          >
            <div className="flex flex-1 items-center justify-center">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="flex h-16 w-16 items-center justify-center rounded-full"
                style={{
                  background: "var(--lab-accent)",
                  color: "var(--lab-accent-ink)",
                }}
                aria-label={playing ? "Pause" : "Play"}
              >
                <PlayGlyph playing={playing} />
              </button>
            </div>
            <div
              className="border-t px-4 py-3"
              style={{
                borderColor: "var(--lab-border)",
                background: "var(--lab-surface)",
              }}
            >
              <div
                className="mb-2 h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--lab-surface-2)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: "var(--lab-accent)",
                  }}
                />
              </div>
              <div
                className="flex justify-between text-[11px] tabular-nums"
                style={{ color: "var(--lab-muted)" }}
              >
                <span>{formatTime((progress / 100) * 190)}</span>
                <span>3:10</span>
              </div>
            </div>
          </div>
        </section>

        {/* Sticky study tools column */}
        <section
          className="flex min-h-0 flex-col overflow-hidden rounded-[var(--lab-radius)] border"
          style={{
            background: "var(--lab-surface)",
            borderColor: "var(--lab-border)",
          }}
        >
          <div
            className="flex gap-1 border-b p-2"
            style={{ borderColor: "var(--lab-border)" }}
          >
            {(
              [
                { id: "notes" as const, label: "Notes", icon: NotebookPen },
                {
                  id: "transcript" as const,
                  label: "Transcript",
                  icon: MessageSquareText,
                },
                { id: "quiz" as const, label: "Quiz", icon: CheckCircle2 },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSideTab(t.id)}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold"
                style={
                  sideTab === t.id
                    ? {
                        background: "var(--lab-accent-soft)",
                        color: "var(--lab-accent)",
                      }
                    : { color: "var(--lab-muted)" }
                }
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {sideTab === "notes" && <NotesSnippet />}
            {sideTab === "transcript" && <TranscriptList />}
            {sideTab === "quiz" && <QuizGatePreview />}
          </div>
          <div
            className="border-t p-3 text-[11px]"
            style={{ borderColor: "var(--lab-border)", color: "var(--lab-muted)" }}
          >
            <BookOpen className="mb-1 inline h-3.5 w-3.5" /> Study tools stay
            beside the lesson — desk metaphor, not a tree sidebar.
          </div>
        </section>
      </div>

      {examOpen && <ExamCards onClose={() => setExamOpen(false)} />}
    </LabRoot>
  );
}
