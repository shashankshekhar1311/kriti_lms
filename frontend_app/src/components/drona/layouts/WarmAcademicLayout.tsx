"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookMarked,
  CheckCircle2,
  Lock,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { LessonHeader } from "@/components/drona/LessonHeader";
import { LessonMediaStage } from "@/components/drona/LessonMediaStage";
import { RightPanel } from "@/components/drona/RightPanel";
import { DronaProgressStore } from "@/lib/progress-store";
import { displayLabel, chapterDisplayLabel, subjectDisplayLabel, cn } from "@/lib/utils";
import type { ChapterMeta, MicroLessonMeta, SubjectMeta } from "@/lib/types";
import type { LearnStageProps } from "./types";

type WarmPage = "subjects" | "chapters" | "lesson";

type SubjectBook = {
  subject: SubjectMeta;
  className: string;
  chapterCount: number;
  lessonCount: number;
  masteredCount: number;
};

/**
 * Warm Academic — subjects as books → chapters inside a book → lesson page.
 */
export function WarmAcademicLayout(props: LearnStageProps) {
  const [page, setPage] = useState<WarmPage>("subjects");
  const [activeSubjectPath, setActiveSubjectPath] = useState<string | null>(
    null
  );
  const [playerExpanded, setPlayerExpanded] = useState(false);

  useEffect(() => {
    if (!playerExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlayerExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerExpanded]);

  const subjectBooks = useMemo(() => {
    const list: SubjectBook[] = [];
    if (!props.curriculum) return list;
    for (const cls of props.curriculum.classes) {
      for (const subject of cls.subjects) {
        const lessons = subject.chapters.flatMap((c) => c.microLessons);
        list.push({
          subject,
          className: cls.name,
          chapterCount: subject.chapters.length,
          lessonCount: lessons.length,
          masteredCount: lessons.filter((l) =>
            DronaProgressStore.isLessonMastered(props.progress, l.path)
          ).length,
        });
      }
    }
    return list;
  }, [props.curriculum, props.progress]);

  const activeBook = useMemo(
    () =>
      subjectBooks.find((b) => b.subject.path === activeSubjectPath) || null,
    [subjectBooks, activeSubjectPath]
  );

  const subjectChapters = useMemo(() => {
    if (!activeBook) return [] as ChapterMeta[];
    return activeBook.subject.chapters;
  }, [activeBook]);

  const chapterLessons = useMemo(() => {
    if (!props.selected) return [] as MicroLessonMeta[];
    const parts = props.selected.path.split("/");
    const mlIdx = parts.findIndex((p) => p.startsWith("Micro_Lesson"));
    const chapterPath =
      mlIdx > 0 ? parts.slice(0, mlIdx).join("/") : parts.slice(0, -1).join("/");
    return props.lessons.filter(
      (l) =>
        l.path.startsWith(chapterPath + "/") ||
        l.path.split("/").slice(0, -1).join("/") === chapterPath
    );
  }, [props.selected, props.lessons]);

  const openSubject = (book: SubjectBook) => {
    setActiveSubjectPath(book.subject.path);
    setPage("chapters");
    setPlayerExpanded(false);
  };

  const openLesson = (lesson: MicroLessonMeta) => {
    if (
      !DronaProgressStore.isUnlocked(
        lesson.path,
        props.orderedPaths,
        props.progress
      ) &&
      props.mode !== "exam_prep"
    ) {
      return;
    }
    // Keep subject context when opening from a chapter card
    const parts = lesson.path.split("/");
    if (parts.length >= 2) {
      setActiveSubjectPath(parts.slice(0, 2).join("/"));
    }
    props.onSelectLesson(lesson);
    setPage("lesson");
    setPlayerExpanded(false);
  };

  if (page === "subjects") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6 sm:px-10">
        {props.error ? (
          <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700">
            {props.error}
          </div>
        ) : null}
        <p
          className="text-[12px] font-medium"
          style={{ color: "var(--layout-accent)" }}
        >
          {props.classLabel} · Bookshelf
        </p>
        <h1
          className="mt-1 text-3xl tracking-tight sm:text-4xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Your bookshelf
        </h1>
        <p
          className="mt-2 max-w-xl text-sm leading-relaxed"
          style={{ color: "var(--layout-muted)" }}
        >
          Choose a subject book first. Inside each book you will find its
          chapters and micro-lessons — easier than browsing everything at once.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjectBooks.map((book) => (
            <button
              key={book.subject.path}
              type="button"
              onClick={() => openSubject(book)}
              className="flex min-h-[200px] flex-col rounded-2xl border p-5 text-left transition hover:opacity-95"
              style={{
                background: "var(--layout-surface)",
                borderColor: "var(--layout-border)",
                boxShadow: "0 10px 32px rgba(60,40,20,0.06)",
              }}
            >
              <div
                className="mb-4 flex h-12 w-10 items-end justify-center rounded-sm border-l-4 pb-1 text-[10px] font-bold"
                style={{
                  borderColor: "var(--layout-accent)",
                  background: "var(--layout-surface-2)",
                  color: "var(--layout-accent)",
                }}
              >
                BOOK
              </div>
              <p
                className="text-[11px]"
                style={{ color: "var(--layout-muted)" }}
              >
                {displayLabel(book.className)} · {book.chapterCount} chapters
              </p>
              <h2
                className="mt-1 text-xl leading-snug"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {subjectDisplayLabel(book.subject.name, book.subject.displayName)}
              </h2>
              <p
                className="mt-3 text-[12px]"
                style={{ color: "var(--layout-muted)" }}
              >
                {book.masteredCount}/{book.lessonCount} lessons mastered
              </p>
              <span
                className="mt-auto pt-4 text-[12px] font-semibold"
                style={{ color: "var(--layout-accent)" }}
              >
                Open book →
              </span>
            </button>
          ))}
          {subjectBooks.length === 0 ? (
            <div
              className="flex min-h-[200px] flex-col justify-between rounded-2xl border border-dashed p-5"
              style={{ borderColor: "var(--layout-border)" }}
            >
              <BookMarked
                className="h-8 w-8"
                style={{ color: "var(--layout-accent)" }}
              />
              <p style={{ color: "var(--layout-muted)" }}>
                Loading subjects…
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (page === "chapters" && !activeBook) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <button
          type="button"
          onClick={() => setPage("subjects")}
          className="rounded-full px-4 py-2 text-sm font-semibold"
          style={{
            background: "var(--layout-accent)",
            color: "var(--layout-accent-ink)",
          }}
        >
          Back to bookshelf
        </button>
      </div>
    );
  }

  if (page === "chapters" && activeBook) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6 sm:px-10">
        <button
          type="button"
          onClick={() => setPage("subjects")}
          className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium"
          style={{
            borderColor: "var(--layout-border)",
            background: "var(--layout-surface)",
            color: "var(--layout-text)",
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All books
        </button>
        <p
          className="text-[12px] font-medium"
          style={{ color: "var(--layout-accent)" }}
        >
          {displayLabel(activeBook.className)} · Subject book
        </p>
        <h1
          className="mt-1 text-3xl tracking-tight sm:text-4xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          {subjectDisplayLabel(activeBook.subject.name, activeBook.subject.displayName)}
        </h1>
        <p
          className="mt-2 max-w-xl text-sm leading-relaxed"
          style={{ color: "var(--layout-muted)" }}
        >
          Chapters in this book. Open a chapter lesson when you are ready.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjectChapters.map((chapter) => {
            const mastered = chapter.microLessons.filter((l) =>
              DronaProgressStore.isLessonMastered(props.progress, l.path)
            ).length;
            return (
              <article
                key={chapter.path}
                className="flex min-h-[220px] flex-col rounded-2xl border p-5"
                style={{
                  background: "var(--layout-surface)",
                  borderColor: "var(--layout-border)",
                  boxShadow: "0 10px 32px rgba(60,40,20,0.06)",
                }}
              >
                <p
                  className="text-[11px]"
                  style={{ color: "var(--layout-muted)" }}
                >
                  {mastered}/{chapter.microLessons.length} mastered
                </p>
                <h2
                  className="mt-1 text-xl leading-snug"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {chapterDisplayLabel(chapter.name, chapter.title)}
                </h2>
                <ul className="mt-4 flex-1 space-y-2">
                  {chapter.microLessons.map((l) => {
                    const unlocked =
                      DronaProgressStore.isUnlocked(
                        l.path,
                        props.orderedPaths,
                        props.progress
                      ) || props.mode === "exam_prep";
                    const done = DronaProgressStore.isLessonMastered(
                      props.progress,
                      l.path
                    );
                    return (
                      <li key={l.path}>
                        <button
                          type="button"
                          disabled={!unlocked}
                          onClick={() => openLesson(l)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-[13px] transition",
                            !unlocked && "opacity-45"
                          )}
                          style={{
                            background: "var(--layout-surface-2)",
                            color: "var(--layout-text)",
                          }}
                        >
                          <span className="truncate">{l.name}</span>
                          {!unlocked ? (
                            <Lock className="h-3.5 w-3.5 shrink-0" />
                          ) : done ? (
                            <CheckCircle2
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: "var(--layout-accent)" }}
                            />
                          ) : (
                            <span
                              className="text-[10px] font-semibold"
                              style={{ color: "var(--layout-accent)" }}
                            >
                              Open
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  // Lesson page
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => {
            setPlayerExpanded(false);
            setPage(activeSubjectPath ? "chapters" : "subjects");
          }}
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium"
          style={{
            borderColor: "var(--layout-border)",
            background: "var(--layout-surface)",
            color: "var(--layout-text)",
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {activeBook
            ? subjectDisplayLabel(
                activeBook.subject.name,
                activeBook.subject.displayName
              )
            : "Bookshelf"}
        </button>
        <button
          type="button"
          onClick={() => setPlayerExpanded(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
          style={{
            background: "var(--layout-accent-soft)",
            color: "var(--layout-accent)",
          }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fullscreen player
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
          {props.error ? (
            <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700">
              {props.error}
            </div>
          ) : null}

          {props.selected ? (
            <div className="mx-auto flex w-full max-w-4xl flex-col">
              <LessonHeader
                title={props.selected.name}
                breadcrumb={props.breadcrumb}
                focusMode={props.focusMode}
                onToggleFocusMode={props.onToggleFocusMode}
                mode={props.mode}
                marathonEnabled={props.marathonEnabled}
                onToggleMarathon={props.onToggleMarathon}
                onOpenPractice={props.onOpenPractice}
                onOpenWritten={props.onOpenWritten}
                onOpenFlashcards={props.onOpenFlashcards}
                onOpenRevisionSheet={props.onOpenRevisionSheet}
                mistakeCount={props.chapterMistakeCount}
              />

              {props.loadingLesson ? (
                <p
                  className="mb-2 text-xs"
                  style={{ color: "var(--layout-muted)" }}
                >
                  Loading assessment assets…
                </p>
              ) : null}

              <div
                className="overflow-hidden rounded-2xl border"
                style={{
                  borderColor: "var(--layout-border)",
                  background: "var(--layout-surface)",
                }}
              >
                {!playerExpanded ? (
                  <div className="p-2 sm:p-3">
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
                      theaterModeForced={false}
                    />
                  </div>
                ) : (
                  <div
                    className="flex min-h-[280px] items-center justify-center text-sm"
                    style={{ color: "var(--layout-muted)" }}
                  >
                    Playing in fullscreen…
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {chapterLessons.map((l, i) => {
                  const unlocked =
                    DronaProgressStore.isUnlocked(
                      l.path,
                      props.orderedPaths,
                      props.progress
                    ) || props.mode === "exam_prep";
                  const active = l.path === props.selected?.path;
                  return (
                    <button
                      key={l.path}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => openLesson(l)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium",
                        !unlocked && "opacity-45"
                      )}
                      style={{
                        borderColor: active
                          ? "var(--layout-accent)"
                          : "var(--layout-border)",
                        background: active
                          ? "var(--layout-accent-soft)"
                          : "var(--layout-surface)",
                        color: active
                          ? "var(--layout-accent)"
                          : "var(--layout-text)",
                      }}
                    >
                      L{i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--layout-muted)" }}>
              Pick a lesson from the bookshelf.
            </p>
          )}
        </main>

        {!playerExpanded ? (
          <RightPanel
            collapsed={props.isRightPanelCollapsed}
            onToggleCollapsed={props.onToggleRightPanel}
            narration={props.narration}
            currentTime={props.currentTime}
            duration={props.duration}
            onSeek={(seconds) => {
              props.playerRef.current?.seekAndPlay(seconds);
            }}
            selected={props.selected}
            quiz={props.quiz}
            lessonPath={props.selected?.path ?? null}
            mode={props.mode}
            onOpenQuiz={() => {
              props.playerRef.current?.openQuiz();
            }}
            onOpenPractice={props.onOpenPractice}
            onOpenWritten={props.onOpenWritten}
            onOpenFlashcards={props.onOpenFlashcards}
            onOpenRevisionSheet={props.onOpenRevisionSheet}
            mistakeCount={props.chapterMistakeCount}
          />
        ) : null}
      </div>

      {playerExpanded && props.selected ? (
        <div
          className="absolute inset-0 z-40 flex flex-col"
          style={{ background: "var(--layout-bg)" }}
        >
          <div
            className="flex items-center justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--layout-border)" }}
          >
            <h2
              className="truncate text-lg"
              style={{ fontFamily: "Georgia, serif" }}
            >
              {props.selected.name}
            </h2>
            <button
              type="button"
              onClick={() => setPlayerExpanded(false)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: "var(--layout-accent)",
                color: "var(--layout-accent-ink)",
              }}
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit fullscreen
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-4">
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
