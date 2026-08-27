import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

type SpringConfig = {
  damping?: number;
  stiffness?: number;
  mass?: number;
};

export const useEnterProgress = (
  delayFrames = 0,
  config: SpringConfig = {damping: 16, stiffness: 140, mass: 0.55},
): number => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({
    frame: Math.max(0, frame - delayFrames),
    fps,
    config,
  });
};

export const useFadeSlide = (delayFrames = 0, distance = 28) => {
  const enter = useEnterProgress(delayFrames);
  const opacity = interpolate(enter, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(enter, [0, 1], [distance, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(enter, [0, 1], [0.92, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return {enter, opacity, y, scale};
};

export const popAt = (frame: number, fps: number, startFrame: number): number =>
  spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: {damping: 12, stiffness: 160, mass: 0.45},
  });
