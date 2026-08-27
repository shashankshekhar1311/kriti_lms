import {Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ComicLessonProps} from './schema';
import {
  activeNarrationText,
  eventWindow,
  interpolateMascotPose,
  mascotTravelAmount,
  secondsToFrames,
} from './timing';
import {buildSfxTriggers} from './audio-triggers';
import {NARRATION_VOLUME} from './sfx';
import {FullCanvasStage} from './components/FullCanvasStage';
import {DynamicMascotOverlay} from './components/DynamicMascotOverlay';
import {WorldSpeechBubble} from './components/WorldSpeechBubble';
import {FloatingMathCard} from './components/FloatingMathCard';
import {ComicAudioFx} from './components/ComicAudioFx';

export const ComicLesson: React.FC<ComicLessonProps> = ({
  lesson_title,
  student_name,
  talking_mascot_video_url,
  mascot_clips = [],
  narration_timeline,
  visual_events,
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const time = frame / fps;
  const pose = interpolateMascotPose(time, visual_events);
  const travel = mascotTravelAmount(time, visual_events);
  const bobY = Math.sin(frame * 0.42) * 10 * travel;
  const drawnPose = {...pose, y: pose.y + bobY};
  const speech = activeNarrationText(time, narration_timeline);
  const sfxTriggers = buildSfxTriggers(visual_events, fps);
  const clips =
    mascot_clips.length > 0
      ? mascot_clips
      : [
          {
            video_url: talking_mascot_video_url,
            start_time: 0,
            end_time: durationInFrames / fps,
            pose: 'talking' as const,
          },
        ];

  return (
    <FullCanvasStage lessonTitle={lesson_title} studentName={student_name}>
      <ComicAudioFx triggers={sfxTriggers} />
      {visual_events.map((event, index) => {
        const window = eventWindow(event, fps);
        return (
          <Sequence
            key={`${event.type}-${event.start_time}-${index}`}
            from={window.from}
            durationInFrames={window.durationInFrames}
            name={event.title}
          >
            <FloatingMathCard
              event={event}
              studentName={student_name}
              durationInFrames={window.durationInFrames}
            />
          </Sequence>
        );
      })}
      {clips.map((clip, index) => {
        const from = secondsToFrames(clip.start_time, fps);
        const durationInClip = Math.max(
          1,
          secondsToFrames(clip.end_time, fps) - from,
        );
        return (
          <Sequence
            key={`${clip.pose}-${clip.video_url}-${index}`}
            from={from}
            durationInFrames={durationInClip}
            name={`Mascot ${clip.pose}`}
          >
            <DynamicMascotOverlay
              videoUrl={clip.video_url}
              pose={drawnPose}
              narrationVolume={NARRATION_VOLUME}
            />
          </Sequence>
        );
      })}
      <WorldSpeechBubble pose={drawnPose} text={speech} opacity={speech ? 1 : 0} />
    </FullCanvasStage>
  );
};
