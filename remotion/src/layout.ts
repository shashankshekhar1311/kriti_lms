import type {CSSProperties} from 'react';
import type {MascotPosition, VisualEventType} from './schema';
import {LAYOUT} from './theme';

/** Bottom-right mascot video panel */
export const MASCOT_PANEL = {
  right: 80,
  bottom: 40,
  width: 480,
  height: 540,
  zIndex: 20,
  borderRadius: 24,
  boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
} as const;

/** Left-side educational cards */
export const CARDS_ZONE = {
  left: 80,
  top: 140,
  width: 1100,
  height: LAYOUT.height - 140 - 48,
  zIndex: 10,
} as const;

export const GLASS_CARD = {
  background: 'rgba(30, 41, 59, 0.75)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 24,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
} as const;

export type CardBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const CARD_SIZE: Record<VisualEventType, {width: number; height: number}> = {
  intro: {width: CARDS_ZONE.width, height: 380},
  concept_card: {width: CARDS_ZONE.width, height: 620},
  math_step: {width: CARDS_ZONE.width, height: 680},
  summary_badge: {width: CARDS_ZONE.width, height: 720},
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Cards live in the left zone; coordinates are local to CARDS_ZONE. */
export const placeFloatingCard = (
  type: VisualEventType,
  _mascot?: MascotPosition | null,
  _cardPosition?: {x: number; y: number} | null,
): CardBox => {
  const preferred = CARD_SIZE[type];
  const width = Math.min(preferred.width, CARDS_ZONE.width);
  const height = Math.min(preferred.height, CARDS_ZONE.height);
  const pad = 8;

  return {
    left: 0,
    top: clamp(
      type === 'intro' ? 0 : (CARDS_ZONE.height - height) / 2,
      pad,
      CARDS_ZONE.height - height - pad,
    ),
    width,
    height,
  };
};

export const mascotPanelStyle: CSSProperties = {
  position: 'absolute',
  right: MASCOT_PANEL.right,
  bottom: MASCOT_PANEL.bottom,
  width: MASCOT_PANEL.width,
  height: MASCOT_PANEL.height,
  zIndex: MASCOT_PANEL.zIndex,
  borderRadius: MASCOT_PANEL.borderRadius,
  boxShadow: MASCOT_PANEL.boxShadow,
  overflow: 'hidden',
  background: 'transparent',
  pointerEvents: 'none',
};

export const cardsZoneStyle: CSSProperties = {
  position: 'absolute',
  left: CARDS_ZONE.left,
  top: CARDS_ZONE.top,
  width: CARDS_ZONE.width,
  height: CARDS_ZONE.height,
  zIndex: CARDS_ZONE.zIndex,
  overflow: 'hidden',
  pointerEvents: 'none',
  boxSizing: 'border-box',
};

/** @deprecated Timing helper — free-canvas mascot box. */
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
