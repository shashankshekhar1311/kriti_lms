import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {motion} from 'framer-motion';
import {COLORS, clampLines, ellipsis} from '../../theme';
import {bodyFont, displayFont} from '../../fonts';
import {popAt, useFadeSlide} from '../../hooks/use-frame-motion';

export const WorkedExample: React.FC<{
  title: string;
  items: Array<string | number>;
}> = ({title, items}) => {
  const heading = useFadeSlide(1, 16);
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const steps = items.map((item) => String(item));
  const answerIndex = steps.length - 1;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        gap: 16,
      }}
    >
      <motion.h2
        initial={false}
        style={{
          margin: 0,
          fontFamily: displayFont,
          fontSize: 44,
          lineHeight: 1.1,
          color: COLORS.white,
          ...clampLines(2),
          opacity: heading.opacity,
          transform: `translateY(${heading.y}px)`,
        }}
      >
        {title}
      </motion.h2>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {steps.map((step, index) => {
          const pop = popAt(frame, fps, 6 + index * 7);
          const isAnswer = index === answerIndex && steps.length > 1;
          const accent = isAnswer ? COLORS.amber : COLORS.cyan;
          return (
            <motion.div
              key={`${step}-${index}`}
              initial={false}
              style={{
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px',
                borderRadius: 16,
                border: `2px solid ${accent}`,
                background: isAnswer ? COLORS.amberSoft : COLORS.cyanSoft,
                boxShadow: `0 0 14px ${accent}55`,
                opacity: interpolate(pop, [0, 1], [0, 1], {
                  extrapolateRight: 'clamp',
                }),
                transform: `translateX(${interpolate(pop, [0, 1], [36, 0], {
                  extrapolateRight: 'clamp',
                })}px)`,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: accent,
                  color: COLORS.ink,
                  fontFamily: displayFont,
                  fontSize: 22,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isAnswer ? '=' : index + 1}
              </span>
              <span
                style={{
                  fontFamily: bodyFont,
                  fontSize: 30,
                  fontWeight: 800,
                  color: COLORS.white,
                  minWidth: 0,
                  ...ellipsis,
                }}
              >
                {step}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
