import {staticFile} from 'remotion';

/** Relative paths under remotion/public/sfx/ */
export const SFX_FILES = {
  pop: 'sfx/pop.mp3',
  swoosh: 'sfx/swoosh.mp3',
  chime: 'sfx/chime.mp3',
} as const;

export type SfxId = keyof typeof SFX_FILES;

/**
 * Resolve a public SFX asset for Remotion <Audio />.
 * Keep narration / mascot video at volume 1.0; duck SFX to ~28%.
 */
export const SFX = {
  pop: staticFile(SFX_FILES.pop),
  swoosh: staticFile(SFX_FILES.swoosh),
  chime: staticFile(SFX_FILES.chime),
} as const;

/** Narration (mascot / VO) stays full level. */
export const NARRATION_VOLUME = 1;

/** All UI SFX sit under narration so speech stays clear. */
export const SFX_VOLUME = 0.28;

/** Clip window for one-shot SFX (1 second @ 30fps). */
export const SFX_CLIP_FRAMES = 30;

/** Ignore micro-moves when deciding if a swoosh should fire. */
export const MASCOT_MOVE_THRESHOLD_PX = 48;
