import type {ReactNode} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {COLORS} from '../theme';
import {bodyFont, displayFont} from '../fonts';
import {ellipsis} from '../theme';

/** Minimal stage chrome — background is supplied by DynamicBackground in ComicLesson. */
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
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
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
