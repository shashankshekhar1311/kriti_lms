import {motion} from 'framer-motion';
import {COLORS, clampLines} from '../theme';
import {bodyFont} from '../fonts';
import {MASCOT_ZONE, SPEECH_BUBBLE} from '../layout';

/**
 * Speech bubble lives strictly inside the Mascot Zone, above the character.
 * Clamped so it never climbs into the top banner (canvas top < 120px).
 */
export const WorldSpeechBubble: React.FC<{
  text: string;
  opacity?: number;
}> = ({text, opacity = 1}) => {
  if (!text) {
    return null;
  }

  // Zone top is MASCOT_ZONE.top (120). Bubble at bottom:460 within the zone
  // sits safely under the banner; maxHeight caps tall copy.
  const zoneHeight = 1080 - MASCOT_ZONE.bottom - MASCOT_ZONE.top;
  const maxBubbleHeight = Math.max(
    96,
    zoneHeight - SPEECH_BUBBLE.bottom - 8,
  );

  return (
    <motion.div
      initial={false}
      style={{
        position: 'absolute',
        left: SPEECH_BUBBLE.left,
        bottom: SPEECH_BUBBLE.bottom,
        maxWidth: SPEECH_BUBBLE.maxWidth,
        width: '100%',
        maxHeight: maxBubbleHeight,
        zIndex: SPEECH_BUBBLE.zIndex,
        opacity,
        transform: `translateY(${(1 - opacity) * 10}px) scale(${0.96 + opacity * 0.04})`,
        pointerEvents: 'none',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'relative',
          padding: '14px 18px 20px',
          borderRadius: 22,
          background: COLORS.white,
          color: COLORS.ink,
          boxShadow: `0 10px 28px rgba(2, 6, 23, 0.35), 0 0 0 3px ${COLORS.cyan}`,
          maxHeight: maxBubbleHeight,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: bodyFont,
            fontSize: 24,
            fontWeight: 800,
            lineHeight: 1.25,
            color: COLORS.ink,
            ...clampLines(4),
          }}
        >
          {text}
        </p>
        <div
          style={{
            position: 'absolute',
            left: 56,
            bottom: -14,
            width: 0,
            height: 0,
            borderLeft: '14px solid transparent',
            borderRight: '14px solid transparent',
            borderTop: `14px solid ${COLORS.white}`,
            filter: `drop-shadow(0 3px 0 ${COLORS.cyan})`,
          }}
        />
      </div>
    </motion.div>
  );
};
