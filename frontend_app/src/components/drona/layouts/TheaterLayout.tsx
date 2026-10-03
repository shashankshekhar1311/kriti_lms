"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FolderOpen,
  Home,
  ListVideo,
  MessageSquareText,
  NotebookPen,
  X,
} from "lucide-react";
import { LessonMediaStage } from "@/components/drona/LessonMediaStage";
import { DronaProgressStore } from "@/lib/progress-store";
import { cn, chapterDisplayLabel, subjectDisplayLabel } from "@/lib/utils";
import type { ChapterMeta, SubjectMeta } from "@/lib/types";
import type { LearnStageProps } from "./types";

type TheaterTool = "playlist" | "transcript" | "quiz" | "notes" | null;
type BrowseLevel = "subjects" | "chapters" | "lessons";

/**
 * Focus Theater — full-bleed player; tools only as overlays.
 * Playlist browses Subjects → Chapters → Lessons without leaving theater.
 */
export function TheaterLayout(props: LearnStageProps) {
  const [tool, setTool] = useState<TheaterTool>(null);
  const [browseLevel, setBrowseLevel] = useState<BrowseLevel>("lessons");
  const [browseSubject, setBrowseSubject] = useState<SubjectMeta | null>(null);
  const [browseChapter, setBrowseChapter] = useState<ChapterMeta | null>(null);

  const subjects = useMemo(() => {
    const list: SubjectMeta[] = [];
    for (const cls of props.curriculum?.classes || []) {
      list.push(...cls.subjects);
    }
    return list;
  }, [props.curriculum]);

  const selectedChapterPath = useMemo(() => {
    if (!props.selected) return null;
    const parts = props.selected.path.split("/");
    const mlIdx = parts.findIndex((p) => p.startsWith("Micro_Lesson"));
    return mlIdx > 0
      ? parts.slice(0, mlIdx).join("/")
      : parts.slice(0, -1).join("/");
  }, [props.selected]);

  const selectedSubjectPath = useMemo(() => {
    if (!selectedChapterPath) return null;
    const parts = selectedChapterPath.split("/");
    // Class / Subject / Chapter
    return parts.length >= 2 ? parts.slice(0, 2).join("/") : parts[0] || null;
  }, [selectedChapterPath]);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.path === selectedSubjectPath) || null,
    [subjects, selectedSubjectPath]
  );

  const selectedChapter = useMemo(
    () =>
      selectedSubject?.chapters.find((c) => c.path === selectedChapterPath) ||
      null,
    [selectedSubject, selectedChapterPath]
  );

  const chapterLessons = useMemo(() => {
    const chapterPath = browseChapter?.path || selectedChapterPath;
    if (!chapterPath) return [];
    return props.lessons.filter((l) => l.path.startsWith(chapterPath + "/"));
  }, [browseChapter, selectedChapterPath, props.lessons]);

  const openPlaylist = (level: BrowseLevel = "lessons") => {
    // Seed browse context from the current lesson
    if (selectedSubjectPath) {
      const subject =
        subjects.find((s) => s.path === selectedSubjectPath) || null;
      setBrowseSubject(subject);
      const chapter =
        subject?.chapters.find((c) => c.path === selectedChapterPath) || null;
      setBrowseChapter(chapter);
    } else {
      setBrowseSubject(null);
      setBrowseChapter(null);
    }
    setBrowseLevel(level);
    setTool("playlist");
  };

  const openBookshelf = () => openPlaylist("subjects");

  // Escape closes overlays; from lesson tools, Home-like back goes to bookshelf.
  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTool(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool]);

  const playlistTitle =
    browseLevel === "subjects"
      ? "Bookshelf"
      : browseLevel === "chapters"
        ? browseSubject
          ? subjectDisplayLabel(browseSubject.name, browseSubject.displayName)
          : "Choose chapter"
        : browseChapter
          ? chapterDisplayLabel(browseChapter.name, browseChapter.title)
          : "Up next";

  const isBookshelfOpen = tool === "playlist" && browseLevel === "subjects";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-black">
      {props.error ? (
        <div className="absolute left-3 right-3 top-3 z-40 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {props.error}
        </div>
      ) : null}

      {/* Always-visible home / chapter switch — sits above the player */}
      <div className="absolute left-3 right-3 top-3 z-40 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openBookshelf}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/75 px-3 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:border-[color:var(--layout-accent)]/60 hover:bg-black/90"
          title="Back to bookshelf — switch subject or chapter"
        >
          <Home className="h-4 w-4 text-[color:var(--layout-accent)]" />
          Bookshelf
        </button>
        {selectedChapter ? (
          <button
            type="button"
            onClick={() => openPlaylist("chapters")}
            className="inline-flex max-w-[min(100%,28rem)] items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-left text-xs text-white/85 backdrop-blur transition hover:border-white/25 hover:bg-black/80"
            title="Switch chapter in this subject"
          >
            <span className="truncate">
              {selectedSubject
                ? subjectDisplayLabel(
                    selectedSubject.name,
                    selectedSubject.displayName
                  )
                : "Subject"}
              {" · "}
              {chapterDisplayLabel(selectedChapter.name, selectedChapter.title)}
            </span>
          </button>
        ) : null}
      </div>

      {props.selected ? (
        <div className="relative z-20 min-h-0 flex-1 overflow-y-auto p-3 pt-14">
          <LessonMediaStage
            selected={props.selected}
            quiz={props.quiz}
            progress={props.progress}
            playerRef={props.playerRef}
            mode={props.mode}
            bookmarks={props.bookmarks}
            marathonEnabled={props.marathonEnabled}
            isTheaterMode={props.isTheaterMode}
            onTheaterModeChange={props.onTheaterModeChange}
            onTimeUpdate={props.onTimeUpdate}
            onQuizComplete={props.onQuizComplete}
            nextLesson={props.nextLesson}
            nextUnlocked={props.nextUnlocked}
            onNextLesson={props.onNextLesson}
            interactiveModule={props.interactiveModule}
            lessonStep={props.lessonStep}
            immersionUnlocked={props.immersionUnlocked}
            quizUnlocked={props.quizUnlocked}
            studentName={props.studentName}
            onLessonStepChange={props.onLessonStepChange}
            onVideoEnded={props.onVideoEnded}
            onImmersionComplete={props.onImmersionComplete}
            theaterModeForced
          />

          {props.lessonStep === "watch" || !props.interactiveModule ? (
            <div className="pointer-events-none sticky bottom-3 z-30 mt-3 flex justify-end">
              <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/10 bg-black/80 p-1 shadow-xl backdrop-blur">
                {(
                  [
                    { id: "playlist" as const, icon: ListVideo, label: "Lessons" },
                    {
                      id: "transcript" as const,
                      icon: MessageSquareText,
                      label: "Transcript",
                    },
                    { id: "quiz" as const, icon: CheckCircle2, label: "Quiz" },
                    { id: "notes" as const, icon: NotebookPen, label: "Notes" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.label}
                    onClick={() => {
                      if (t.id === "playlist") {
                        if (tool === "playlist" && browseLevel === "lessons") {
                          setTool(null);
                        } else {
                          openPlaylist("lessons");
                        }
                        return;
                      }
                      setTool(tool === t.id ? null : t.id);
                    }}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl transition",
                      tool === t.id &&
                        (t.id !== "playlist" || browseLevel === "lessons")
                        ? "bg-[color:var(--layout-accent)] text-[color:var(--layout-accent-ink)]"
                        : "text-white/80 hover:bg-white/10"
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pt-14 text-center text-white/50">
          <p>Select a subject and chapter to enter theater mode.</p>
          <button
            type="button"
            onClick={openBookshelf}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={{
              background: "var(--layout-accent)",
              color: "var(--layout-accent-ink)",
            }}
          >
            Open Bookshelf
          </button>
        </div>
      )}

      {tool ? (
        <div
          className={cn(
            "absolute z-50 flex flex-col border-white/10 bg-black/95",
            isBookshelfOpen
              ? "inset-0 border-0"
              : "inset-y-0 right-0 w-full max-w-md border-l"
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {tool === "playlist" && browseLevel !== "subjects" ? (
                <button
                  type="button"
                  onClick={() => {
                    if (browseLevel === "lessons") {
                      setBrowseLevel("chapters");
                    } else {
                      setBrowseLevel("subjects");
                      setBrowseChapter(null);
                    }
                  }}
                  className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              ) : null}
              <h2 className="truncate text-sm font-semibold text-white">
                {tool === "playlist" ? playlistTitle : tool}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setTool(null)}
              className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 text-sm text-white/85">
            {tool === "playlist" && browseLevel === "subjects" ? (
              <div className="mx-auto w-full max-w-3xl space-y-4">
                <p className="text-[13px] text-white/55">
                  Pick a subject, then a chapter, to continue watching.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {subjects.map((subject) => (
                    <li key={subject.path}>
                      <button
                        type="button"
                        onClick={() => {
                          setBrowseSubject(subject);
                          setBrowseChapter(null);
                          setBrowseLevel("chapters");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:border-white/25 hover:bg-white/[0.07]"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-accent)]">
                          <BookOpen className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-white">
                            {subjectDisplayLabel(
                              subject.name,
                              subject.displayName
                            )}
                          </span>
                          <span className="text-[11px] text-white/45">
                            {subject.chapters.length} chapter
                            {subject.chapters.length === 1 ? "" : "s"}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {tool === "playlist" && browseLevel === "chapters" ? (
              <ul className="mx-auto w-full max-w-3xl space-y-2">
                {(browseSubject?.chapters || []).map((chapter) => (
                  <li key={chapter.path}>
                    <button
                      type="button"
                      onClick={() => {
                        setBrowseChapter(chapter);
                        setBrowseLevel("lessons");
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:border-white/25 hover:bg-white/[0.07]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70">
                        <FolderOpen className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-white">
                          {chapterDisplayLabel(chapter.name, chapter.title)}
                        </span>
                        <span className="text-[11px] text-white/45">
                          {chapter.microLessons.length} micro-lesson
                          {chapter.microLessons.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {tool === "playlist" && browseLevel === "lessons" ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={openBookshelf}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--layout-accent)] hover:underline"
                >
                  <Home className="h-3.5 w-3.5" />
                  Back to Bookshelf
                </button>
                <ul className="space-y-2">
                  {chapterLessons.map((l) => {
                    const unlocked =
                      DronaProgressStore.isUnlocked(
                        l.path,
                        props.orderedPaths,
                        props.progress
                      ) || props.mode === "exam_prep";
                    return (
                      <li key={l.path}>
                        <button
                          type="button"
                          disabled={!unlocked}
                          onClick={() => {
                            if (!unlocked) return;
                            props.onSelectLesson(l);
                            setTool(null);
                          }}
                          className="w-full rounded-xl border px-3 py-3 text-left text-sm disabled:opacity-40"
                          style={{
                            borderColor:
                              l.path === props.selected?.path
                                ? "var(--layout-accent)"
                                : "rgba(255,255,255,0.1)",
                            background:
                              l.path === props.selected?.path
                                ? "var(--layout-accent-soft)"
                                : "rgba(255,255,255,0.04)",
                          }}
                        >
                          {l.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {tool === "transcript" && (
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-white/80">
                {props.narration || "No narration available for this lesson."}
              </pre>
            )}
            {tool === "quiz" && (
              <div>
                <p className="mb-3 text-white/60">
                  Open the lesson quiz gate when you are ready.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    props.playerRef.current?.openQuiz();
                    setTool(null);
                  }}
                  className="rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{
                    background: "var(--layout-accent)",
                    color: "var(--layout-accent-ink)",
                  }}
                >
                  Open Quiz Gate
                </button>
              </div>
            )}
            {tool === "notes" && (
              <div className="space-y-2 text-[13px] text-white/70">
                <p>Exam tools for this chapter:</p>
                <button
                  type="button"
                  className="block w-full rounded-xl border border-white/10 px-3 py-2 text-left hover:bg-white/5"
                  onClick={() => props.onOpenPractice()}
                >
                  Practice Arena
                </button>
                <button
                  type="button"
                  className="block w-full rounded-xl border border-white/10 px-3 py-2 text-left hover:bg-white/5"
                  onClick={() => props.onOpenWritten()}
                >
                  Written Prep
                </button>
                <button
                  type="button"
                  className="block w-full rounded-xl border border-white/10 px-3 py-2 text-left hover:bg-white/5"
                  onClick={() => props.onOpenFlashcards()}
                >
                  Flashcards
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
