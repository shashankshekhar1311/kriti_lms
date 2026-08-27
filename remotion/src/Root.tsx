import React from 'react';
import {CalculateMetadataFunction, Composition} from 'remotion';
import {ComicLesson} from './ComicLesson';
import {defaultComicLessonProps} from './default-props';
import {comicLessonSchema, type ComicLessonProps} from './schema';
import {LAYOUT} from './theme';
import {getDurationInFrames} from './timing';

export const calculateComicLessonMetadata: CalculateMetadataFunction<
  ComicLessonProps
> = ({props}) => {
  return {
    fps: LAYOUT.fps,
    width: LAYOUT.width,
    height: LAYOUT.height,
    durationInFrames: getDurationInFrames(
      props.narration_timeline,
      props.visual_events,
      LAYOUT.fps,
    ),
    props,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ComicLesson"
      component={ComicLesson}
      durationInFrames={getDurationInFrames(
        defaultComicLessonProps.narration_timeline,
        defaultComicLessonProps.visual_events,
        LAYOUT.fps,
      )}
      fps={LAYOUT.fps}
      width={LAYOUT.width}
      height={LAYOUT.height}
      schema={comicLessonSchema}
      defaultProps={defaultComicLessonProps}
      calculateMetadata={calculateComicLessonMetadata}
    />
  );
};
