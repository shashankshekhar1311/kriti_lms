import type {MascotPosition, VisualEventType} from './schema';
import {LAYOUT} from './theme';

export type CardBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const CARD_SIZE: Record<VisualEventType, {width: number; height: number}> = {
  intro: {width: 1040, height: 390},
  concept_card: {width: 940, height: 600},
  math_step: {width: 880, height: 640},
  summary_badge: {width: 720, height: 720},
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const placeFloatingCard = (
  type: VisualEventType,
  mascot: MascotPosition,
  cardPosition?: {x: number; y: number} | null,
): CardBox => {
  const size = CARD_SIZE[type];
  const pad = 36;

  if (cardPosition) {
    return {
      left: clamp(cardPosition.x - size.width / 2, pad, LAYOUT.width - pad - size.width),
      top: clamp(cardPosition.y - size.height / 2, 96, LAYOUT.height - size.height - pad),
      ...size,
    };
  }

  const mascotW = LAYOUT.mascotBaseWidth * mascot.scale;
  const mascotRight = mascot.x + mascotW / 2;
  const mascotLeft = mascot.x - mascotW / 2;

  if (type === 'intro') {
    return {
      left: (LAYOUT.width - size.width) / 2,
      top: 56,
      ...size,
    };
  }

  const roomRight = LAYOUT.width - pad - mascotRight;
  const roomLeft = mascotLeft - pad;
  const placeRight = roomRight >= roomLeft;
  const left = placeRight
    ? clamp(mascotRight + 32, pad, LAYOUT.width - pad - size.width)
    : clamp(mascotLeft - 32 - size.width, pad, LAYOUT.width - pad - size.width);
  const top = clamp(
    mascot.y - size.height * 0.58,
    96,
    LAYOUT.height - size.height - pad,
  );

  return {left, top, ...size};
};

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
