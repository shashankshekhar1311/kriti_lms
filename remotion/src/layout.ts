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
  /**
   * CHANGED: this used to be a forced `height` that every card was stretched
   * (or, more often, left mostly empty inside) to fill regardless of how
   * much content it actually had — e.g. a 3-bullet intro card in a 620px-tall
   * box left ~400px of dead space below the last bullet. It's now a ceiling
   * (`maxHeight`) the card is allowed to grow up to; actual rendered height
   * comes from its content via CSS (see FloatingMathCard.tsx), and long
   * cards (like the 5-step summary badge) still can't blow past the
   * CARDS_ZONE bounds.
   */
  maxHeight: number;
};

// CHANGED: renamed conceptually from "the height this card IS" to
// "the tallest this card type is ALLOWED to get" — see CardBox.maxHeight.
export const CARD_MAX_HEIGHT: Record<VisualEventType, number> = {
  intro: 380,
  concept_card: 620,
  math_step: 680,
  summary_badge: 720,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Cards live in the left zone; coordinates are local to CARDS_ZONE.
 * CHANGED: cards other than `intro` used to be vertically centered based on
 * their *forced* fixed height, which is exactly what produced the visible
 * empty space under short content — a short card would still claim, say,
 * 620px of vertical room and get centered within that claim. Now that cards
 * size to content, they anchor near the top of the zone (a fixed, modest
 * offset) so a 2-bullet card and a 5-bullet card both start reading from
 * roughly the same place instead of jumping to different vertical centers.
 */
export const placeFloatingCard = (
  type: VisualEventType,
  _mascot?: MascotPosition | null,
  _cardPosition?: {x: number; y: number} | null,
): CardBox => {
  const maxHeight = Math.min(CARD_MAX_HEIGHT[type], CARDS_ZONE.height);
  const width = Math.min(CARDS_ZONE.width, CARDS_ZONE.width);
  const topOffset = type === 'intro' ? 0 : 48;
  const pad = 8;

  return {
    left: 0,
    top: clamp(topOffset, pad, CARDS_ZONE.height - pad),
    width,
    maxHeight,
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
