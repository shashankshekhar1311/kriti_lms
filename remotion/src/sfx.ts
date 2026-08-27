import {getStaticFiles, staticFile} from 'remotion';

/** Relative paths under remotion/public/sfx/ */
export const SFX_FILES = {
  pop: 'sfx/pop.mp3',
  swoosh: 'sfx/swoosh.mp3',
  chime: 'sfx/chime.mp3',
} as const;

export type SfxId = keyof typeof SFX_FILES;

const sfxExistsInPublic = (relativePath: string): boolean => {
  try {
    const normalized = relativePath.replace(/^public\//, '').replace(/^\/+/, '');
    return getStaticFiles().some((file) => {
      const name = file.name.replace(/\\/g, '/');
      return name === normalized || name.endsWith(`/${normalized}`);
    });
  } catch {
    return false;
  }
};

/**
 * Resolve a public SFX asset for Remotion <Audio />.
 * Returns null when the file is missing so render can skip it.
 */
export const resolveSfxSrc = (id: SfxId): string | null => {
  const relative = SFX_FILES[id];
  if (!sfxExistsInPublic(relative)) {
    return null;
  }
  return staticFile(relative);
};

/** Narration (mascot / VO) stays full level. */
export const NARRATION_VOLUME = 1;

/** All UI SFX sit under narration so speech stays clear. */
export const SFX_VOLUME = 0.28;

/** Clip window for one-shot SFX (1 second @ 30fps). */
export const SFX_CLIP_FRAMES = 30;

/** Ignore micro-moves when deciding if a swoosh should fire. */
export const MASCOT_MOVE_THRESHOLD_PX = 48;
