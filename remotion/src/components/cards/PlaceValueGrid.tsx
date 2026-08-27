import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {motion} from 'framer-motion';
import {COLORS, PLACE_LABELS, clampLines, ellipsis} from '../../theme';
import {bodyFont, displayFont} from '../../fonts';
import {popAt, useFadeSlide} from '../../hooks/use-frame-motion';

const isDigitToken = (item: string | number): boolean => {
  if (typeof item === 'number') {
    return Number.isInteger(item) && item >= 0 && item <= 9;
  }
  return /^\d$/.test(item.trim());
};

const placeValueOf = (digit: number, fromRight: number): number =>
  digit * 10 ** fromRight;

export const PlaceValueGrid: React.FC<{
  title: string;
  items: Array<string | number>;
}> = ({title, items}) => {
  const heading = useFadeSlide(1, 16);
  const allDigits = items.length > 0 && items.every(isDigitToken);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        gap: 18,
      }}
    >
      <motion.h2
        initial={false}
        style={{
          margin: 0,
          fontFamily: displayFont,
          fontSize: 40,
          lineHeight: 1.1,
          color: COLORS.white,
          ...clampLines(2),
          opacity: heading.opacity,
          transform: `translateY(${heading.y}px)`,
        }}
      >
        {title}
      </motion.h2>
      {allDigits ? (
        <DigitPlaceGrid items={items} />
      ) : (
        <ValueChipGrid items={items} />
      )}
    </div>
  );
};

const DigitPlaceGrid: React.FC<{items: Array<string | number>}> = ({items}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const digits = items.map((item) => Number(item)).slice(-PLACE_LABELS.length);
  const labels = PLACE_LABELS.slice(0, digits.length).reverse();
  const total = digits.reduce(
    (sum, digit, index) => sum + placeValueOf(digit, digits.length - 1 - index),
    0,
  );
  const totalPop = popAt(frame, fps, 10 + digits.length * 5);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${digits.length}, minmax(0, 1fr))`,
          gap: 12,
        }}
      >
        {digits.map((digit, index) => {
          const fromRight = digits.length - 1 - index;
          const pop = popAt(frame, fps, 4 + index * 5);
          const accent = index % 2 === 0 ? COLORS.cyan : COLORS.amber;
          return (
            <motion.div
              key={`${labels[index]}-${digit}`}
              initial={false}
              style={{
                minWidth: 0,
                borderRadius: 20,
                border: `3px solid ${accent}`,
                background: COLORS.slateRaised,
                boxShadow: `0 0 18px ${accent}88`,
                padding: '14px 8px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                opacity: interpolate(pop, [0, 1], [0, 1], {
                  extrapolateRight: 'clamp',
                }),
                transform: `translateY(${interpolate(pop, [0, 1], [24, 0], {
                  extrapolateRight: 'clamp',
                })}px) scale(${interpolate(pop, [0, 1], [0.8, 1], {
                  extrapolateRight: 'clamp',
                })})`,
              }}
            >
              <span
                style={{
                  fontFamily: bodyFont,
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: accent,
                  maxWidth: '100%',
                  ...ellipsis,
                }}
              >
                {labels[index]}
              </span>
              <span
                style={{
                  fontFamily: displayFont,
                  fontSize: 72,
                  lineHeight: 1,
                  color: COLORS.white,
                }}
              >
                {digit}
              </span>
              <span
                style={{
                  fontFamily: bodyFont,
                  fontSize: 20,
                  fontWeight: 800,
                  color: COLORS.muted,
                  ...ellipsis,
                  maxWidth: '100%',
                }}
              >
                {placeValueOf(digit, fromRight).toLocaleString('en-IN')}
              </span>
            </motion.div>
          );
        })}
      </div>
      <motion.div
        initial={false}
        style={{
          marginTop: 'auto',
          borderRadius: 18,
          border: `2px solid ${COLORS.amber}`,
          background: COLORS.amberSoft,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          opacity: interpolate(totalPop, [0, 1], [0, 1], {
            extrapolateRight: 'clamp',
          }),
          transform: `scale(${interpolate(totalPop, [0, 1], [0.92, 1], {
            extrapolateRight: 'clamp',
          })})`,
        }}
      >
        <span
          style={{
            fontFamily: bodyFont,
            fontSize: 26,
            fontWeight: 800,
            color: COLORS.amber,
            ...ellipsis,
          }}
        >
          Total value
        </span>
        <span
          style={{
            fontFamily: displayFont,
            fontSize: 42,
            color: COLORS.white,
            ...ellipsis,
          }}
        >
          {total.toLocaleString('en-IN')}
        </span>
      </motion.div>
    </div>
  );
};

const ValueChipGrid: React.FC<{items: Array<string | number>}> = ({items}) => (
  <div
    style={{
      flex: 1,
      minHeight: 0,
      display: 'grid',
      gridTemplateColumns: items.length > 4 ? '1fr 1fr' : `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))`,
      gap: 14,
      alignContent: 'start',
    }}
  >
    {items.map((item, index) => (
      <ValueChip key={`${String(item)}-${index}`} value={String(item)} index={index} />
    ))}
  </div>
);

const ValueChip: React.FC<{value: string; index: number}> = ({value, index}) => {
  const motionValues = useFadeSlide(6 + index * 5, 22);
  const accent = index % 2 === 0 ? COLORS.cyan : COLORS.amber;
  return (
    <motion.div
      initial={false}
      style={{
        minWidth: 0,
        borderRadius: 18,
        border: `3px solid ${accent}`,
        background: COLORS.slateRaised,
        boxShadow: `0 0 16px ${accent}66`,
        padding: '20px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: motionValues.opacity,
        transform: `translateY(${motionValues.y}px) scale(${motionValues.scale})`,
      }}
    >
      <span
        style={{
          fontFamily: displayFont,
          fontSize: 36,
          color: COLORS.white,
          ...ellipsis,
          maxWidth: '100%',
        }}
      >
        {value}
      </span>
    </motion.div>
  );
};
