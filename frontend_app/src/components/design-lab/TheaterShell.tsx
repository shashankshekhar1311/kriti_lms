"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListVideo,
  MessageSquareText,
  NotebookPen,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOCK_CURRICULUM, findLesson } from "./mockData";
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

type Tool = "playlist" | "transcript" | "quiz" | "notes" | null;

/**
 * Focus Theater — full-bleed immersive player.
 * No persistent sidebar or right column. Chrome auto-hides; tools are overlays only.
 */
export function TheaterShell() {
  const [lessonId, setLessonId] = useState("ml6");
  const [playing, setPlaying] = useState(true);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [tool, setTool] = useState<Tool>(null);
  const [examOpen, setExamOpen] = useState(false);
  const [progress] = useFakeProgress(playing);

  const selection = useMemo(() => findLesson(lessonId), [lessonId]);
  const lessons = MOCK_CURRICULUM[0].chapters[0].lessons;
  const idx = lessons.findIndex((l) => l.id === lessonId);

  useEffect(() => {
    if (!playing || tool || examOpen) {
      setChromeVisible(true);
      return;
    }
    setChromeVisible(true);
    const hide = window.setTimeout(() => setChromeVisible(false), 2200);
    return () => window.clearTimeout(hide);
  }, [playing, tool, examOpen, progress]);

  const openTool = (t: Tool) => {
    setTool(t);
    setChromeVisible(true);
  };

  return (
    <LabRoot
      themeId="theater"
      className="relative flex h-full min-h-[720px] flex-col overflow-hidden rounded-2xl border"
    >
      <div
        className="relative min-h-0 flex-1"
        style={{ background: "var(--lab-player-bg)" }}
        onMouseMove={() => setChromeVisible(true)}
        onClick={() => {
          if (tool) return;
          setPlaying((p) => !p);
          setChromeVisible(true);
        }}
      >
        {/* Full-bleed stage */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full transition",
              chromeVisible || !playing ? "opacity-100" : "opacity-0"
            )}
            style={{
              background: "var(--lab-accent)",
              color: "var(--lab-accent-ink)",
              boxShadow: "var(--lab-shadow)",
            }}
          >
            <PlayGlyph playing={playing} />
          </div>
        </div>

        {/* Top chrome */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/80 to-transparent px-4 pb-16 pt-4 transition",
            chromeVisible ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="pointer-events-auto flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px]" style={{ color: "var(--lab-muted)" }}>
                Ch 12 · Understanding Markets
              </p>
              <h1
                className="max-w-xl text-lg font-semibold tracking-tight sm:text-2xl"
                style={{ fontFamily: "var(--font-display), sans-serif" }}
              >
                {selection?.lesson.title}
              </h1>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExamOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: "var(--lab-accent)",
                color: "var(--lab-accent-ink)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Exam
            </button>
          </div>
        </div>

        {/* Bottom floating controls */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-10 px-4 pb-4 transition",
            chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="mx-auto max-w-4xl rounded-2xl border px-4 py-3 backdrop-blur-md"
            style={{
              background: "rgba(14,14,14,0.78)",
              borderColor: "var(--lab-border)",
            }}
          >
            <div
              className="mb-3 h-1 overflow-hidden rounded-full"
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <IconBtn
                  label="Previous"
                  onClick={() => {
                    if (idx > 0 && lessons[idx - 1].status !== "locked") {
                      setLessonId(lessons[idx - 1].id);
                    }
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  label={playing ? "Pause" : "Play"}
                  onClick={() => setPlaying((p) => !p)}
                >
                  <PlayGlyph playing={playing} />
                </IconBtn>
                <IconBtn
                  label="Next"
                  onClick={() => {
                    if (
                      idx < lessons.length - 1 &&
                      lessons[idx + 1].status !== "locked"
                    ) {
                      setLessonId(lessons[idx + 1].id);
                    }
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </IconBtn>
                <span
                  className="ml-2 text-[11px] tabular-nums"
                  style={{ color: "var(--lab-muted)" }}
                >
                  {formatTime((progress / 100) * 190)} / 3:10
                </span>
              </div>
              <div className="flex items-center gap-1">
                <IconBtn
                  label="Playlist"
                  active={tool === "playlist"}
                  onClick={() =>
                    openTool(tool === "playlist" ? null : "playlist")
                  }
                >
                  <ListVideo className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  label="Transcript"
                  active={tool === "transcript"}
                  onClick={() =>
                    openTool(tool === "transcript" ? null : "transcript")
                  }
                >
                  <MessageSquareText className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  label="Quiz Gate"
                  active={tool === "quiz"}
                  onClick={() => openTool(tool === "quiz" ? null : "quiz")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  label="Notes"
                  active={tool === "notes"}
                  onClick={() => openTool(tool === "notes" ? null : "notes")}
                >
                  <NotebookPen className="h-4 w-4" />
                </IconBtn>
              </div>
            </div>
          </div>
          <p
            className="mt-2 text-center text-[10px]"
            style={{ color: "var(--lab-muted)" }}
          >
            Immersive stage · chrome auto-hides while playing · tools are
            overlays only
          </p>
        </div>

        {/* Side overlay panel */}
        {tool && (
          <div
            className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l"
            style={{
              background: "rgba(8,8,8,0.96)",
              borderColor: "var(--lab-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "var(--lab-border)" }}
            >
              <h2 className="text-sm font-semibold capitalize">
                {tool === "playlist" ? "Up next" : tool}
              </h2>
              <button
                type="button"
                onClick={() => setTool(null)}
                aria-label="Close panel"
                style={{ color: "var(--lab-muted)" }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {tool === "playlist" && (
                <ul className="space-y-2">
                  {lessons.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        disabled={l.status === "locked"}
                        onClick={() => {
                          if (l.status !== "locked") {
                            setLessonId(l.id);
                            setTool(null);
                          }
                        }}
                        className="w-full rounded-xl border px-3 py-3 text-left text-sm"
                        style={{
                          borderColor:
                            l.id === lessonId
                              ? "var(--lab-accent)"
                              : "var(--lab-border)",
                          background:
                            l.id === lessonId
                              ? "var(--lab-accent-soft)"
                              : "var(--lab-surface-2)",
                          opacity: l.status === "locked" ? 0.45 : 1,
                        }}
                      >
                        {l.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {tool === "transcript" && <TranscriptList />}
              {tool === "quiz" && <QuizGatePreview />}
              {tool === "notes" && <NotesSnippet />}
            </div>
          </div>
        )}
      </div>

      {examOpen && <ExamCards onClose={() => setExamOpen(false)} />}
    </LabRoot>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-xl transition"
      style={{
        background: active ? "var(--lab-accent)" : "transparent",
        color: active ? "var(--lab-accent-ink)" : "var(--lab-text)",
      }}
    >
      {children}
    </button>
  );
}
