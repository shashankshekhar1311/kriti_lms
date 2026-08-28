import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {motion} from 'framer-motion';
import type {VisualEvent} from '../schema';
import {COLORS, clampLines, ellipsis} from '../theme';
import {bodyFont, displayFont} from '../fonts';
import {useFadeSlide, popAt} from '../hooks/use-frame-motion';
import {CARDS_ZONE, GLASS_CARD, placeFloatingCard} from '../layout';
import {IntroCard} from './cards/IntroCard';
import {PlaceValueGrid} from './cards/PlaceValueGrid';
import {WorkedExample} from './cards/WorkedExample';

export const FloatingMathCard: React.FC<{
  event: VisualEvent;
  studentName: string;
  durationInFrames: number;
}> = ({event, studentName, durationInFrames}) => {
  const frame = useCurrentFrame();
  const box = placeFloatingCard(event.type, event.mascot_position, event.card_position);
  const enter = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(
    frame,
    [Math.max(12, durationInFrames - 10), durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const appear = enter * exit;

  return (
    <motion.div
      initial={false}
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        maxWidth: '100%',
        height: box.height,
        maxHeight: CARDS_ZONE.height,
        zIndex: 5,
        opacity: appear,
        transform: `translateY(${(1 - appear) * 28}px) scale(${0.96 + appear * 0.04})`,
        pointerEvents: 'none',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          height: '100%',
          boxSizing: 'border-box',
          borderRadius: GLASS_CARD.borderRadius,
          border: GLASS_CARD.border,
          background: GLASS_CARD.background,
          backdropFilter: GLASS_CARD.backdropFilter,
          WebkitBackdropFilter: GLASS_CARD.WebkitBackdropFilter,
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
          padding: event.type === 'summary_badge' ? '28px 28px 22px' : '22px 24px 20px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {event.type === 'intro' ? (
          <IntroCard title={event.title} items={event.items} />
        ) : null}
        {event.type === 'concept_card' ? (
          <PlaceValueGrid title={event.title} items={event.items} />
        ) : null}
        {event.type === 'math_step' ? (
          <WorkedExample title={event.title} items={event.items} />
        ) : null}
        {event.type === 'summary_badge' ? (
          <SummaryContent
            title={event.title}
            items={event.items}
            studentName={studentName}
          />
        ) : null}
      </div>
    </motion.div>
  );
};

const SummaryContent: React.FC<{
  title: string;
  items: Array<string | number>;
  studentName: string;
}> = ({title, items, studentName}) => {
  const heading = useFadeSlide(2, 16);
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const glow = interpolate(Math.sin(frame / 8), [-1, 1], [0.45, 1]);
  const badgePop = popAt(frame, fps, 3);

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        minHeight: 0,
        minWidth: 0,
        boxSizing: 'border-box',
      }}
    >
      <motion.div
        initial={false}
        style={{
          width: 132,
          height: 132,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `3px solid ${COLORS.amber}`,
          background: `radial-gradient(circle at 50% 40%, #FDE68A 0%, ${COLORS.amber} 42%, #B45309 100%)`,
          boxShadow: `0 0 ${16 + glow * 22}px ${COLORS.amberGlow}`,
          transform: `scale(${interpolate(badgePop, [0, 1], [0.55, 1], {
            extrapolateRight: 'clamp',
          })})`,
        }}
      >
        <TrophyStar />
      </motion.div>
      <motion.h2
        initial={false}
        style={{
          margin: 0,
          fontFamily: displayFont,
          fontSize: 42,
          color: COLORS.white,
          textAlign: 'center',
          maxWidth: '100%',
          ...clampLines(2),
          opacity: heading.opacity,
        }}
      >
        {title}
      </motion.h2>
      <p
        style={{
          margin: 0,
          fontFamily: bodyFont,
          fontSize: 22,
          fontWeight: 800,
          color: COLORS.cyan,
          ...ellipsis,
          maxWidth: '100%',
        }}
      >
        Trophy unlocked, {studentName}!
      </p>
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 0,
          flex: 1,
        }}
      >
        {items.map((item, index) => (
          <div
            key={`${String(item)}-${index}`}
            style={{
              minWidth: 0,
              maxWidth: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 14,
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(6, 182, 212, 0.12)',
              boxSizing: 'border-box',
            }}
          >
            <span style={{flexShrink: 0}}>★</span>
            <span
              style={{
                fontFamily: bodyFont,
                fontSize: 24,
                fontWeight: 800,
                color: COLORS.white,
                minWidth: 0,
                ...ellipsis,
              }}
            >
              {String(item)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TrophyStar: React.FC = () => (
  <svg viewBox="0 0 120 120" width="88" height="88" aria-hidden>
    <path
      d="M34 18h52v18c0 14-11 26-26 26S34 50 34 36V18z"
      fill="#F8FAFC"
      stroke="#0F172A"
      strokeWidth="4"
    />
    <path d="M34 24c-12 2-20 12-20 22 0 8 6 14 16 16" fill="none" stroke="#0F172A" strokeWidth="4" />
    <path d="M86 24c12 2 20 12 20 22 0 8-6 14-16 16" fill="none" stroke="#0F172A" strokeWidth="4" />
    <rect x="50" y="60" width="20" height="14" rx="3" fill="#0F172A" />
    <rect x="38" y="86" width="44" height="12" rx="6" fill="#0F172A" />
    <polygon
      points="60,4 66,18 82,18 70,28 74,44 60,34 46,44 50,28 38,18 54,18"
      fill="#FDE68A"
      stroke="#0F172A"
      strokeWidth="3"
    />
  </svg>
);
