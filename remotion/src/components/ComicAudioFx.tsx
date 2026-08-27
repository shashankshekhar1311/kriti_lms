import {Audio, Sequence} from 'remotion';
import type {SfxTrigger} from '../audio-triggers';
import {resolveSfxSrc, SFX_CLIP_FRAMES, SFX_VOLUME} from '../sfx';

/**
 * Plays one-shot SFX at calculated composition frames.
 * Skips cues whose public/sfx/*.mp3 file is missing so render does not fail.
 */
export const ComicAudioFx: React.FC<{
  triggers: SfxTrigger[];
}> = ({triggers}) => {
  return (
    <>
      {triggers.map((trigger) => {
        const src = resolveSfxSrc(trigger.sfx);
        if (!src) {
          return null;
        }
        return (
          <Sequence
            key={trigger.id}
            from={trigger.frame}
            durationInFrames={SFX_CLIP_FRAMES}
            name={`sfx-${trigger.sfx}@${trigger.frame}`}
            layout="none"
          >
            <Audio
              src={src}
              startFrom={0}
              endAt={SFX_CLIP_FRAMES}
              volume={SFX_VOLUME}
              name={trigger.sfx}
            />
          </Sequence>
        );
      })}
    </>
  );
};
