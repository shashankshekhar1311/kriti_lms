import type {CSSProperties} from 'react';
import type {MascotPosition, VisualEventType} from './schema';
import {LAYOUT} from './theme';

/** Strict 2-zone layout — mascot never shares x-space with math cards. */
export const MASCOT_ZONE = {
  left: 60,
  bottom: 60,
  width: 440,
  /** Keep zone under the top banner (banner lives ~top: 28–100). */
  top: 120,
  zIndex: 20,
} as const;

export const CONTENT_ZONE = {
  left: 540,
  top: 130,
  width: 1320,
  height: 880,
  zIndex: 10,
} as const;

export const SPEECH_BUBBLE = {
  left: 0,
  bottom: 460,
  maxWidth: 420,
  zIndex: 30,
  /** Absolute canvas Y — bubbles must not climb into the title banner. */
  minCanvasTop: 120,
} as const;

export type CardBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const CARD_SIZE: Record<VisualEventType, {width: number; height: number}> = {
  intro: {width: 1120, height: 420},
  concept_card: {width: 1180, height: 640},
  math_step: {width: 1100, height: 700},
  summary_badge: {width: 760, height: 760},
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Place cards in Content Zone local coordinates (0,0 = zone top-left).
 * Bounding-box guard: never wider than 100% of the Content Zone.
 */
export const placeFloatingCard = (
  type: VisualEventType,
  _mascot?: MascotPosition | null,
  cardPosition?: {x: number; y: number} | null,
): CardBox => {
  const preferred = CARD_SIZE[type];
  const width = Math.min(preferred.width, CONTENT_ZONE.width);
  const height = Math.min(preferred.height, CONTENT_ZONE.height);
  const pad = 12;

  if (cardPosition) {
    // card_position is canvas-absolute; convert into Content Zone local space.
    const localX = cardPosition.x - CONTENT_ZONE.left;
    const localY = cardPosition.y - CONTENT_ZONE.top;
    return {
      left: clamp(localX - width / 2, 0, CONTENT_ZONE.width - width),
      top: clamp(localY - height / 2, 0, CONTENT_ZONE.height - height),
      width,
      height,
    };
  }

  return {
    left: clamp((CONTENT_ZONE.width - width) / 2, 0, CONTENT_ZONE.width - width),
    top: clamp(
      type === 'intro' ? 24 : (CONTENT_ZONE.height - height) / 2,
      pad,
      CONTENT_ZONE.height - height - pad,
    ),
    width,
    height,
  };
};

export const mascotZoneStyle: CSSProperties = {
  position: 'absolute',
  left: MASCOT_ZONE.left,
  bottom: MASCOT_ZONE.bottom,
  top: MASCOT_ZONE.top,
  width: MASCOT_ZONE.width,
  zIndex: MASCOT_ZONE.zIndex,
  background: 'transparent',
  overflow: 'visible',
  pointerEvents: 'none',
};

export const contentZoneStyle: CSSProperties = {
  position: 'absolute',
  left: CONTENT_ZONE.left,
  top: CONTENT_ZONE.top,
  width: CONTENT_ZONE.width,
  height: CONTENT_ZONE.height,
  zIndex: CONTENT_ZONE.zIndex,
  overflow: 'hidden',
  pointerEvents: 'none',
  maxWidth: CONTENT_ZONE.width,
  boxSizing: 'border-box',
};

/** @deprecated Free-canvas mascot box — kept for timing helpers only. */
export const mascotBox = (pose: MascotPosition) => {
  const width = LAYOUT.mascotBaseWidth * pose.scale;
  const height = LAYOUT.mascotBaseHeight * pose.scale;
  return {
    width,
    height,
    left: pose.x - width / 2,
    top: pose.y - height / 2,
    headX: pose.x,
    headY: pose.y - height * 0.42,
  };
};
