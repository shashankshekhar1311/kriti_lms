"use client";

import { useMemo } from "react";
import { CheckCircle2, Lock, Play } from "lucide-react";
import { LessonHeader } from "@/components/drona/LessonHeader";
import { LessonMediaStage } from "@/components/drona/LessonMediaStage";
import { RightPanel } from "@/components/drona/RightPanel";
import { DronaProgressStore } from "@/lib/progress-store";
import { displayLabel, chapterDisplayLabel, cn } from "@/lib/utils";
import type { MicroLessonMeta } from "@/lib/types";
import type { LearnStageProps } from "./types";

/**
 * Soft Studio — study desk: lesson cards | player | tools column. No IDE tree.
 */
export function SoftStudioLayout(props: LearnStageProps) {
  const chapterLessons = useMemo(() => {
    if (!props.selected) {
      // Default to first chapter with lessons
      const first = props.curriculum?.classes[0]?.subjects[0]?.chapters[0];
      return first?.microLessons ?? [];
    }
    const parts = props.selected.path.split("/");
    const mlIdx = parts.findIndex((p) => p.startsWith("Micro_Lesson"));
    const chapterPath =
      mlIdx > 0 ? parts.slice(0, mlIdx).join("/") : parts.slice(0, -1).join("/");
    return props.lessons.filter((l) => l.path.startsWith(chapterPath + "/"));
  }, [props.selected, props.lessons, props.curriculum]);

  const chapterTitle = useMemo(() => {
    if (!props.selected) return "Chapter";
    const parts = props.selected.path.split("/");
    const mlIdx = parts.findIndex((p) => p.startsWith("Micro_Lesson"));
    const chapterPath =
      mlIdx > 0 ? parts.slice(0, mlIdx).join("/") : parts.slice(0, -1).join("/");
    for (const cls of props.curriculum?.classes || []) {
      for (const subject of cls.subjects) {
        const chapter = subject.chapters.find((c) => c.path === chapterPath);
        if (chapter) {
          return chapterDisplayLabel(chapter.name, chapter.title);
        }
      }
    }
    const chap = mlIdx > 0 ? parts[mlIdx - 1] : parts[parts.length - 2];
    return displayLabel(chap || "Chapter");
  }, [props.selected, props.curriculum]);

  const select = (lesson: MicroLessonMeta) => {
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
    props.onSelectLesson(lesson);
  };

  return (
    <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
      <section
        className="flex min-h-0 flex-col overflow-hidden rounded-2xl border"
        style={{
          background: "var(--layout-surface)",
          borderColor: "var(--layout-border)",
        }}
      >
        <div
          className="border-b px-4 py-3"
          style={{ borderColor: "var(--layout-border)" }}
        >
          <p className="text-[11px]" style={{ color: "var(--layout-muted)" }}>
            {props.classLabel} · Study desk
          </p>
          <h2 className="mt-0.5 text-sm font-semibold leading-snug">
            {chapterTitle}
          </h2>
        </div>
        <ul className="flex-1 space-y-2 overflow-y-auto p-3">
          {chapterLessons.map((l, i) => {
            const unlocked =
              DronaProgressStore.isUnlocked(
                l.path,
                props.orderedPaths,
                props.progress
              ) || props.mode === "exam_prep";
            const done = DronaProgressStore.isLessonMastered(props.progress, l.path);
            const active = l.path === props.selected?.path;
            return (
              <li key={l.path}>
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => select(l)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition",
                    !unlocked && "opacity-45"
                  )}
                  style={{
                    borderColor: active
                      ? "var(--layout-accent)"
                      : "var(--layout-border)",
                    background: active
                      ? "var(--layout-accent-soft)"
                      : "var(--layout-surface-2)",
                  }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color: "var(--layout-accent)" }}
                    >
                      Lesson {i + 1}
                    </span>
                    {done ? (
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        style={{ color: "var(--layout-accent)" }}
                      />
                    ) : !unlocked ? (
                      <Lock
                        className="h-3.5 w-3.5"
                        style={{ color: "var(--layout-muted)" }}
                      />
                    ) : (
                      <Play
                        className="h-3.5 w-3.5"
                        style={{ color: "var(--layout-muted)" }}
                      />
                    )}
                  </div>
                  <p className="text-[13px] font-medium leading-snug">{l.name}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex min-h-0 flex-col overflow-y-auto">
        {props.error ? (
          <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            {props.error}
          </div>
        ) : null}
        {props.selected ? (
          <>
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
              <p className="mb-2 text-xs" style={{ color: "var(--layout-muted)" }}>
                Loading assessment assets…
              </p>
            ) : null}
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
          </>
        ) : (
          <div
            className="flex flex-1 items-center justify-center rounded-2xl border border-dashed text-sm"
            style={{
              borderColor: "var(--layout-border)",
              color: "var(--layout-muted)",
            }}
          >
            Pick a lesson card to begin.
          </div>
        )}
      </section>

      <div className="hidden min-h-0 lg:flex lg:flex-col">
        <RightPanel
          collapsed={false}
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
      </div>
    </div>
  );
}
