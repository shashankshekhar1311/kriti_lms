import {motion} from 'framer-motion';
import {COLORS, clampLines} from '../theme';
import {bodyFont} from '../fonts';
import {MASCOT_PANEL} from '../layout';

/** Speech bubble anchored above the bottom-right mascot panel. */
export const WorldSpeechBubble: React.FC<{
  text: string;
  opacity?: number;
}> = ({text, opacity = 1}) => {
  if (!text) {
    return null;
  }

  return (
    <motion.div
      initial={false}
      style={{
        position: 'absolute',
        right: MASCOT_PANEL.right,
        bottom: MASCOT_PANEL.bottom + MASCOT_PANEL.height + 16,
        maxWidth: MASCOT_PANEL.width,
        width: MASCOT_PANEL.width,
        zIndex: MASCOT_PANEL.zIndex + 5,
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
          background: 'rgba(248, 250, 252, 0.96)',
          color: COLORS.ink,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: bodyFont,
            fontSize: 22,
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
            left: '50%',
            bottom: -14,
            marginLeft: -14,
            width: 0,
            height: 0,
            borderLeft: '14px solid transparent',
            borderRight: '14px solid transparent',
            borderTop: '14px solid rgba(248, 250, 252, 0.96)',
          }}
        />
      </div>
    </motion.div>
  );
};
