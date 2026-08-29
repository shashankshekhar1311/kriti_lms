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
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `
          scale(${position.scale * entranceSpring * breathScale}) 
          rotate(${subtleTilt}deg) 
          ${mirrorTransform}
        `,
        transformOrigin: "bottom center",
        transition: "top 0.4s ease-out, left 0.4s ease-out",
        filter: `
          drop-shadow(0px 20px 30px rgba(0, 0, 0, 0.75)) 
          drop-shadow(0px 0px 15px rgba(255, 255, 255, 0.15))
        `,
      }}
    >
      <OffthreadVideo
        src={resolvedSrc}
        style={{
          width: "450px",
          height: "auto",
          objectFit: "contain",
          backgroundColor: "transparent",
        }}
      />
    </div>
  );
};