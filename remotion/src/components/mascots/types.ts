import type React from 'react';
import type {MascotId, MascotPose} from '../../schema';
import type {MouthState} from '../../hooks/useMouthStateFromAudio';

export type MascotCharacterProps = {
  pose: MascotPose;
  mouth: MouthState;
};

export type MascotRenderer = React.FC<MascotCharacterProps>;

export type {MascotId};
