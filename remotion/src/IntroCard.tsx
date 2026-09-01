import {motion} from 'framer-motion';
import {COLORS, clampLines} from '../../theme';
import {bodyFont, displayFont} from '../../fonts';
import {useFadeSlide} from '../../hooks/use-frame-motion';

const toText = (item: string | number): string => String(item);

export const IntroCard: React.FC<{
  title: string;
  items: Array<string | number>;
  /**
   * CHANGED: new, optional. When provided (FloatingMathCard now passes the
   * beat's actual on-screen duration), bullets stagger their reveal across
   * roughly the whole beat instead of all popping in within the first
   * second. Falls back to the old fixed stride if omitted, so this is not
   * a breaking change for any other caller.
   */
  durationInFrames?: number;
}> = ({title, items, durationInFrames}) => {
  const heading = useFadeSlide(2, 20);

  // Spread bullets across the beat: leave ~8 frames before the first one
  // and ~20 frames of breathing room at the end so the last bullet isn't
  // still animating in right as the card starts exiting.
  const perItemStride = durationInFrames
    ? Math.max(6, Math.round((durationInFrames - 28) / Math.max(1, items.length)))
    : 6;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        gap: 22,
      }}
    >
      <motion.h2
        initial={false}
        style={{
          margin: 0,
          fontFamily: displayFont,
          fontSize: 54,
          lineHeight: 1.08,
          color: COLORS.white,
          fontWeight: 700,
          ...clampLines(2),
          opacity: heading.opacity,
          transform: `translateY(${heading.y}px)`,
        }}
      >
        {title}
      </motion.h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: items.length > 3 ? '1fr 1fr' : '1fr',
          gap: 16,
          minHeight: 0,
          flex: 1,
          alignContent: 'start',
        }}
      >
        {items.map((item, index) => (
          <IntroChip
            key={`${toText(item)}-${index}`}
            text={toText(item)}
            index={index}
            delayFrames={8 + index * perItemStride}
          />
        ))}
      </div>
    </div>
  );
};

const IntroChip: React.FC<{text: string; index: number; delayFrames: number}> = ({
  text,
  index,
  delayFrames,
}) => {
  const motionValues = useFadeSlide(delayFrames, 30);
  return (
    <motion.div
      initial={false}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        minWidth: 0,
        padding: '18px 22px',
        borderRadius: 20,
        border: `2px solid ${index % 2 === 0 ? COLORS.cyan : COLORS.amber}`,
        background: index % 2 === 0 ? COLORS.cyanSoft : COLORS.amberSoft,
        boxShadow:
          index % 2 === 0
            ? `0 0 16px ${COLORS.cyanGlow}`
            : `0 0 16px ${COLORS.amberGlow}`,
        opacity: motionValues.opacity,
        transform: `translateY(${motionValues.y}px) scale(${motionValues.scale})`,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 46,
          height: 46,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: displayFont,
          fontSize: 26,
          fontWeight: 700,
          color: COLORS.ink,
          background: index % 2 === 0 ? COLORS.cyan : COLORS.amber,
        }}
      >
        {index + 1}
      </span>
      {/*
        CHANGED: this used to be a single-line span with the `ellipsis`
        style, which is exactly what produced strings like
        "Warfare: mili..." cut off mid-word. It now wraps to up to 2 lines
        instead of hard-truncating. Chapter_Agent.py's prompt has also been
        updated to cap item length so wrapping should rarely even be needed
        going forward — this is the safety net for whatever still comes
        through long.
      */}
      <span
        style={{
          fontFamily: bodyFont,
          fontSize: 30,
          fontWeight: 800,
          color: COLORS.white,
          minWidth: 0,
          ...clampLines(2),
        }}
      >
        {text}
      </span>
    </motion.div>
  );
};
