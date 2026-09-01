import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {MascotId, MascotPose} from '../schema';
import {useMouthStateFromAudio} from '../hooks/useMouthStateFromAudio';
import {resolveMascotRenderer} from './mascots/registry';

export type SvgMascotCharacterProps = {
  mascotId: MascotId;
  pose: MascotPose;
  audioUrl: string;
  position?: {x: number; y: number; scale: number};
};

export const SvgMascotCharacter: React.FC<SvgMascotCharacterProps> = ({
  mascotId,
  pose,
  audioUrl,
  position = {x: 0, y: 0, scale: 1},
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const mouth = useMouthStateFromAudio(audioUrl);
  const Renderer = resolveMascotRenderer(mascotId);

  const breathScale = 1 + Math.sin(frame / 12) * 0.012;
  const subtleTilt = Math.sin(frame / 18) * 1.8;
  const entranceSpring = spring({
    frame,
    fps,
    config: {damping: 12, stiffness: 100},
  });

  const shouldMirror = pose === 'pointing' || pose === 'talking';
  const mirrorTransform = shouldMirror ? 'scaleX(-1)' : 'scaleX(1)';

  if (!Renderer) {
    return null;
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        transform: `scale(${position.scale * entranceSpring * breathScale}) rotate(${subtleTilt}deg) ${mirrorTransform}`,
        transformOrigin: 'bottom center',
        filter: 'drop-shadow(0px 15px 25px rgba(0, 0, 0, 0.75))',
      }}
    >
      <Renderer pose={pose} mouth={mouth} />
    </div>
  );
};
