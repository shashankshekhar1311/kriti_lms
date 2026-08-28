import {useState} from 'react';
import {OffthreadVideo} from 'remotion';
import {resolveMascotSrc} from '../media';

const GyanuFallback: React.FC = () => (
  <svg viewBox="0 0 240 280" width="100%" height="100%" aria-hidden>
    <circle cx="120" cy="118" r="82" fill="#06B6D4" />
    <circle cx="120" cy="118" r="82" fill="none" stroke="#F59E0B" strokeWidth="7" />
    <circle cx="94" cy="104" r="17" fill="#F8FAFC" />
    <circle cx="146" cy="104" r="17" fill="#F8FAFC" />
    <circle cx="96" cy="106" r="7.5" fill="#020617" />
    <circle cx="148" cy="106" r="7.5" fill="#020617" />
    <polygon points="120,126 140,160 100,160" fill="#F59E0B" />
  </svg>
);

/** Lip-sync mascot video — fills its rounded parent panel in ComicLesson. */
export const DynamicMascotOverlay: React.FC<{
  videoUrl: string;
  narrationVolume?: number;
  bobY?: number;
}> = ({videoUrl, narrationVolume = 1, bobY = 0}) => {
  const [videoFailed, setVideoFailed] = useState(false);
  const src = resolveMascotSrc(videoUrl);
  const showVideo = Boolean(src) && !videoFailed;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'transparent',
        pointerEvents: 'none',
        transform: `translateY(${bobY}px)`,
        transformOrigin: 'center bottom',
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
            objectFit: 'cover',
            objectPosition: 'center center',
            background: 'transparent',
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
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.35)',
          }}
        >
          <GyanuFallback />
        </div>
      )}
    </div>
  );
};
