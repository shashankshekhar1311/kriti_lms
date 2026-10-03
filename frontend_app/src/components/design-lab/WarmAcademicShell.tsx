"use client";

import {
  ArrowLeft,
  BookMarked,
  CheckCircle2,
  Lock,
  Maximize2,
  MessageSquareText,
  Minimize2,
  NotebookPen,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOCK_CURRICULUM,
  MOCK_STATS,
  findLesson,
  type MockLesson,
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
import { useEffect, useMemo, useState } from "react";

type Page = "library" | "lesson";
type DeskTab = "read" | "quiz" | "notes";

/**
 * Warm Academic — bookshelf / chapter grid home, then a lesson "page".
 * No persistent IDE tree. Feels like opening a textbook on a desk.
 */
export function WarmAcademicShell() {
  const [page, setPage] = useState<Page>("library");
  const [lessonId, setLessonId] = useState("ml6");
  const [playing, setPlaying] = useState(false);
  const [deskTab, setDeskTab] = useState<DeskTab>("read");
  const [examOpen, setExamOpen] = useState(false);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [progress] = useFakeProgress(playing);

  const chapter = MOCK_CURRICULUM[0].chapters[0];
  const otherChapter = MOCK_CURRICULUM[0].chapters[1];
  const selection = useMemo(() => findLesson(lessonId), [lessonId]);

  useEffect(() => {
    if (!playerExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlayerExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerExpanded]);

  const openLesson = (lesson: MockLesson) => {
    if (lesson.status === "locked") return;
    setLessonId(lesson.id);
    setPage("lesson");
    setDeskTab("read");
    setPlaying(false);
    setPlayerExpanded(false);
  };

  return (
    <LabRoot
      themeId="warm"
      className="relative flex h-full min-h-[720px] flex-col overflow-hidden rounded-2xl border"
    >
      {page === "library" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <header className="px-6 pb-2 pt-6 sm:px-10">
            <p
              className="text-[12px] font-medium tracking-wide"
              style={{ color: "var(--lab-accent)" }}
            >
              Kriti School · {MOCK_STATS.classLabel}
            </p>
            <h1
              className="mt-1 text-3xl font-normal tracking-tight sm:text-4xl"
              style={{ fontFamily: "var(--lab-font-display)" }}
            >
              Your bookshelf
            </h1>
            <p
              className="mt-2 max-w-xl text-sm leading-relaxed"
              style={{ color: "var(--lab-muted)" }}
            >
              Pick a chapter card — no sidebar tree. Lessons open like turning a
              page on a study desk.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-[12px]" style={{ color: "var(--lab-muted)" }}>
              <span>{MOCK_STATS.streak} day streak</span>
              <span>·</span>
              <span>{MOCK_STATS.mastery}% chapter mastery</span>
              <button
                type="button"
                onClick={() => setExamOpen(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold"
                style={{
                  background: "var(--lab-accent)",
                  color: "var(--lab-accent-ink)",
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Revision desk
              </button>
            </div>
          </header>

          <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 sm:px-10 lg:grid-cols-3">
            <ChapterCard
              title={chapter.title}
              subtitle="Social Science · 3 micro-lessons"
              accent
              lessons={chapter.lessons}
              onOpen={openLesson}
            />
            <ChapterCard
              title={otherChapter.title}
              subtitle="Social Science · completed"
              lessons={otherChapter.lessons}
              onOpen={openLesson}
            />
            <div
              className="flex min-h-[220px] flex-col justify-between rounded-[var(--lab-radius)] border border-dashed p-5"
              style={{ borderColor: "var(--lab-border)" }}
            >
              <BookMarked
                className="h-8 w-8"
                style={{ color: "var(--lab-accent)" }}
              />
              <div>
                <p
                  className="text-lg"
                  style={{ fontFamily: "var(--lab-font-display)" }}
                >
                  More chapters soon
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--lab-muted)" }}>
                  Structural sample — grid home, not a nested curriculum tree.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-3 px-5 py-4 sm:px-8">
            <button
              type="button"
              onClick={() => {
                setPage("library");
                setPlaying(false);
                setPlayerExpanded(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium"
              style={{
                borderColor: "var(--lab-border)",
                color: "var(--lab-text)",
                background: "var(--lab-surface)",
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Bookshelf
            </button>
            <div className="min-w-0">
              <p className="truncate text-[11px]" style={{ color: "var(--lab-muted)" }}>
                {chapter.title}
              </p>
              <h1
                className="truncate text-xl sm:text-2xl"
                style={{ fontFamily: "var(--lab-font-display)" }}
              >
                {selection?.lesson.title}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setExamOpen(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: "var(--lab-accent-soft)",
                color: "var(--lab-accent)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Revision
            </button>
          </div>

          {/* Lesson page: paper player + desk tabs below (stacked reading layout) */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-8">
            <div
              className="mx-auto max-w-3xl overflow-hidden rounded-[var(--lab-radius)] border"
              style={{
                background: "var(--lab-surface)",
                borderColor: "var(--lab-border)",
                boxShadow: "var(--lab-shadow)",
              }}
            >
              <div
                className="relative flex min-h-[280px] items-center justify-center"
                style={{ background: "var(--lab-player-bg)" }}
              >
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
                <button
                  type="button"
                  onClick={() => setPlayerExpanded(true)}
                  className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold"
                  style={{
                    borderColor: "var(--lab-border)",
                    background: "var(--lab-surface)",
                    color: "var(--lab-text)",
                  }}
                  aria-label="Expand player to fullscreen"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  Expand
                </button>
              </div>
              <div className="border-t px-5 py-3" style={{ borderColor: "var(--lab-border)" }}>
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
                  className="flex items-center justify-between text-[11px] tabular-nums"
                  style={{ color: "var(--lab-muted)" }}
                >
                  <span>{formatTime((progress / 100) * 190)}</span>
                  <button
                    type="button"
                    onClick={() => setPlayerExpanded(true)}
                    className="inline-flex items-center gap-1 font-medium"
                    style={{ color: "var(--lab-accent)" }}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Fullscreen
                  </button>
                  <span>3:10</span>
                </div>
              </div>
            </div>

            {/* Horizontal lesson chips — page turns, not a tree */}
            <div className="mx-auto mt-4 flex max-w-3xl gap-2 overflow-x-auto pb-1">
              {chapter.lessons.map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={l.status === "locked"}
                  onClick={() => openLesson(l)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium",
                    l.status === "locked" && "opacity-45"
                  )}
                  style={{
                    borderColor:
                      l.id === lessonId ? "var(--lab-accent)" : "var(--lab-border)",
                    background:
                      l.id === lessonId
                        ? "var(--lab-accent-soft)"
                        : "var(--lab-surface)",
                    color:
                      l.id === lessonId ? "var(--lab-accent)" : "var(--lab-text)",
                  }}
                >
                  {l.status === "locked" ? (
                    <Lock className="mr-1 inline h-3 w-3" />
                  ) : l.status === "done" ? (
                    <CheckCircle2 className="mr-1 inline h-3 w-3" />
                  ) : null}
                  L{i + 5}
                </button>
              ))}
            </div>

            <div
              className="mx-auto mt-5 max-w-3xl rounded-[var(--lab-radius)] border"
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
                    { id: "read" as const, label: "Read along", icon: MessageSquareText },
                    { id: "quiz" as const, label: "Quiz gate", icon: CheckCircle2 },
                    { id: "notes" as const, label: "Margin notes", icon: NotebookPen },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDeskTab(t.id)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[12px] font-semibold"
                    style={
                      deskTab === t.id
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
              <div className="p-4">
                {deskTab === "read" && <TranscriptList />}
                {deskTab === "quiz" && <QuizGatePreview />}
                {deskTab === "notes" && <NotesSnippet />}
              </div>
            </div>
          </div>
        </div>
      )}

      {examOpen && <ExamCards onClose={() => setExamOpen(false)} />}

      {playerExpanded && page === "lesson" && (
        <div
          className="absolute inset-0 z-40 flex flex-col"
          style={{ background: "#1a120c" }}
          role="dialog"
          aria-label="Fullscreen lesson player"
        >
          <div
            className="flex items-center justify-between gap-3 border-b px-4 py-3"
            style={{
              borderColor: "rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.35)",
              color: "#F4F0E8",
            }}
          >
            <div className="min-w-0">
              <p className="truncate text-[11px] text-white/55">
                {chapter.title}
              </p>
              <h2
                className="truncate text-lg"
                style={{ fontFamily: "var(--lab-font-display)" }}
              >
                {selection?.lesson.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setPlayerExpanded(false)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: "var(--lab-accent)",
                color: "var(--lab-accent-ink)",
              }}
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit fullscreen
            </button>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center"
            style={{ background: "var(--lab-player-bg)" }}
            onClick={() => setPlaying((p) => !p)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPlaying((p) => !p);
              }}
              className="flex h-20 w-20 items-center justify-center rounded-full"
              style={{
                background: "var(--lab-accent)",
                color: "var(--lab-accent-ink)",
                boxShadow: "var(--lab-shadow)",
              }}
              aria-label={playing ? "Pause" : "Play"}
            >
              <PlayGlyph playing={playing} />
            </button>
          </div>

          <div
            className="border-t px-5 py-4"
            style={{
              borderColor: "rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.45)",
              color: "#F4F0E8",
            }}
          >
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progress}%`,
                  background: "var(--lab-accent)",
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[12px] tabular-nums text-white/70">
              <span>{formatTime((progress / 100) * 190)}</span>
              <span>Press Esc to return to the lesson page · 3:10</span>
            </div>
          </div>
        </div>
      )}
    </LabRoot>
  );
}

function ChapterCard({
  title,
  subtitle,
  lessons,
  onOpen,
  accent,
}: {
  title: string;
  subtitle: string;
  lessons: MockLesson[];
  onOpen: (l: MockLesson) => void;
  accent?: boolean;
}) {
  return (
    <article
      className="flex min-h-[220px] flex-col rounded-[var(--lab-radius)] border p-5"
      style={{
        background: "var(--lab-surface)",
        borderColor: accent ? "var(--lab-accent)" : "var(--lab-border)",
        boxShadow: accent ? "var(--lab-shadow)" : undefined,
      }}
    >
      <p className="text-[11px]" style={{ color: "var(--lab-muted)" }}>
        {subtitle}
      </p>
      <h2
        className="mt-1 text-xl leading-snug"
        style={{ fontFamily: "var(--lab-font-display)" }}
      >
        {title}
      </h2>
      <ul className="mt-4 flex-1 space-y-2">
        {lessons.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              disabled={l.status === "locked"}
              onClick={() => onOpen(l)}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-[13px] transition hover:opacity-90"
              style={{
                background: "var(--lab-surface-2)",
                color: "var(--lab-text)",
                opacity: l.status === "locked" ? 0.45 : 1,
              }}
            >
              <span className="truncate">{l.title}</span>
              {l.status === "locked" ? (
                <Lock className="h-3.5 w-3.5 shrink-0" />
              ) : l.status === "done" ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: "var(--lab-accent)" }}
                />
              ) : (
                <span className="text-[10px]" style={{ color: "var(--lab-accent)" }}>
                  Open
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}
