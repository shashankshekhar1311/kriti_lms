"use client";

import type { RefObject } from "react";
import type {
  ConceptBookmark,
  CurriculumTree,
  InteractiveModuleData,
  LessonJourneyStep,
  MicroLessonMeta,
  ProgressState,
  QuizPayload,
} from "@/lib/types";
import type { DronaPlayerHandle } from "@/components/drona/VideoPlayer";

export type LearnStageProps = {
  curriculum: CurriculumTree | null;
  progress: ProgressState;
  orderedPaths: string[];
  lessons: MicroLessonMeta[];
  selected: MicroLessonMeta | null;
  onSelectLesson: (lesson: MicroLessonMeta) => void;
  quiz: QuizPayload | null;
  narration: string;
  bookmarks: ConceptBookmark[];
  currentTime: number;
  duration: number;
  loadingLesson: boolean;
  error: string | null;
  playerRef: RefObject<DronaPlayerHandle | null>;
  isTheaterMode: boolean;
  onTheaterModeChange: (enabled: boolean) => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  breadcrumb: string;
  chapterMistakeCount: number;
  onOpenPractice: (tab?: "workout" | "mock" | "vault") => void;
  onOpenWritten: () => void;
  onOpenFlashcards: () => void;
  onOpenRevisionSheet: () => void;
  onQuizComplete: (result: {
    passed: boolean;
    score: number;
    attemptedIds: string[];
    failedItems?: import("@/lib/types").QuizItem[];
    solvedIds?: string[];
  }) => void;
  onTimeUpdate: (time: number, dur: number) => void;
  nextLesson: MicroLessonMeta | null;
  nextUnlocked: boolean;
  onNextLesson: () => void;
  marathonEnabled: boolean;
  onToggleMarathon: () => void;
  mode: import("@/lib/types").AppMode;
  isRightPanelCollapsed: boolean;
  onToggleRightPanel: () => void;
  classLabel: string;
  interactiveModule: InteractiveModuleData | null;
  lessonStep: LessonJourneyStep;
  immersionUnlocked: boolean;
  quizUnlocked: boolean;
  studentName: string;
  onLessonStepChange: (step: LessonJourneyStep) => void;
  onVideoEnded: () => void;
  onImmersionComplete: () => void;
};
