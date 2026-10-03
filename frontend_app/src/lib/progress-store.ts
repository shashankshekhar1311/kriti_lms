"use client";

import type {
  AppMode,
  LessonProgress,
  LessonStatus,
  MistakeRecord,
  ProgressState,
  QuizItem,
  WrittenSubmissionRecord,
} from "@/lib/types";

const STORAGE_KEY = "drona-lms-progress-v1";

const defaultState = (): ProgressState => ({
  lessons: {},
  streak: 0,
  lastActiveDate: null,
  selectedLessonPath: null,
  mode: "learn",
  marathonEnabled: false,
  mistakeVault: {},
  writtenSubmissions: {},
});

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function bumpStreak(state: ProgressState): ProgressState {
  const today = todayKey();
  if (state.lastActiveDate === today) return state;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = yesterday.toISOString().slice(0, 10);

  const streak =
    state.lastActiveDate === yKey ? state.streak + 1 : state.streak > 0 ? 1 : 1;

  return {
    ...state,
    streak: Math.max(1, streak),
    lastActiveDate: today,
  };
}

export class DronaProgressStore {
  static load(): ProgressState {
    if (typeof window === "undefined") return defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw) as ProgressState;
      return {
        ...defaultState(),
        ...parsed,
        lessons: parsed.lessons || {},
        mistakeVault: parsed.mistakeVault || {},
        writtenSubmissions: parsed.writtenSubmissions || {},
      };
    } catch {
      return defaultState();
    }
  }

  static save(state: ProgressState): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  static getLesson(
    state: ProgressState,
    lessonPath: string
  ): LessonProgress {
    return (
      state.lessons[lessonPath] || {
        status: "locked",
        attempts: 0,
        seenItemIds: [],
        lastScore: null,
        masteredAt: null,
      }
    );
  }

  /** Class-7/English-Poorvi/Chapter-1/Micro_Lesson_1 → Class-7/English-Poorvi */
  static subjectKey(lessonPath: string): string {
    const parts = lessonPath.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return parts[0] || lessonPath;
  }

  /**
   * Class-7/SocialScience-Part1-Class-7/Chapter-2/Micro_Lesson_1
   * → Class-7/SocialScience-Part1-Class-7/Chapter-2
   */
  static chapterKey(lessonPath: string): string {
    const parts = lessonPath.split("/").filter(Boolean);
    if (parts.length >= 3) return parts.slice(0, 3).join("/");
    return this.subjectKey(lessonPath);
  }

  /** All micro-lessons within the same chapter (ordered). */
  static chapterScopedPaths(
    lessonPath: string,
    orderedPaths: string[]
  ): string[] {
    const key = this.chapterKey(lessonPath);
    return orderedPaths.filter((p) => this.chapterKey(p) === key);
  }

  /** All micro-lessons within the same subject (ordered). Used for Next nav. */
  static subjectScopedPaths(
    lessonPath: string,
    orderedPaths: string[]
  ): string[] {
    const key = this.subjectKey(lessonPath);
    return orderedPaths.filter((p) => this.subjectKey(p) === key);
  }

  static resolveStatus(
    lessonPath: string,
    orderedPaths: string[],
    state: ProgressState
  ): LessonStatus {
    const current = this.getLesson(state, lessonPath);
    if (current.status === "mastered" || current.masteredAt) return "mastered";

    // Exam Prep: free navigation — chapters are taught in any order.
    if (state.mode === "exam_prep") {
      return "in_progress";
    }

    // Learn mode: gate only within a chapter. Other chapters stay independently open.
    const scopedPaths = this.chapterScopedPaths(lessonPath, orderedPaths);
    const index = scopedPaths.indexOf(lessonPath);
    if (index < 0) return "locked";

    // First micro-lesson of each chapter is always unlocked.
    if (index === 0) {
      return "in_progress";
    }

    const prev = scopedPaths[index - 1];
    const prevLesson = this.getLesson(state, prev);
    const prevMastered =
      prevLesson.status === "mastered" || Boolean(prevLesson.masteredAt);

    if (!prevMastered) return "locked";
    return "in_progress";
  }

  static isUnlocked(
    lessonPath: string,
    orderedPaths: string[],
    state: ProgressState
  ): boolean {
    return this.resolveStatus(lessonPath, orderedPaths, state) !== "locked";
  }

  static markAttempt(
    state: ProgressState,
    lessonPath: string,
    seenItemIds: string[],
    score: number,
    passed: boolean
  ): ProgressState {
    const existing = this.getLesson(state, lessonPath);
    const mergedSeen = Array.from(
      new Set([...existing.seenItemIds, ...seenItemIds])
    );

    const nextLesson: LessonProgress = {
      status:
        passed || existing.status === "mastered" || Boolean(existing.masteredAt)
          ? "mastered"
          : "in_progress",
      attempts: existing.attempts + 1,
      seenItemIds: mergedSeen,
      lastScore: score,
      masteredAt: passed
        ? existing.masteredAt || new Date().toISOString()
        : existing.masteredAt,
    };

    let next: ProgressState = {
      ...state,
      lessons: {
        ...state.lessons,
        [lessonPath]: nextLesson,
      },
      selectedLessonPath: lessonPath,
    };

    if (passed) next = bumpStreak(next);
    return next;
  }

  static setSelected(
    state: ProgressState,
    lessonPath: string | null
  ): ProgressState {
    return { ...state, selectedLessonPath: lessonPath };
  }

  static setMode(
    state: ProgressState,
    mode: AppMode
  ): ProgressState {
    return { ...state, mode };
  }

  static setMarathon(
    state: ProgressState,
    marathonEnabled: boolean
  ): ProgressState {
    return { ...state, marathonEnabled };
  }

  static isLessonMastered(
    state: ProgressState,
    lessonPath: string
  ): boolean {
    const lesson = this.getLesson(state, lessonPath);
    return lesson.status === "mastered" || Boolean(lesson.masteredAt);
  }

  static isChapterMastered(
    state: ProgressState,
    chapterLessonPaths: string[]
  ): boolean {
    if (chapterLessonPaths.length === 0) return false;
    return chapterLessonPaths.every((path) => this.isLessonMastered(state, path));
  }

  static recordMistakes(
    state: ProgressState,
    lessonPath: string,
    failedItems: QuizItem[],
    lessonName?: string
  ): ProgressState {
    const currentVault = { ...(state.mistakeVault || {}) };
    for (const item of failedItems) {
      const existing = currentVault[item.id];
      currentVault[item.id] = {
        id: item.id,
        lessonPath,
        lessonName: lessonName || existing?.lessonName || "Micro Lesson",
        question: item.question,
        item,
        failedAt: new Date().toISOString(),
        attemptCount: (existing?.attemptCount || 0) + 1,
      };
    }
    return { ...state, mistakeVault: currentVault };
  }

  static clearMistakes(
    state: ProgressState,
    solvedItemIds: string[]
  ): ProgressState {
    if (!state.mistakeVault) return state;
    const currentVault = { ...state.mistakeVault };
    let changed = false;
    for (const id of solvedItemIds) {
      if (currentVault[id]) {
        delete currentVault[id];
        changed = true;
      }
    }
    return changed ? { ...state, mistakeVault: currentVault } : state;
  }

  static getMistakes(
    state: ProgressState,
    chapterPath?: string
  ): MistakeRecord[] {
    const all = Object.values(state.mistakeVault || {});
    if (!chapterPath) return all;
    const prefix = chapterPath.endsWith("/") ? chapterPath : `${chapterPath}/`;
    return all.filter(
      (m) => m.lessonPath === chapterPath || m.lessonPath.startsWith(prefix)
    );
  }

  static mistakeCount(state: ProgressState, chapterPath?: string): number {
    return this.getMistakes(state, chapterPath).length;
  }

  static recordWrittenSubmission(
    state: ProgressState,
    record: WrittenSubmissionRecord
  ): ProgressState {
    const current = { ...(state.writtenSubmissions || {}) };
    current[record.questionId] = record;
    return { ...state, writtenSubmissions: current };
  }

  static getWrittenSubmissions(
    state: ProgressState,
    chapterPath?: string
  ): WrittenSubmissionRecord[] {
    const all = Object.values(state.writtenSubmissions || {});
    if (!chapterPath) return all;
    return all.filter((s) => s.chapterPath.startsWith(chapterPath));
  }

  static stats(
    orderedPaths: string[],
    state: ProgressState
  ): {
    completionPct: number;
    masteredCount: number;
    totalLessons: number;
    streak: number;
  } {
    const totalLessons = orderedPaths.length;
    const masteredCount = orderedPaths.filter((p) => {
      const lesson = this.getLesson(state, p);
      return lesson.status === "mastered" || Boolean(lesson.masteredAt);
    }).length;

    return {
      completionPct:
        totalLessons === 0
          ? 0
          : Math.round((masteredCount / totalLessons) * 100),
      masteredCount,
      totalLessons,
      streak: state.streak,
    };
  }
}
