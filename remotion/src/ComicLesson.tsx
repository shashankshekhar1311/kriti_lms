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
import {NARRATION_VOLUME, resolveSfxSrc} from './sfx';
import {contentZoneStyle, mascotZoneStyle} from './layout';
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
  const bobY = Math.sin(frame * 0.42) * 8 * Math.max(0.25, travel);
  const speech = activeNarrationText(time, narration_timeline);
  const sfxTriggers = buildSfxTriggers(visual_events, fps).filter((trigger) =>
    Boolean(resolveSfxSrc(trigger.sfx)),
  );
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

      {/* Content Zone — all visual cards stay at x >= 540 */}
      <div style={contentZoneStyle}>
        {visual_events.map((event, index) => {
          const window = eventWindow(event, fps);
          return (
            <Sequence
              key={`${event.type}-${event.start_time}-${index}`}
              from={window.from}
              durationInFrames={window.durationInFrames}
              name={event.title}
              layout="none"
            >
              <FloatingMathCard
                event={event}
                studentName={student_name}
                durationInFrames={window.durationInFrames}
              />
            </Sequence>
          );
        })}
      </div>

      {/* Mascot Zone — character + speech bubble only */}
      <div style={mascotZoneStyle}>
        <WorldSpeechBubble text={speech} opacity={speech ? 1 : 0} />
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
              layout="none"
            >
              <DynamicMascotOverlay
                videoUrl={clip.video_url}
                narrationVolume={NARRATION_VOLUME}
                bobY={bobY}
                scale={Math.min(1.08, Math.max(0.92, pose.scale))}
              />
            </Sequence>
          );
        })}
      </div>
    </FullCanvasStage>
  );
};
