import { OffthreadVideo, staticFile, useCurrentFrame, spring, useVideoConfig } from "remotion";
import React from "react";

interface MascotProps {
  videoUrl: string;
  pose: string;
  position: { x: number; y: number; scale: number };
}

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
    <OffthreadVideo
      src={resolvedSrc}
      style={{
        width: "400px",
        height: "auto",
        backgroundColor: "transparent",
      }}
    />
    </div>
  );
};