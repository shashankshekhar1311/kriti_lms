import type {CSSProperties} from 'react';

export const COLORS = {
  slate: '#0F172A',
  slateRaised: '#1E293B',
  slatePanel: '#111C33',
  cyan: '#06B6D4',
  cyanSoft: 'rgba(6, 182, 212, 0.18)',
  cyanGlow: 'rgba(6, 182, 212, 0.55)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.18)',
  amberGlow: 'rgba(245, 158, 11, 0.55)',
  pink: '#EC4899',
  emerald: '#10B981',
  white: '#F8FAFC',
  muted: '#94A3B8',
  ink: '#020617',
} as const;

export const NEON = {
  cyanBorder: `3px solid ${COLORS.cyan}`,
  amberBorder: `3px solid ${COLORS.amber}`,
  cyanShadow: `0 0 10px ${COLORS.cyanGlow}, 0 0 28px rgba(6, 182, 212, 0.25), inset 0 0 18px rgba(6, 182, 212, 0.08)`,
  amberShadow: `0 0 10px ${COLORS.amberGlow}, 0 0 28px rgba(245, 158, 11, 0.25), inset 0 0 18px rgba(245, 158, 11, 0.08)`,
} as const;

export const LAYOUT = {
  width: 1920,
  height: 1080,
  fps: 30,
  gutter: 24,
  radius: 28,
  mascotBaseWidth: 360,
  mascotBaseHeight: 480,
} as const;

export const PLACE_LABELS = [
  'Ones',
  'Tens',
  'Hundreds',
  'Thousands',
  'Ten Thousands',
  'Lakhs',
  'Ten Lakhs',
  'Crores',
] as const;

export const ellipsis: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const clampLines = (lines: number): CSSProperties => ({
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: lines,
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
});
