import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {LAYOUT} from '../theme';
import {resolveImageSrc} from '../media';

const SCRIM_GRADIENT =
  'linear-gradient(180deg, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.65) 50%, rgba(15,23,42,0.9) 100%)';

export const DynamicBackground: React.FC<{
  bgImageUrl: string;
}> = ({bgImageUrl}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const src = resolveImageSrc(bgImageUrl);

  if (!src) {
    return null;
  }

  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        width: LAYOUT.width,
        height: LAYOUT.height,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <Img
        src={src}
        style={{
          width: LAYOUT.width,
          height: LAYOUT.height,
          objectFit: 'cover',
          objectPosition: 'center center',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      />
      <AbsoluteFill
        style={{
          background: SCRIM_GRADIENT,
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />
    </AbsoluteFill>
  );
};
