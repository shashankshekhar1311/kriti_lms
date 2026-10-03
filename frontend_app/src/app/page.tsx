"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopHeader } from "@/components/drona/TopHeader";
import { PracticeArenaModal } from "@/components/drona/PracticeArenaModal";
import { WrittenWorkspaceModal } from "@/components/drona/WrittenWorkspaceModal";
import { FlashcardCarousel } from "@/components/drona/FlashcardCarousel";
import { ExamRevisionSheet } from "@/components/drona/ExamRevisionSheet";
import { type DronaPlayerHandle } from "@/components/drona/VideoPlayer";
import { DronaProgressStore } from "@/lib/progress-store";
import { displayLabel, chapterDisplayLabel } from "@/lib/utils";
import { useLayoutPreference } from "@/components/drona/LayoutPreferenceProvider";
import { SoftStudioLayout } from "@/components/drona/layouts/SoftStudioLayout";
import { TheaterLayout } from "@/components/drona/layouts/TheaterLayout";
import { WarmAcademicLayout } from "@/components/drona/layouts/WarmAcademicLayout";
import type {
  AppMode,
  ConceptBookmark,
  CurriculumTree,
  InteractiveModuleData,
  LessonJourneyStep,
  MicroLessonMeta,
  ProgressState,
  QuizItem,
  QuizPayload,
} from "@/lib/types";

function flattenLessons(tree: CurriculumTree | null): MicroLessonMeta[] {
  if (!tree) return [];
  const lessons: MicroLessonMeta[] = [];
  for (const cls of tree.classes) {
    for (const subject of cls.subjects) {
      for (const chapter of subject.chapters) {
        lessons.push(...chapter.microLessons);
      }
    }
  }
  return lessons;
}

export default function HomePage() {
  const { layoutId, layout, hydrated: layoutHydrated, openChooser } =
    useLayoutPreference();
  const [curriculum, setCurriculum] = useState<CurriculumTree | null>(null);
  // Default state only — load localStorage after mount to avoid SSR hydration mismatch
  const [progress, setProgress] = useState<ProgressState>({
    lessons: {},
    streak: 0,
    lastActiveDate: null,
    selectedLessonPath: null,
  });
  const [progressHydrated, setProgressHydrated] = useState(false);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [selected, setSelected] = useState<MicroLessonMeta | null>(null);
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [interactiveModule, setInteractiveModule] =
    useState<InteractiveModuleData | null>(null);
  const [lessonStep, setLessonStep] = useState<LessonJourneyStep>("watch");
  const [immersionUnlocked, setImmersionUnlocked] = useState(false);
  const [quizUnlocked, setQuizUnlocked] = useState(false);
  const [narration, setNarration] = useState<string>("");
  const [bookmarks, setBookmarks] = useState<ConceptBookmark[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<DronaPlayerHandle>(null);

  const [practiceArenaOpen, setPracticeArenaOpen] = useState(false);
  const [practiceArenaTab, setPracticeArenaTab] = useState<"workout" | "mock" | "vault">("workout");
  const [practiceVaultScope, setPracticeVaultScope] = useState<"chapter" | "all">(
    "chapter"
  );
  const [writtenWorkspaceOpen, setWrittenWorkspaceOpen] = useState(false);
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);
  const [revisionSheetOpen, setRevisionSheetOpen] = useState(false);

  const lessons = useMemo(() => flattenLessons(curriculum), [curriculum]);
  const orderedPaths = useMemo(() => lessons.map((l) => l.path), [lessons]);

  const stats = useMemo(
    () => DronaProgressStore.stats(orderedPaths, progress),
    [orderedPaths, progress]
  );

  const focusMode = isLeftSidebarCollapsed && isRightPanelCollapsed;

  // Apply layout behavior when the student switches Soft / Theater / Warm
  useEffect(() => {
    if (!layoutHydrated) return;
    if (layoutId === "theater") {
      setIsLeftSidebarCollapsed(true);
      setIsRightPanelCollapsed(true);
      setIsTheaterMode(true);
    } else {
      setIsLeftSidebarCollapsed(false);
      setIsRightPanelCollapsed(false);
      setIsTheaterMode(false);
    }
  }, [layoutId, layoutHydrated]);

  const currentChapterPath = useMemo(() => {
    if (!selected) return "";
    const parts = selected.path.split("/");
    const mlIdx = parts.findIndex((p) => p.startsWith("Micro_Lesson"));
    if (mlIdx > 0) return parts.slice(0, mlIdx).join("/");
    return parts.slice(0, -1).join("/");
  }, [selected]);

  const currentChapterName = useMemo(() => {
    if (!currentChapterPath) return "Chapter Practice";
    for (const cls of curriculum?.classes || []) {
      for (const subject of cls.subjects) {
        const chapter = subject.chapters.find(
          (c) => c.path === currentChapterPath
        );
        if (chapter) {
          return chapterDisplayLabel(chapter.name, chapter.title);
        }
      }
    }
    const base = currentChapterPath.split("/").pop() || "";
    return displayLabel(base);
  }, [currentChapterPath, curriculum]);

  const chapterMistakeCount = useMemo(
    () => DronaProgressStore.mistakeCount(progress, currentChapterPath),
    [progress, currentChapterPath]
  );

  const totalMistakeCount = useMemo(
    () => DronaProgressStore.mistakeCount(progress),
    [progress]
  );

  const handleOpenPracticeArena = useCallback(
    (
      initialTab: "workout" | "mock" | "vault" = "workout",
      vaultScope: "chapter" | "all" = "chapter"
    ) => {
      setPracticeArenaTab(initialTab);
      setPracticeVaultScope(vaultScope);
      setPracticeArenaOpen(true);
    },
    []
  );

  const handleOpenWrittenWorkspace = useCallback(() => {
    setWrittenWorkspaceOpen(true);
  }, []);

  const handleOpenFlashcards = useCallback(() => {
    setFlashcardsOpen(true);
  }, []);

  const handleOpenRevisionSheet = useCallback(() => {
    setRevisionSheetOpen(true);
  }, []);

  const classLabel = useMemo(() => {
    if (selected) {
      const first = selected.path.split("/")[0];
      return displayLabel(first);
    }
    return curriculum?.classes[0]
      ? displayLabel(curriculum.classes[0].name)
      : "Class —";
  }, [selected, curriculum]);

  useEffect(() => {
    setProgress(DronaProgressStore.load());
    setProgressHydrated(true);
  }, []);

  useEffect(() => {
    if (!progressHydrated) return;
    DronaProgressStore.save(progress);
  }, [progress, progressHydrated]);

  useEffect(() => {
    if (!progressHydrated) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/curriculum");
        if (!res.ok) throw new Error("Failed to load curriculum");
        const data = (await res.json()) as CurriculumTree;
        if (cancelled) return;
        setCurriculum(data);

        const flat = flattenLessons(data);
        const paths = flat.map((l) => l.path);
        const stored = DronaProgressStore.load();

        // Deep-link from Exam Worksheet QR: ?chapter=...&mode=exam_prep&written=1
        const params =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
            : null;
        const deepChapter = params?.get("chapter")?.replace(/\\/g, "/") || null;
        const deepMode = params?.get("mode");
        const openWritten = params?.get("written") === "1";

        if (deepMode === "exam_prep" || deepMode === "learn") {
          setProgress((prev) =>
            DronaProgressStore.setMode(prev, deepMode as AppMode)
          );
        }

        let preferred =
          stored.selectedLessonPath &&
          flat.find((l) => l.path === stored.selectedLessonPath);

        if (deepChapter) {
          const chapterMatch = flat.find(
            (l) =>
              l.path.startsWith(deepChapter + "/") || l.path === deepChapter
          );
          if (chapterMatch) preferred = chapterMatch;
        }

        const firstUnlocked =
          preferred &&
          DronaProgressStore.isUnlocked(preferred.path, paths, stored)
            ? preferred
            : flat.find((l) =>
                DronaProgressStore.isUnlocked(l.path, paths, stored)
              ) ||
              flat[0] ||
              null;

        if (firstUnlocked) setSelected(firstUnlocked);
        if (openWritten) {
          // Defer open so selected chapter is ready
          setTimeout(() => setWrittenWorkspaceOpen(true), 300);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Curriculum error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [progressHydrated]);

  useEffect(() => {
    if (!selected) {
      setQuiz(null);
      setInteractiveModule(null);
      setLessonStep("watch");
      setImmersionUnlocked(false);
      setQuizUnlocked(false);
      setNarration("");
      setBookmarks([]);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingLesson(true);
      setError(null);
      setLessonStep("watch");
      setImmersionUnlocked(false);
      setQuizUnlocked(false);
      setInteractiveModule(null);
      try {
        const tasks: Promise<void>[] = [];

        // 1. Bookmarks & Visual Events
        tasks.push(
          (async () => {
            try {
              const res = await fetch(
                `/api/bookmarks?path=${encodeURIComponent(selected.path)}`
              );
              if (!res.ok) {
                if (!cancelled) setBookmarks([]);
                return;
              }
              const data = await res.json();
              if (!cancelled) setBookmarks(data.bookmarks || []);
            } catch {
              if (!cancelled) setBookmarks([]);
            }
          })()
        );

        // 2. Quiz Payload
        if (selected.quizPath) {
          tasks.push(
            (async () => {
              const res = await fetch(
                `/api/quiz?path=${encodeURIComponent(selected.quizPath!)}`
              );
              if (!res.ok) throw new Error("Quiz unavailable");
              const data = (await res.json()) as QuizPayload;
              if (!cancelled) setQuiz(data);
            })()
          );
        } else if (!cancelled) {
          setQuiz(null);
        }

        // 3. Narration text
        if (selected.narrationPath) {
          tasks.push(
            (async () => {
              const res = await fetch(
                `/api/narration?path=${encodeURIComponent(selected.narrationPath!)}`
              );
              if (!res.ok) {
                if (!cancelled) setNarration("");
                return;
              }
              const data = (await res.json()) as { text: string };
              if (!cancelled) setNarration(data.text || "");
            })()
          );
        } else if (!cancelled) {
          setNarration("");
        }

        // 4. Immersive Social Science module
        tasks.push(
          (async () => {
            try {
              const qs = selected.interactiveModulePath
                ? `path=${encodeURIComponent(selected.interactiveModulePath)}`
                : `lessonPath=${encodeURIComponent(selected.path)}`;
              const res = await fetch(`/api/interactive-module?${qs}`);
              if (!res.ok) {
                if (!cancelled) setInteractiveModule(null);
                return;
              }
              const data = (await res.json()) as InteractiveModuleData;
              if (!cancelled) setInteractiveModule(data);
            } catch {
              if (!cancelled) setInteractiveModule(null);
            }
          })()
        );

        await Promise.all(tasks);
        // Lessons without video can enter Immersion Lab immediately
        if (!cancelled && !selected.hasVideo) {
          setImmersionUnlocked(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Lesson load failed");
        }
      } finally {
        if (!cancelled) setLoadingLesson(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (isTheaterMode) {
      setIsRightPanelCollapsed(true);
    }
  }, [isTheaterMode]);

  const selectedLessonProgress = selected
    ? DronaProgressStore.getLesson(progress, selected.path)
    : null;

  // Next stays inside the current subject so "Next" never jumps across subjects.
  const subjectPaths = selected
    ? DronaProgressStore.subjectScopedPaths(selected.path, orderedPaths)
    : [];
  const selectedIndex = selected ? subjectPaths.indexOf(selected.path) : -1;
  const nextPath =
    selectedIndex >= 0 && selectedIndex < subjectPaths.length - 1
      ? subjectPaths[selectedIndex + 1]
      : null;
  const nextLesson = nextPath
    ? lessons.find((l) => l.path === nextPath) || null
    : null;
  const nextUnlocked = nextLesson
    ? DronaProgressStore.isUnlocked(nextLesson.path, orderedPaths, progress)
    : false;

  const handleSelectLesson = useCallback(
    (lesson: MicroLessonMeta) => {
      if (
        !DronaProgressStore.isUnlocked(lesson.path, orderedPaths, progress)
      ) {
        return;
      }
      setSelected(lesson);
      setProgress((prev) => DronaProgressStore.setSelected(prev, lesson.path));
    },
    [orderedPaths, progress]
  );

  const handleQuizComplete = useCallback(
    (result: {
      passed: boolean;
      score: number;
      attemptedIds: string[];
      failedItems?: QuizItem[];
      solvedIds?: string[];
    }) => {
      if (!selected) return;
      setProgress((prev) => {
        let next = DronaProgressStore.markAttempt(
          prev,
          selected.path,
          result.attemptedIds,
          result.score,
          result.passed
        );
        if (result.failedItems && result.failedItems.length > 0) {
          next = DronaProgressStore.recordMistakes(
            next,
            selected.path,
            result.failedItems,
            selected.name
          );
        }
        if (result.solvedIds && result.solvedIds.length > 0) {
          next = DronaProgressStore.clearMistakes(next, result.solvedIds);
        }
        return next;
      });
    },
    [selected]
  );

  const handleModeChange = useCallback((newMode: AppMode) => {
    setProgress((prev) => DronaProgressStore.setMode(prev, newMode));
  }, []);

  const handleToggleMarathon = useCallback(() => {
    setProgress((prev) =>
      DronaProgressStore.setMarathon(prev, !prev.marathonEnabled)
    );
  }, []);

  const toggleFocusMode = () => {
    if (focusMode) {
      setIsLeftSidebarCollapsed(false);
      setIsRightPanelCollapsed(false);
      setIsTheaterMode(false);
    } else {
      setIsLeftSidebarCollapsed(true);
      setIsRightPanelCollapsed(true);
    }
  };

  const breadcrumb = selected
    ? selected.path.split("/").map(displayLabel).join(" / ")
    : "Select a micro-lesson";

  const stageProps = {
    curriculum,
    progress,
    orderedPaths,
    lessons,
    selected,
    onSelectLesson: handleSelectLesson,
    quiz,
    narration,
    bookmarks,
    currentTime,
    duration,
    loadingLesson,
    error,
    playerRef,
    isTheaterMode,
    onTheaterModeChange: (enabled: boolean) => {
      setIsTheaterMode(enabled);
      if (enabled) setIsRightPanelCollapsed(true);
    },
    focusMode,
    onToggleFocusMode: toggleFocusMode,
    breadcrumb,
    chapterMistakeCount,
    onOpenPractice: handleOpenPracticeArena,
    onOpenWritten: handleOpenWrittenWorkspace,
    onOpenFlashcards: handleOpenFlashcards,
    onOpenRevisionSheet: handleOpenRevisionSheet,
    onQuizComplete: handleQuizComplete,
    onTimeUpdate: (time: number, dur: number) => {
      setCurrentTime(time);
      setDuration(dur);
    },
    nextLesson,
    nextUnlocked,
    onNextLesson: () => {
      if (nextLesson && (nextUnlocked || progress.mode === "exam_prep")) {
        handleSelectLesson(nextLesson);
      }
    },
    marathonEnabled: Boolean(progress.marathonEnabled),
    onToggleMarathon: handleToggleMarathon,
    mode: (progress.mode || "learn") as AppMode,
    isRightPanelCollapsed,
    onToggleRightPanel: () => setIsRightPanelCollapsed((v) => !v),
    classLabel,
    interactiveModule,
    lessonStep,
    immersionUnlocked,
    quizUnlocked,
    studentName: "Saanvi",
    onLessonStepChange: (step: LessonJourneyStep) => {
      if (step === "immersion" && !immersionUnlocked) return;
      if (step === "quiz" && !quizUnlocked) return;
      setLessonStep(step);
    },
    onVideoEnded: () => {
      if (!interactiveModule) return;
      setImmersionUnlocked(true);
      setLessonStep("immersion");
    },
    onImmersionComplete: () => {
      setQuizUnlocked(true);
      setLessonStep("quiz");
    },
  };

  const showClassicSidebar = false;

  return (
    <div className="layout-shell flex h-screen overflow-hidden bg-[color:var(--layout-bg)] text-[color:var(--layout-text)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          classLabel={classLabel}
          streak={stats.streak}
          masteredCount={stats.masteredCount}
          totalLessons={stats.totalLessons}
          completionPct={stats.completionPct}
          mode={progress.mode || "learn"}
          onModeChange={handleModeChange}
          mistakeCount={totalMistakeCount}
          onOpenMistakes={() => handleOpenPracticeArena("vault", "all")}
          onOpenLayoutChooser={openChooser}
          layoutLabel={layout.label}
        />

        {layoutId === "warm" ? (
          <WarmAcademicLayout {...stageProps} />
        ) : layoutId === "soft" ? (
          <SoftStudioLayout {...stageProps} />
        ) : (
          <TheaterLayout {...stageProps} />
        )}
      </div>

      {practiceArenaOpen ? (
        <PracticeArenaModal
          open={practiceArenaOpen}
          onClose={() => setPracticeArenaOpen(false)}
          chapterPath={currentChapterPath}
          chapterName={currentChapterName}
          progress={progress}
          onProgressUpdate={(next) => setProgress(next)}
          initialTab={practiceArenaTab}
          vaultScope={practiceVaultScope}
        />
      ) : null}

      {writtenWorkspaceOpen ? (
        <WrittenWorkspaceModal
          open={writtenWorkspaceOpen}
          onClose={() => setWrittenWorkspaceOpen(false)}
          chapterPath={currentChapterPath}
          chapterName={currentChapterName}
        />
      ) : null}

      {flashcardsOpen ? (
        <FlashcardCarousel
          open={flashcardsOpen}
          onClose={() => setFlashcardsOpen(false)}
          chapterPath={currentChapterPath}
          chapterName={currentChapterName}
          onOpenRevisionSheet={() => {
            setFlashcardsOpen(false);
            setRevisionSheetOpen(true);
          }}
        />
      ) : null}

      {revisionSheetOpen ? (
        <ExamRevisionSheet
          open={revisionSheetOpen}
          onClose={() => setRevisionSheetOpen(false)}
          chapterPath={currentChapterPath}
          chapterName={currentChapterName}
        />
      ) : null}
    </div>
  );
}
