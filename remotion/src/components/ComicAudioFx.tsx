import {Audio, Sequence} from 'remotion';
import type {SfxTrigger} from '../audio-triggers';
import {SFX, SFX_CLIP_FRAMES, SFX_VOLUME} from '../sfx';

/**
 * Plays one-shot SFX at calculated composition frames.
 * Uses Sequence placement + startFrom/endAt trim so each cue is ~1s.
 */
export const ComicAudioFx: React.FC<{
  triggers: SfxTrigger[];
}> = ({triggers}) => {
  return (
    <>
      {triggers.map((trigger) => (
        <Sequence
          key={trigger.id}
          from={trigger.frame}
          durationInFrames={SFX_CLIP_FRAMES}
          name={`sfx-${trigger.sfx}@${trigger.frame}`}
          layout="none"
        >
          <Audio
            src={SFX[trigger.sfx]}
            startFrom={0}
            endAt={SFX_CLIP_FRAMES}
            volume={SFX_VOLUME}
            name={trigger.sfx}
          />
        </Sequence>
      ))}
    </>
  );
};
