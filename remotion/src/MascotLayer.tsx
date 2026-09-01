import { OffthreadVideo, staticFile, useCurrentFrame, spring, useVideoConfig } from "remotion";
import React from "react";

interface MascotProps {
  videoUrl: string;
  pose: string;
  position: { x: number; y: number; scale: number };
}

// CHANGED — new: Wav2Lip only ever animates the mouth region, so even a
// perfectly lip-synced clip looks frozen everywhere else (no blinking, no
// idle life). This overlays two simple "eyelid" shapes that sweep down
// briefly on a randomized cadence, composited on top of the video.
//
// IMPORTANT CALIBRATION NOTE: these percentages are derived from the eye
// coordinates in assets/mascots/gyanu/neutral.svg (400x480 viewBox, eyes
// centered around x=164/236, y=188). Wav2Lip crops and warps the face
// region during inference, so the *exact* pixel position of the eyes in
// the final rendered clip can shift slightly from the source SVG's
// coordinates. Treat BLINK_BAND below as a first-pass estimate — once you
// have a real rendered .webm clip, scrub to a frame and nudge these
// percentages until the eyelid overlay lines up, then update the default
// here (or override per-mascot via props if poses differ enough to need
// their own calibration — `pointing.svg`'s head group is rotated 8° and
// uses a 480x480 viewBox, so it will likely need a slightly different
// band than neutral/talking/happy).
const BLINK_BAND = {
  leftPct: 29.5,   // left edge of the eye band, % of mascot width
  widthPct: 41,    // width of the eye band, % of mascot width
  topPct: 31,      // top edge of the eye band, % of mascot height
  heightPct: 17,   // height of the eye band, % of mascot height
};

const BLINK_MIN_INTERVAL_MS = 2800;
const BLINK_MAX_INTERVAL_MS = 5200;
const BLINK_DURATION_MS = 130;

const BlinkOverlay: React.FC<{seed: number}> = ({seed}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  // Deterministic pseudo-random cadence per mascot instance (seeded by
  // `seed`) so Remotion's frame-seek-based rendering stays reproducible —
  // no Math.random() per frame, which would flicker differently on every
  // re-render/seek.
  const cycleMs = BLINK_MIN_INTERVAL_MS + (seed % 1000) / 1000 * (BLINK_MAX_INTERVAL_MS - BLINK_MIN_INTERVAL_MS);
  const phaseMs = (nowMs + (seed % 700)) % cycleMs;
  const isBlinking = phaseMs < BLINK_DURATION_MS;
  const closeAmount = isBlinking
    ? Math.sin((phaseMs / BLINK_DURATION_MS) * Math.PI) // 0 -> 1 -> 0 across the blink
    : 0;

  if (closeAmount <= 0.02) {
    return null;
  }

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: `${BLINK_BAND.leftPct}%`,
        top: `${BLINK_BAND.topPct}%`,
        width: `${BLINK_BAND.widthPct}%`,
        height: `${BLINK_BAND.heightPct}%`,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}
    >
      {[0, 1].map((eyeIndex) => (
        <div
          key={eyeIndex}
          style={{
            width: '44%',
            height: '100%',
            borderRadius: '50%',
            background: '#7C4A1E',
            opacity: 0.94,
            transformOrigin: 'top center',
            transform: `scaleY(${closeAmount})`,
          }}
        />
      ))}
    </div>
  );
};

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

export const MascotLayer: React.FC<MascotProps> = ({ videoUrl, pose, position }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const breathScale = 1 + Math.sin(frame / 12) * 0.012;
  const subtleTilt = Math.sin(frame / 18) * 1.8;

  const entranceSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const shouldMirror = pose === "pointing" || pose === "talking";
  const mirrorTransform = shouldMirror ? "scaleX(-1)" : "scaleX(1)";

  // Resolves assets stored in the Remotion public directory
  const resolvedSrc = videoUrl.startsWith("http") ? videoUrl : staticFile(videoUrl);

  // Seed the blink cadence from the clip's filename so it's stable across
  // re-renders of the same clip but varies between different mascot clips
  // playing in the same composition (avoids every mascot on screen blinking
  // in perfect unison, which reads as robotic rather than alive).
  const blinkSeed = React.useMemo(() => {
    let hash = 0;
    for (let i = 0; i < videoUrl.length; i += 1) {
      hash = (hash * 31 + videoUrl.charCodeAt(i)) % 100000;
    }
    return hash;
  }, [videoUrl]);

  return (
    <div
      style={{
        position: "absolute",
        right: "60px",
        bottom: "40px",
        transform: `scale(${position.scale * entranceSpring * breathScale}) rotate(${subtleTilt}deg) ${mirrorTransform}`,
        transformOrigin: "bottom right",
        filter: "drop-shadow(0px 15px 25px rgba(0, 0, 0, 0.75))",
      }}
    >
      <div style={{position: 'relative', width: '400px'}}>
        <OffthreadVideo
          src={resolvedSrc}
          style={{
            width: "400px",
            height: "auto",
            backgroundColor: "transparent",
          }}
        />
        <BlinkOverlay seed={blinkSeed} />
      </div>
    </div>
  );
};
