import {Img, interpolate, useCurrentFrame} from 'remotion';
import {motion} from 'framer-motion';
import type {VisualEvent} from '../schema';
import {COLORS, clampLines} from '../theme';
import {bodyFont, displayFont} from '../fonts';
import {GLASS_CARD} from '../layout';
import {resolveImageSrc} from '../media';

export const eventShowsArtifact = (event: VisualEvent): boolean =>
  Boolean(event.artifact_image_url?.trim());

export const ArtifactPanel: React.FC<{
  event: VisualEvent;
  durationInFrames: number;
}> = ({event, durationInFrames}) => {
  const frame = useCurrentFrame();
  const src = resolveImageSrc(event.artifact_image_url ?? '');

  const enter = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(
    frame,
    [Math.max(14, durationInFrames - 10), durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const appear = enter * exit;

  if (!src) {
    return null;
  }

  const caption = event.artifact_caption?.trim();
  const source = event.artifact_source?.trim();

  return (
    <motion.div
      initial={false}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: appear,
        transform: `translateX(${(1 - appear) * 32}px) scale(${0.94 + appear * 0.06})`,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: GLASS_CARD.borderRadius,
          border: `2px solid ${COLORS.cyan}`,
          background: 'rgba(15, 23, 42, 0.82)',
          backdropFilter: GLASS_CARD.backdropFilter,
          WebkitBackdropFilter: GLASS_CARD.WebkitBackdropFilter,
          boxShadow: `0 0 24px ${COLORS.cyanGlow}`,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: bodyFont,
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: COLORS.cyan,
          }}
        >
          Textbook reference
        </span>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 16,
            background: 'rgba(248, 250, 252, 0.96)',
            padding: 12,
            overflow: 'hidden',
          }}
        >
          <Img
            src={src}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
            }}
          />
        </div>
        {caption ? (
          <p
            style={{
              margin: 0,
              fontFamily: displayFont,
              fontSize: 22,
              lineHeight: 1.2,
              color: COLORS.white,
              ...clampLines(2),
            }}
          >
            {caption}
          </p>
        ) : null}
        {source ? (
          <p
            style={{
              margin: 0,
              fontFamily: bodyFont,
              fontSize: 16,
              fontWeight: 700,
              color: COLORS.muted,
              ...clampLines(1),
            }}
          >
            {source}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
};
