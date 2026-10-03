"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Award,
  Bookmark,
  ChevronRight,
  FastForward,
  Maximize,
  Minimize,
  Pause,
  Play,
  RectangleHorizontal,
  Rewind,
  RotateCcw,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { QuizOverlay } from "@/components/drona/QuizOverlay";
import type { AppMode, ConceptBookmark, QuizItem, QuizPayload } from "@/lib/types";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

export interface DronaPlayerHandle {
  seekAndPlay: (seconds: number) => void;
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  openQuiz: () => void;
}

interface VideoPlayerProps {
  videoPath: string | null;
  quiz: QuizPayload | null;
  seenItemIds: string[];
  lessonPath: string;
  lessonMastered?: boolean;
  theaterMode?: boolean;
  mode?: AppMode;
  bookmarks?: ConceptBookmark[];
  marathonEnabled?: boolean;
  onTheaterModeChange?: (enabled: boolean) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onQuizComplete: (result: {
    passed: boolean;
    score: number;
    attemptedIds: string[];
    failedItems?: QuizItem[];
    solvedIds?: string[];
  }) => void;
  onNextLesson?: () => void;
  canGoNext?: boolean;
  /** When true, video end unlocks immersion instead of immediately opening quiz. */
  suppressAutoQuiz?: boolean;
  onVideoEnded?: () => void;
}

export const VideoPlayer = forwardRef<DronaPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    {
      videoPath,
      quiz,
      seenItemIds,
      lessonPath,
      lessonMastered = false,
      theaterMode = false,
      mode = "learn",
      bookmarks = [],
      marathonEnabled = false,
      onTheaterModeChange,
      onTimeUpdate,
      onQuizComplete,
      onNextLesson,
      canGoNext,
      suppressAutoQuiz = false,
      onVideoEnded,
    },
    ref
  ) {
    const shellRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const [controlsLocked, setControlsLocked] = useState(false);
    const [quizOpen, setQuizOpen] = useState(false);
    const [passed, setPassed] = useState(false);
    const [showRevisionEndCard, setShowRevisionEndCard] = useState(false);
    const [showMarathonCountdown, setShowMarathonCountdown] = useState(false);
    const [marathonTimer, setMarathonTimer] = useState(3);

    const isExamPrep = mode === "exam_prep";
    const isMasteredOrExam = lessonMastered || passed || isExamPrep;
    const effectiveControlsLocked = isMasteredOrExam ? false : controlsLocked;

    useEffect(() => {
      setPlaying(false);
      setProgress(0);
      setDuration(0);
      setControlsLocked(false);
      setQuizOpen(false);
      setPassed(false);
      setShowSpeedMenu(false);
      setShowRevisionEndCard(false);
      setShowMarathonCountdown(false);
      setMarathonTimer(3);

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        videoRef.current.playbackRate = speed;
        if (marathonEnabled) {
          void videoRef.current
            .play()
            .then(() => setPlaying(true))
            .catch(() => {});
        }
      }
    }, [lessonPath, videoPath, marathonEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      const onFsChange = () => {
        setIsFullscreen(Boolean(document.fullscreenElement));
      };
      document.addEventListener("fullscreenchange", onFsChange);
      return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    // Countdown effect for chapter marathon
    useEffect(() => {
      let timer: NodeJS.Timeout;
      if (showMarathonCountdown && marathonTimer > 0) {
        timer = setTimeout(() => {
          setMarathonTimer((t) => t - 1);
        }, 1000);
      } else if (showMarathonCountdown && marathonTimer === 0) {
        setShowMarathonCountdown(false);
        onNextLesson?.();
      }
      return () => clearTimeout(timer);
    }, [showMarathonCountdown, marathonTimer, onNextLesson]);

    useImperativeHandle(ref, () => ({
      seekAndPlay(seconds: number) {
        const video = videoRef.current;
        if (!video) return;
        setControlsLocked(false);
        setQuizOpen(false);
        setShowRevisionEndCard(false);
        setShowMarathonCountdown(false);
        video.currentTime = Math.max(0, seconds);
        void video.play();
        setPlaying(true);
      },
      seek(seconds: number) {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(seconds, video.duration || seconds));
        setProgress(video.currentTime);
        onTimeUpdate?.(video.currentTime, video.duration || duration);
      },
      play() {
        void videoRef.current?.play();
        setPlaying(true);
      },
      pause() {
        videoRef.current?.pause();
        setPlaying(false);
      },
      getCurrentTime() {
        return videoRef.current?.currentTime ?? progress;
      },
      getDuration() {
        return videoRef.current?.duration || duration;
      },
      openQuiz() {
        if (quiz) {
          setShowRevisionEndCard(false);
          setShowMarathonCountdown(false);
          setQuizOpen(true);
        }
      },
    }));

    const src = videoPath
      ? `/api/video?path=${encodeURIComponent(videoPath)}`
      : null;

    const togglePlay = () => {
      if (effectiveControlsLocked || !videoRef.current) return;
      if (videoRef.current.paused) {
        setShowRevisionEndCard(false);
        setShowMarathonCountdown(false);
        void videoRef.current.play();
        setPlaying(true);
      } else {
        videoRef.current.pause();
        setPlaying(false);
      }
    };

    const skip = (delta: number) => {
      const video = videoRef.current;
      if (!video || effectiveControlsLocked) return;
      const next = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
      video.currentTime = next;
      setProgress(next);
      onTimeUpdate?.(next, video.duration || duration);
    };

    const jumpToBookmark = (ts: number) => {
      const video = videoRef.current;
      if (!video) return;
      setShowRevisionEndCard(false);
      setShowMarathonCountdown(false);
      video.currentTime = Math.max(0, Math.min(video.duration || duration, ts));
      setProgress(video.currentTime);
      onTimeUpdate?.(video.currentTime, video.duration || duration);
      if (video.paused) {
        void video.play();
        setPlaying(true);
      }
    };

    const toggleFullscreen = async () => {
      const el = shellRef.current;
      if (!el) return;
      try {
        if (!document.fullscreenElement) {
          await el.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch {
        // Fullscreen may be blocked by browser policy
      }
    };

    const setPlaybackSpeed = (rate: number) => {
      setSpeed(rate);
      if (videoRef.current) videoRef.current.playbackRate = rate;
      setShowSpeedMenu(false);
    };

    const onEnded = () => {
      setPlaying(false);
      if (suppressAutoQuiz) {
        onVideoEnded?.();
        return;
      }
      if (marathonEnabled && canGoNext) {
        setShowMarathonCountdown(true);
        setMarathonTimer(3);
        return;
      }
      if (isMasteredOrExam) {
        setShowRevisionEndCard(true);
        return;
      }
      setControlsLocked(true);
      if (quiz) setQuizOpen(true);
    };

    const formatTime = (seconds: number) => {
      if (!Number.isFinite(seconds)) return "0:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");
      return `${m}:${s}`;
    };

    return (
      <div
        ref={shellRef}
        className={`relative overflow-hidden rounded-xl border border-[color:var(--layout-border)] ${
          isFullscreen
            ? "flex h-full flex-col bg-black"
            : "bg-[color:var(--layout-surface)]"
        }`}
      >
        <div
          className={`relative w-full bg-black ${
            isFullscreen
              ? "min-h-0 flex-1"
              : theaterMode
                ? "aspect-video max-h-[min(78vh,820px)]"
                : "aspect-video"
          }`}
        >
          {src ? (
            <video
              ref={videoRef}
              key={src}
              src={src}
              className="h-full w-full object-contain"
              playsInline
              onEnded={onEnded}
              onTimeUpdate={() => {
                const v = videoRef.current;
                if (!v) return;
                setProgress(v.currentTime);
                onTimeUpdate?.(v.currentTime, v.duration || duration);
              }}
              onLoadedMetadata={() => {
                const d = videoRef.current?.duration || 0;
                setDuration(d);
                onTimeUpdate?.(videoRef.current?.currentTime || 0, d);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onClick={togglePlay}
            />
          ) : (
            <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-[color:var(--layout-muted)]">
              No video available for this micro-lesson yet.
            </div>
          )}

          {/* Revision End-Card Overlay */}
          {showRevisionEndCard ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 p-4 text-center backdrop-blur-sm animate-in fade-in">
              <span className="mb-1 text-3xl">🎉</span>
              <h3 className="text-base font-bold text-white sm:text-lg">
                Lesson Video Finished!
              </h3>
              <p className="mt-1 mb-4 max-w-md text-xs text-[color:var(--layout-muted)]">
                You are in Exam Prep Mode. Re-watch key concepts, test your recall with the practice quiz, or continue to the next lesson.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowRevisionEndCard(false);
                    if (videoRef.current) {
                      videoRef.current.currentTime = 0;
                      void videoRef.current.play();
                      setPlaying(true);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-[color:var(--layout-border)] bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Replay Lesson
                </button>

                {quiz ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowRevisionEndCard(false);
                      setQuizOpen(true);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-[color:var(--layout-accent)]/50 bg-[color:var(--layout-accent)]/20 px-3.5 py-1.5 text-xs font-semibold text-[color:var(--layout-accent)] transition hover:bg-[color:var(--layout-accent)]/30"
                  >
                    <Award className="h-3.5 w-3.5" /> Practice Quiz ({quiz.item_pool?.length || 0} Qs)
                  </button>
                ) : null}

                {canGoNext ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowRevisionEndCard(false);
                      onNextLesson?.();
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-[color:var(--layout-accent)]/50 bg-[color:var(--layout-accent)]/20 px-3.5 py-1.5 text-xs font-semibold text-[color:var(--layout-accent)] transition hover:bg-[color:var(--layout-accent)]/30"
                  >
                    <span>Next Lesson</span> <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Chapter Marathon Autoplay Countdown */}
          {showMarathonCountdown ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 p-4 text-center backdrop-blur-sm animate-in fade-in">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-drona-amber/40 bg-drona-amber/20 text-drona-amber">
                <Zap className="h-6 w-6 fill-drona-amber" />
              </div>
              <h3 className="text-base font-bold text-white sm:text-lg">
                Chapter Marathon Active
              </h3>
              <p className="mt-1 text-xs text-[color:var(--layout-text)]/80">
                Autoplaying next micro-lesson in{" "}
                <span className="text-sm font-bold text-drona-amber">
                  {marathonTimer}s
                </span>
                ...
              </p>
              <div className="mt-4 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowMarathonCountdown(false);
                    onNextLesson?.();
                  }}
                  className="rounded-lg bg-drona-amber px-4 py-1.5 text-xs font-bold text-black transition hover:brightness-110"
                >
                  Play Next Now
                </button>
                <button
                  type="button"
                  onClick={() => setShowMarathonCountdown(false)}
                  className="rounded-lg border border-[color:var(--layout-border)] bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-[color:var(--layout-text)]/80 transition hover:bg-white/20"
                >
                  Pause Here
                </button>
              </div>
            </div>
          ) : null}

          {/* Quiz Overlay */}
          {quiz && quizOpen ? (
            <QuizOverlay
              open={quizOpen}
              quiz={quiz}
              seenItemIds={seenItemIds}
              alreadyMastered={isExamPrep ? false : (lessonMastered || passed)}
              isPracticeMode={isExamPrep}
              mode={mode}
              canGoNext={canGoNext}
              onNextLesson={() => {
                setQuizOpen(false);
                setControlsLocked(false);
                onNextLesson?.();
              }}
              onCloseReview={() => {
                setQuizOpen(false);
                setControlsLocked(false);
              }}
              onReviewVideo={(ts) => {
                const video = videoRef.current;
                if (!video) return;
                setControlsLocked(false);
                setQuizOpen(false);
                video.currentTime = Math.max(0, ts);
                void video.play();
                setPlaying(true);
              }}
              onComplete={(result) => {
                if (result.passed) {
                  setPassed(true);
                  if (!isExamPrep) setControlsLocked(true);
                }
                onQuizComplete(result);
              }}
            />
          ) : null}
        </div>

        {/* Video Player Controls & Timeline */}
        <div
          className={`space-y-2 border-t border-[color:var(--layout-border)] bg-[color:var(--layout-surface)] px-3 py-2.5 ${
            effectiveControlsLocked ? "pointer-events-none opacity-40" : ""
          }`}
        >
          {/* Timeline Seeker with Concept Bookmark Markers */}
          <div className="relative group w-full py-1">
            {duration > 0 && bookmarks && bookmarks.length > 0 ? (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex h-2 -translate-y-1/2">
                {bookmarks.map((bm, i) => {
                  const pct = Math.min(100, Math.max(0, (bm.timestamp / duration) * 100));
                  return (
                    <div
                      key={i}
                      className="group/pip pointer-events-auto absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                      style={{ left: `${pct}%` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        jumpToBookmark(bm.timestamp);
                      }}
                    >
                      <div className="h-3 w-1 rounded-full bg-drona-amber shadow-sm transition-all group-hover/pip:h-4 group-hover/pip:w-2 group-hover/pip:bg-[color:var(--layout-accent)]" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-md border border-[color:var(--layout-border)] bg-black/95 px-2.5 py-1 text-[11px] text-white shadow-xl group-hover/pip:flex">
                        <span className="font-semibold text-[color:var(--layout-accent)]">
                          {formatTime(bm.timestamp)}
                        </span>
                        <span className="text-white/90">{bm.title}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={progress}
              disabled={effectiveControlsLocked || !src}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (videoRef.current) {
                  videoRef.current.currentTime = next;
                  setProgress(next);
                  onTimeUpdate?.(next, duration);
                }
              }}
              className="relative z-0 w-full cursor-pointer accent-[color:var(--layout-accent)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => skip(-10)}
              className="rounded-lg p-2 text-[color:var(--layout-text)]/75 hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-accent)]"
              aria-label="Rewind 10 seconds"
              title="Rewind 10s"
            >
              <Rewind className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--layout-accent)] text-[color:var(--layout-accent-ink)] transition hover:brightness-110"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
            </button>

            <button
              type="button"
              onClick={() => skip(10)}
              className="rounded-lg p-2 text-[color:var(--layout-text)]/75 hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-accent)]"
              aria-label="Skip forward 10 seconds"
              title="Forward 10s"
            >
              <FastForward className="h-4 w-4" />
            </button>

            <span className="px-1 text-[11px] tabular-nums text-[color:var(--layout-muted)]">
              {formatTime(progress)} / {formatTime(duration)}
            </span>

            <div className="ml-auto flex items-center gap-1">
              {/* Playback speed control */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSpeedMenu((v) => !v)}
                  className="rounded-lg border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] px-2 py-1.5 text-[11px] font-semibold text-[color:var(--layout-text)]/80 hover:border-[color:var(--layout-accent)]/40 hover:text-[color:var(--layout-accent)]"
                  aria-label="Playback speed"
                >
                  {speed.toFixed(2).replace(/\.00$/, ".0")}x
                </button>
                {showSpeedMenu ? (
                  <div className="absolute bottom-full right-0 z-20 mb-1 min-w-[88px] overflow-hidden rounded-lg border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] shadow-xl">
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setPlaybackSpeed(rate)}
                        className={`block w-full px-3 py-1.5 text-left text-xs ${
                          speed === rate
                            ? "bg-[color:var(--layout-accent)]/20 text-[color:var(--layout-accent)]"
                            : "text-[color:var(--layout-text)]/80 hover:bg-[color:var(--layout-accent-soft)]"
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Mute toggle */}
              <button
                type="button"
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.muted = !muted;
                  setMuted(!muted);
                }}
                className="rounded-lg p-2 text-[color:var(--layout-text)]/75 hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-accent)]"
                aria-label={muted ? "Unmute" : "Mute"}
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4 text-drona-rose" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>

              {/* Theater Mode toggle */}
              {onTheaterModeChange ? (
                <button
                  type="button"
                  onClick={() => onTheaterModeChange(!theaterMode)}
                  className={`rounded-lg p-2 transition ${
                    theaterMode
                      ? "text-[color:var(--layout-accent)] hover:bg-[color:var(--layout-accent)]/10"
                      : "text-[color:var(--layout-text)]/75 hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-accent)]"
                  }`}
                  aria-label={theaterMode ? "Exit theater mode" : "Theater mode"}
                  title="Theater mode"
                >
                  <RectangleHorizontal className="h-4 w-4" />
                </button>
              ) : null}

              {/* Fullscreen toggle */}
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                className="rounded-lg p-2 text-[color:var(--layout-text)]/75 hover:bg-[color:var(--layout-accent-soft)] hover:text-[color:var(--layout-accent)]"
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                title="Fullscreen"
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Quick-Jump Concept Index Tray (Exam Revision Bookmarks) */}
        {bookmarks && bookmarks.length > 0 ? (
          <div className="border-t border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--layout-muted)]">
                <Bookmark className="h-3 w-3 text-[color:var(--layout-accent)]" />
                <span>Concept Index & Visual Moments</span>
              </div>
              <span className="text-[10px] text-[color:var(--layout-muted)]">Click any topic to jump</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {bookmarks.map((bm, i) => {
                const nextBm = bookmarks[i + 1];
                const end = bm.endTime || (nextBm ? nextBm.timestamp : duration);
                const isActive = progress >= bm.timestamp && progress < end;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => jumpToBookmark(bm.timestamp)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                      isActive
                        ? "border-[color:var(--layout-accent)]/60 bg-[color:var(--layout-accent)]/20 font-semibold text-[color:var(--layout-accent)] shadow-sm shadow-[color:var(--layout-accent)]/20"
                        : "border-[color:var(--layout-border)] bg-[color:var(--layout-surface)] text-[color:var(--layout-text)]/75 hover:border-[color:var(--layout-accent)]/40 hover:text-[color:var(--layout-text)]"
                    }`}
                  >
                    <span className="text-[10px] tabular-nums opacity-60">
                      {formatTime(bm.timestamp)}
                    </span>
                    <span className="max-w-[150px] truncate sm:max-w-[200px]">
                      {bm.title}
                    </span>
                    {bm.artifactId ? (
                      <span className="rounded bg-drona-amber/20 px-1 py-0.5 text-[9px] font-medium text-drona-amber">
                        Diagram
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Fallback button to launch quiz manually if desired */}
        {!src && quiz && !quizOpen ? (
          <div className="border-t border-[color:var(--layout-border)] px-4 py-3">
            <button
              type="button"
              onClick={() => {
                setControlsLocked(true);
                setQuizOpen(true);
              }}
              className="w-full rounded-xl border border-[color:var(--layout-accent)]/40 bg-[color:var(--layout-accent)]/10 px-4 py-3 text-sm font-semibold text-[color:var(--layout-accent)] transition hover:bg-[color:var(--layout-accent)]/20"
            >
              Start Exit Gate Quiz
            </button>
          </div>
        ) : null}

        {/* Next Micro-Lesson & Practice Action Bar */}
        {(passed || canGoNext || isExamPrep) && !quizOpen && !showRevisionEndCard ? (
          <div className="flex items-center gap-2 border-t border-[color:var(--layout-border)] bg-[color:var(--layout-surface)] px-4 py-2.5">
            {quiz ? (
              <button
                type="button"
                onClick={() => setQuizOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-drona-amber/40 bg-drona-amber/15 px-3.5 py-2 text-xs sm:text-sm font-semibold text-drona-amber transition hover:bg-drona-amber/25"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Practice Quiz ({quiz.item_pool?.length || 0} Qs)</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onNextLesson}
              disabled={!canGoNext}
              className="flex-1 rounded-xl bg-gradient-to-r from-[color:var(--layout-accent)] to-[color:var(--layout-accent)] px-4 py-2 text-xs sm:text-sm font-bold text-[color:var(--layout-accent-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Next Micro-Lesson ➔
            </button>
          </div>
        ) : null}
      </div>
    );
  }
);

export { VideoPlayer as DronaPlayer };
