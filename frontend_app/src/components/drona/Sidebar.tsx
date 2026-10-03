"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Lock,
  CircleDot,
  CheckCircle2,
} from "lucide-react";
import { DronaProgressStore } from "@/lib/progress-store";
import { displayLabel, chapterDisplayLabel, subjectDisplayLabel } from "@/lib/utils";
import type {
  CurriculumTree,
  LessonStatus,
  MicroLessonMeta,
  ProgressState,
} from "@/lib/types";

interface SidebarProps {
  curriculum: CurriculumTree | null;
  progress: ProgressState;
  orderedPaths: string[];
  selectedPath: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectLesson: (lesson: MicroLessonMeta) => void;
}

function StatusIcon({ status }: { status: LessonStatus }) {
  if (status === "mastered") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-drona-emerald">
        <CheckCircle2 className="h-3.5 w-3.5" /> Mastered
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-drona-amber">
        <CircleDot className="h-3.5 w-3.5" /> In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white/40">
      <Lock className="h-3.5 w-3.5" /> Locked
    </span>
  );
}

export function Sidebar({
  curriculum,
  progress,
  orderedPaths,
  selectedPath,
  collapsed,
  onToggleCollapsed,
  onSelectLesson,
}: SidebarProps) {
  const [openClasses, setOpenClasses] = useState<Record<string, boolean>>({
    "Class-7": true,
  });
  const [openSubjects, setOpenSubjects] = useState<Record<string, boolean>>({});
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});

  const firstClassId = curriculum?.classes[0]?.id;
  const expanded = useMemo(() => {
    if (!firstClassId) return openClasses;
    if (Object.keys(openClasses).length === 0) {
      return { [firstClassId]: true };
    }
    return openClasses;
  }, [firstClassId, openClasses]);

  return (
    <aside
      className={`relative flex h-full flex-col border-r border-white/10 bg-[#0c0c0c] transition-all duration-300 ${
        collapsed ? "w-[72px]" : "w-[320px]"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-4">
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-[0.22em] text-drona-cyan">
              Kriti School
            </p>
            <h1 className="truncate text-lg font-bold text-white">Drona LMS</h1>
          </div>
        ) : (
          <GraduationCap className="mx-auto h-6 w-6 text-drona-emerald" />
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-lg p-2 text-white/60 hover:bg-white/5 hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {!curriculum ? (
          <p className="px-2 text-sm text-white/50">Loading curriculum…</p>
        ) : curriculum.classes.length === 0 ? (
          <p className="px-2 text-sm text-white/50">
            No rendered lessons found.
          </p>
        ) : (
          curriculum.classes.map((cls) => {
            const classOpen = expanded[cls.id] ?? false;
            return (
              <div key={cls.id} className="mb-2">
                <button
                  type="button"
                  onClick={() =>
                    setOpenClasses((prev) => ({
                      ...prev,
                      [cls.id]: !classOpen,
                    }))
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold text-white/90 hover:bg-white/5 ${
                    collapsed ? "justify-center" : ""
                  }`}
                >
                  <GraduationCap className="h-4 w-4 shrink-0 text-drona-emerald" />
                  {!collapsed ? (
                    <>
                      <span className="flex-1 truncate">
                        {displayLabel(cls.name)}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition ${
                          classOpen ? "rotate-180" : ""
                        }`}
                      />
                    </>
                  ) : null}
                </button>

                <AnimatePresence initial={false}>
                  {classOpen && !collapsed ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden pl-2"
                    >
                      {cls.subjects.map((subject) => {
                        const subjectOpen = openSubjects[subject.id] ?? true;
                        return (
                          <div key={subject.id} className="mb-1">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenSubjects((prev) => ({
                                  ...prev,
                                  [subject.id]: !subjectOpen,
                                }))
                              }
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/80 hover:bg-white/5"
                            >
                              <BookOpen className="h-3.5 w-3.5 text-drona-cyan" />
                              <span className="flex-1 truncate">
                                {subjectDisplayLabel(subject.name, subject.displayName)}
                              </span>
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition ${
                                  subjectOpen ? "rotate-180" : ""
                                }`}
                              />
                            </button>

                            <AnimatePresence initial={false}>
                              {subjectOpen ? (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden pl-3"
                                >
                                  {subject.chapters.map((chapter) => {
                                    const chapterOpen =
                                      openChapters[chapter.id] ??
                                      chapter.microLessons.some(
                                        (m) => m.path === selectedPath
                                      );
                                    return (
                                      <div key={chapter.id} className="mb-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setOpenChapters((prev) => ({
                                              ...prev,
                                              [chapter.id]: !chapterOpen,
                                            }))
                                          }
                                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-white/55 hover:bg-white/5"
                                        >
                                          <span className="flex-1 truncate">
                                            {chapterDisplayLabel(
                                              chapter.name,
                                              chapter.title
                                            )}
                                          </span>
                                          <ChevronDown
                                            className={`h-3 w-3 transition ${
                                              chapterOpen ? "rotate-180" : ""
                                            }`}
                                          />
                                        </button>

                                        <AnimatePresence initial={false}>
                                          {chapterOpen ? (
                                            <motion.ul
                                              initial={{
                                                height: 0,
                                                opacity: 0,
                                              }}
                                              animate={{
                                                height: "auto",
                                                opacity: 1,
                                              }}
                                              exit={{ height: 0, opacity: 0 }}
                                              className="space-y-1 overflow-hidden pb-2 pl-1"
                                            >
                                              {chapter.microLessons.map(
                                                (lesson) => {
                                                  const status =
                                                    DronaProgressStore.resolveStatus(
                                                      lesson.path,
                                                      orderedPaths,
                                                      progress
                                                    );
                                                  const locked =
                                                    status === "locked";
                                                  const active =
                                                    selectedPath ===
                                                    lesson.path;

                                                  return (
                                                    <li key={lesson.id}>
                                                      <button
                                                        type="button"
                                                        disabled={locked}
                                                        onClick={() =>
                                                          onSelectLesson(lesson)
                                                        }
                                                        className={`w-full rounded-lg px-2 py-2 text-left transition ${
                                                          active
                                                            ? "bg-drona-emerald/15 ring-1 ring-drona-emerald/40"
                                                            : locked
                                                              ? "opacity-45"
                                                              : "hover:bg-white/5"
                                                        }`}
                                                      >
                                                        <p className="truncate text-sm text-white">
                                                          {lesson.name}
                                                        </p>
                                                        <StatusIcon
                                                          status={status}
                                                        />
                                                      </button>
                                                    </li>
                                                  );
                                                }
                                              )}
                                            </motion.ul>
                                          ) : null}
                                        </AnimatePresence>
                                      </div>
                                    );
                                  })}
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
