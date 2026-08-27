import type {ReactNode} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {COLORS} from '../theme';
import {bodyFont, displayFont} from '../fonts';
import {ellipsis} from '../theme';
import {AmbientBackground} from './AmbientBackground';

export const FullCanvasStage: React.FC<{
  lessonTitle: string;
  studentName: string;
  children: ReactNode;
}> = ({lessonTitle, studentName, children}) => {
  const frame = useCurrentFrame();
  const titleIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.slate,
        fontFamily: bodyFont,
        color: COLORS.white,
        overflow: 'hidden',
      }}
    >
      <AmbientBackground />

      <div
        style={{
          position: 'absolute',
          left: -80,
          bottom: -220,
          width: 2080,
          height: 460,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(30, 41, 59, 0.95), rgba(2, 6, 23, 0.2) 72%)',
          boxShadow: '0 -24px 80px rgba(6, 182, 212, 0.08)',
          willChange: 'transform',
          transform: 'translate3d(0, 0, 0)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 120,
          bottom: 70,
          width: 1680,
          height: 18,
          borderRadius: 999,
          background: 'rgba(6, 182, 212, 0.12)',
          filter: 'blur(1px)',
          willChange: 'transform',
          transform: 'translate3d(0, 0, 0)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 28,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * -12}px)`,
          zIndex: 4,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            padding: '10px 28px',
            borderRadius: 999,
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            boxShadow: '0 0 18px rgba(245, 158, 11, 0.18)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 16,
          }}
        >
          <span
            style={{
              fontFamily: displayFont,
              fontSize: 32,
              color: COLORS.white,
              ...ellipsis,
              maxWidth: 820,
            }}
          >
            {lessonTitle}
          </span>
          <span
            style={{
              fontFamily: bodyFont,
              fontSize: 18,
              fontWeight: 800,
              color: COLORS.cyan,
              whiteSpace: 'nowrap',
            }}
          >
            with {studentName}
          </span>
        </div>
      </div>

      <AbsoluteFill style={{zIndex: 2}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
