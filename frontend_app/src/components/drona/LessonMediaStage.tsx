"use client";

import { useEffect, type RefObject } from "react";
import { ImmersiveSocialScienceModule } from "@/components/ImmersiveSocialScienceModule";
import { LessonJourneyStepper } from "@/components/drona/LessonJourneyStepper";
import {
  VideoPlayer,
  type DronaPlayerHandle,
} from "@/components/drona/VideoPlayer";
import { DronaProgressStore } from "@/lib/progress-store";
import type {
  InteractiveModuleData,
  LessonJourneyStep,
} from "@/lib/types";
import type { LearnStageProps } from "@/components/drona/layouts/types";

type LessonMediaStageProps = Pick<
  LearnStageProps,
  | "selected"
  | "quiz"
  | "progress"
  | "playerRef"
  | "mode"
  | "bookmarks"
  | "marathonEnabled"
  | "isTheaterMode"
  | "onTheaterModeChange"
  | "onTimeUpdate"
  | "onQuizComplete"
  | "nextLesson"
  | "nextUnlocked"
  | "onNextLesson"
> & {
  interactiveModule: InteractiveModuleData | null;
  lessonStep: LessonJourneyStep;
  immersionUnlocked: boolean;
  quizUnlocked: boolean;
  studentName: string;
  onLessonStepChange: (step: LessonJourneyStep) => void;
  onVideoEnded: () => void;
  onImmersionComplete: () => void;
  theaterModeForced?: boolean;
};

export function LessonMediaStage({
  selected,
  quiz,
  progress,
  playerRef,
  mode,
  bookmarks,
  marathonEnabled,
  isTheaterMode,
  onTheaterModeChange,
  onTimeUpdate,
  onQuizComplete,
  nextLesson,
  nextUnlocked,
  onNextLesson,
  interactiveModule,
  lessonStep,
  immersionUnlocked,
  quizUnlocked,
  studentName,
  onLessonStepChange,
  onVideoEnded,
  onImmersionComplete,
  theaterModeForced,
}: LessonMediaStageProps) {
  const selectedProgress = selected
    ? DronaProgressStore.getLesson(progress, selected.path)
    : null;

  const showJourney = Boolean(interactiveModule);
  const effectiveStep: LessonJourneyStep =
    showJourney ? lessonStep : "watch";

  useEffect(() => {
    if (effectiveStep !== "quiz") return;
    const timer = window.setTimeout(() => {
      playerRef.current?.openQuiz();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [effectiveStep, selected?.path, playerRef]);

  if (!selected) return null;

  return (
    <div className="space-y-3">
      {showJourney ? (
        <LessonJourneyStepper
          step={effectiveStep}
          immersionUnlocked={immersionUnlocked}
          quizUnlocked={quizUnlocked}
          quizItemCount={quiz?.item_pool?.length}
          onStepChange={onLessonStepChange}
        />
      ) : null}

      {effectiveStep === "immersion" && interactiveModule ? (
        <ImmersiveSocialScienceModule
          moduleData={interactiveModule}
          studentName={studentName}
          onComplete={onImmersionComplete}
        />
      ) : (
        <VideoPlayer
          ref={playerRef as RefObject<DronaPlayerHandle>}
          videoPath={selected.videoPath}
          quiz={quiz}
          seenItemIds={selectedProgress?.seenItemIds || []}
          lessonPath={selected.path}
          lessonMastered={
            selectedProgress?.status === "mastered" ||
            Boolean(selectedProgress?.masteredAt)
          }
          mode={mode}
          bookmarks={bookmarks}
          marathonEnabled={marathonEnabled}
          theaterMode={theaterModeForced ?? isTheaterMode}
          onTheaterModeChange={onTheaterModeChange}
          onTimeUpdate={onTimeUpdate}
          onQuizComplete={onQuizComplete}
          canGoNext={Boolean(
            nextLesson && (nextUnlocked || mode === "exam_prep")
          )}
          onNextLesson={onNextLesson}
          suppressAutoQuiz={showJourney}
          onVideoEnded={onVideoEnded}
        />
      )}
    </div>
  );
}
