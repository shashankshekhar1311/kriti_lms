import {useState} from 'react';
import {OffthreadVideo} from 'remotion';
import type {MascotPosition} from '../schema';
import {resolveMascotSrc} from '../media';
import {mascotBox} from '../layout';

const GyanuFallback: React.FC = () => (
  <svg viewBox="0 0 240 280" width="100%" height="100%" aria-hidden>
    <ellipse cx="120" cy="262" rx="54" ry="10" fill="rgba(2,6,23,0.45)" />
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

export const DynamicMascotOverlay: React.FC<{
  videoUrl: string;
  pose: MascotPosition;
  /** Keep mascot / narration VO at full level (SFX are ducked separately). */
  narrationVolume?: number;
}> = ({videoUrl, pose, narrationVolume = 1}) => {
  const [videoFailed, setVideoFailed] = useState(false);
  const src = resolveMascotSrc(videoUrl);
  const showVideo = Boolean(src) && !videoFailed;
  const box = mascotBox(pose);

  return (
    <div
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        zIndex: 6,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '12%',
          right: '12%',
          bottom: -6,
          height: 28,
          borderRadius: '50%',
          background: 'rgba(2, 6, 23, 0.45)',
          filter: 'blur(6px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
        }}
      >
        {showVideo && src ? (
          <OffthreadVideo
            src={src}
            volume={narrationVolume}
            onError={() => setVideoFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center bottom',
            }}
            acceptableTimeShiftInSeconds={0.3}
            pauseWhenBuffering
            delayRenderRetries={1}
            delayRenderTimeoutInMilliseconds={8000}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <GyanuFallback />
          </div>
        )}
      </div>
    </div>
  );
};
