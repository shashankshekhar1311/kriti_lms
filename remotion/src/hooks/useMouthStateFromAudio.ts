import {useMemo} from 'react';
import {staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {useAudioData, visualizeAudio} from '@remotion/media-utils';

export type MouthState = 'closed' | 'mid' | 'wide';

const CLOSED_MAX = 0.16;
const MID_MAX = 0.4;

const resolveAudioSrc = (audioUrl: string): string =>
  audioUrl.startsWith('http') ? audioUrl : staticFile(audioUrl);

export const useMouthStateFromAudio = (audioUrl: string): MouthState => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const audioData = useAudioData(resolveAudioSrc(audioUrl));

  return useMemo(() => {
    if (!audioData) {
      return 'closed';
    }

    const samples = visualizeAudio({
      fps,
      frame,
      audioData,
      numberOfSamples: 16,
    });
    const amp = Math.max(...samples.map(Math.abs));

    if (amp < CLOSED_MAX) {
      return 'closed';
    }
    if (amp < MID_MAX) {
      return 'mid';
    }
    return 'wide';
  }, [audioData, fps, frame]);
};
