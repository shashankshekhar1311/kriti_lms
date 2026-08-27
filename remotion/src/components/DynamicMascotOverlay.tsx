import {useState} from 'react';
import {OffthreadVideo} from 'remotion';
import {resolveMascotSrc} from '../media';

const GyanuFallback: React.FC = () => (
  <svg viewBox="0 0 240 280" width="100%" height="100%" aria-hidden>
    <ellipse cx="120" cy="262" rx="54" ry="10" fill="rgba(2,6,23,0.35)" />
    <circle cx="120" cy="118" r="82" fill="#06B6D4" />
    <circle cx="120" cy="118" r="82" fill="none" stroke="#F59E0B" strokeWidth="7" />
    <circle cx="94" cy="104" r="17" fill="#F8FAFC" />
    <circle cx="146" cy="104" r="17" fill="#F8FAFC" />
    <circle cx="96" cy="106" r="7.5" fill="#020617" />
    <circle cx="148" cy="106" r="7.5" fill="#020617" />
    <polygon points="120,126 140,160 100,160" fill="#F59E0B" />
    <rect x="78" y="198" width="84" height="46" rx="18" fill="#1E293B" />
    <text
      x="120"
      y="228"
      textAnchor="middle"
      fill="#F8FAFC"
      fontSize="18"
      fontFamily="Nunito, sans-serif"
      fontWeight="800"
    >
      GYANU
    </text>
  </svg>
);

/**
 * Mascot fills the fixed Mascot Zone. Transparent container + screen blend
 * removes black MP4 letterbox so the stage background shows through.
 */
export const DynamicMascotOverlay: React.FC<{
  videoUrl: string;
  /** Keep mascot / narration VO at full level (SFX are ducked separately). */
  narrationVolume?: number;
  /** Subtle idle bob (px), applied inside the zone only. */
  bobY?: number;
  scale?: number;
}> = ({videoUrl, narrationVolume = 1, bobY = 0, scale = 1}) => {
  const [videoFailed, setVideoFailed] = useState(false);
  const src = resolveMascotSrc(videoUrl);
  const showVideo = Boolean(src) && !videoFailed;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 440,
        background: 'transparent',
        zIndex: 1,
        pointerEvents: 'none',
        transform: `translateY(${bobY}px) scale(${scale})`,
        transformOrigin: 'center bottom',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'transparent',
          overflow: 'visible',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        {showVideo && src ? (
          <OffthreadVideo
            src={src}
            volume={narrationVolume}
            transparent
            onError={() => setVideoFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center bottom',
              background: 'transparent',
              mixBlendMode: 'screen',
            }}
            acceptableTimeShiftInSeconds={0.3}
            pauseWhenBuffering
            delayRenderRetries={1}
            delayRenderTimeoutInMilliseconds={8000}
          />
        ) : (
          <div
            style={{
              width: '92%',
              height: '100%',
              background: 'transparent',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <GyanuFallback />
          </div>
        )}
      </div>
    </div>
  );
};
