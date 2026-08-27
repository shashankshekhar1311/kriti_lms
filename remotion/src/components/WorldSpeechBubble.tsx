import {motion} from 'framer-motion';
import type {MascotPosition} from '../schema';
import {COLORS, LAYOUT, clampLines} from '../theme';
import {bodyFont} from '../fonts';
import {mascotBox} from '../layout';

const BUBBLE_WIDTH = 560;
const BUBBLE_HEIGHT = 168;

export const WorldSpeechBubble: React.FC<{
  pose: MascotPosition;
  text: string;
  opacity?: number;
}> = ({pose, text, opacity = 1}) => {
  const box = mascotBox(pose);
  if (!text) {
    return null;
  }

  const preferredLeft = pose.x - BUBBLE_WIDTH / 2;
  const left = Math.min(
    LAYOUT.width - BUBBLE_WIDTH - 24,
    Math.max(24, preferredLeft),
  );
  const preferredTop = box.headY - BUBBLE_HEIGHT - 18;
  const top = Math.max(88, preferredTop);
  const tailX = Math.min(
    BUBBLE_WIDTH - 48,
    Math.max(48, pose.x - left),
  );

  return (
    <motion.div
      initial={false}
      style={{
        position: 'absolute',
        left,
        top,
        width: BUBBLE_WIDTH,
        zIndex: 8,
        opacity,
        transform: `translateY(${(1 - opacity) * 10}px) scale(${0.96 + opacity * 0.04})`,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          padding: '16px 22px 22px',
          borderRadius: 26,
          background: COLORS.white,
          color: COLORS.ink,
          boxShadow: `0 10px 28px rgba(2, 6, 23, 0.35), 0 0 0 3px ${COLORS.cyan}`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: bodyFont,
            fontSize: 28,
            fontWeight: 800,
            lineHeight: 1.25,
            color: COLORS.ink,
            ...clampLines(3),
          }}
        >
          {text}
        </p>
        <div
          style={{
            position: 'absolute',
            left: tailX,
            bottom: -16,
            width: 0,
            height: 0,
            marginLeft: -16,
            borderLeft: '16px solid transparent',
            borderRight: '16px solid transparent',
            borderTop: `16px solid ${COLORS.white}`,
            filter: `drop-shadow(0 4px 0 ${COLORS.cyan})`,
          }}
        />
      </div>
    </motion.div>
  );
};
