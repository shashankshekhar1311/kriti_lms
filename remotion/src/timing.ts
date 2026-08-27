import {Easing, interpolate} from 'remotion';
import {LAYOUT} from './theme';
import type {MascotPosition, NarrationLine, VisualEvent} from './schema';

export const secondsToFrames = (seconds: number, fps: number = LAYOUT.fps): number =>
  Math.max(0, Math.round(seconds * fps));

export const getLessonDurationSeconds = (
  timeline: NarrationLine[],
  events: VisualEvent[],
): number => {
  const ends = [
    ...timeline.map((line) => line.end_time),
    ...events.map((event) => event.end_time),
  ];
  const spoken = ends.length > 0 ? Math.max(...ends) : 0;
  return spoken > 0 ? spoken : 8;
};

export const getDurationInFrames = (
  timeline: NarrationLine[],
  events: VisualEvent[],
  fps: number = LAYOUT.fps,
): number => {
  const tailPad = 0.4;
  return Math.max(
    fps,
    secondsToFrames(getLessonDurationSeconds(timeline, events) + tailPad, fps),
  );
};

export const eventWindow = (event: VisualEvent, fps: number = LAYOUT.fps) => {
  const from = secondsToFrames(event.start_time, fps);
  const to = secondsToFrames(event.end_time, fps);
  return {
    from,
    durationInFrames: Math.max(1, to - from),
  };
};

export const activeNarrationText = (
  timeSeconds: number,
  timeline: NarrationLine[],
): string => {
  if (timeline.length === 0) {
    return '';
  }
  const hit = timeline.find((line, index) => {
    const last = index === timeline.length - 1;
    return (
      timeSeconds >= line.start_time &&
      (last ? timeSeconds <= line.end_time : timeSeconds < line.end_time)
    );
  });
  return hit?.text ?? '';
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const interpolateMascotPose = (
  timeSeconds: number,
  events: VisualEvent[],
): MascotPosition => {
  const sorted = [...events].sort((a, b) => a.start_time - b.start_time);
  if (sorted.length === 0) {
    return {x: LAYOUT.width / 2, y: 720, scale: 1};
  }
  if (timeSeconds <= sorted[0].start_time || sorted.length === 1) {
    return sorted[0].mascot_position;
  }
  const last = sorted[sorted.length - 1];
  if (timeSeconds >= last.start_time) {
    return last.mascot_position;
  }

  let index = 0;
  while (
    index < sorted.length - 1 &&
    timeSeconds >= sorted[index + 1].start_time
  ) {
    index += 1;
  }
  const from = sorted[index];
  const to = sorted[index + 1];
  const t = interpolate(timeSeconds, [from.start_time, to.start_time], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return {
    x: lerp(from.mascot_position.x, to.mascot_position.x, t),
    y: lerp(from.mascot_position.y, to.mascot_position.y, t),
    scale: lerp(from.mascot_position.scale, to.mascot_position.scale, t),
  };
};

export const mascotTravelAmount = (
  timeSeconds: number,
  events: VisualEvent[],
): number => {
  const sorted = [...events].sort((a, b) => a.start_time - b.start_time);
  if (sorted.length < 2) {
    return 0;
  }
  let index = 0;
  while (
    index < sorted.length - 1 &&
    timeSeconds >= sorted[index + 1].start_time
  ) {
    index += 1;
  }
  if (index >= sorted.length - 1) {
    return 0;
  }
  const from = sorted[index];
  const to = sorted[index + 1];
  const span = Math.max(0.001, to.start_time - from.start_time);
  const local = (timeSeconds - from.start_time) / span;
  if (local <= 0.04 || local >= 0.96) {
    return 0;
  }
  const dx = to.mascot_position.x - from.mascot_position.x;
  const dy = to.mascot_position.y - from.mascot_position.y;
  return Math.min(1, Math.hypot(dx, dy) / 900);
};
