import React from 'react';
import {Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ComicLessonProps, MascotClip} from './schema';
import {
  activeNarrationText,
  eventWindow,
  secondsToFrames,
} from './timing';
import {buildSfxTriggers} from './audio-triggers';
import {NARRATION_VOLUME, resolveSfxSrc} from './sfx';
import {cardsZoneStyle, mascotPanelStyle, artifactZoneStyle} from './layout';
import {FullCanvasStage} from './components/FullCanvasStage';
import {DynamicBackground} from './components/DynamicBackground';
import {WorldSpeechBubble} from './components/WorldSpeechBubble';
import {FloatingMathCard} from './components/FloatingMathCard';
import {ArtifactPanel, eventShowsArtifact} from './components/ArtifactPanel';
import {ComicAudioFx} from './components/ComicAudioFx';
import {MascotLayer} from './MascotLayer';
import {SvgMascotCharacter} from './components/SvgMascotCharacter';

const resolveClipMode = (
  clip: MascotClip,
  lessonMode: ComicLessonProps['lip_sync_mode'],
): 'cartoon_svg' | 'wav2lip' => clip.lip_sync_mode ?? lessonMode ?? 'cartoon_svg';

export const ComicLesson: React.FC<ComicLessonProps> = ({
  lesson_title,
  student_name,
  mascot_id = 'gyanu',
  lip_sync_mode,
  narration_audio_url,
  bg_image_url,
  talking_mascot_video_url,
  mascot_clips = [],
  narration_timeline,
  visual_events,
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const time = frame / fps;
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
            lip_sync_mode: lip_sync_mode ?? 'wav2lip',
          },
        ];

  return (
    <FullCanvasStage lessonTitle={lesson_title} studentName={student_name}>
      {visual_events.length > 0 ? (
        visual_events.map((event, index) => {
          const window = eventWindow(event, fps);
          return (
            <Sequence
              key={`bg-${event.type}-${event.start_time}-${index}`}
              from={window.from}
              durationInFrames={window.durationInFrames}
              name={`Background: ${event.title}`}
              layout="none"
            >
              <DynamicBackground bgImageUrl={event.bg_image_url ?? bg_image_url} />
            </Sequence>
          );
        })
      ) : (
        <DynamicBackground bgImageUrl={bg_image_url} />
      )}

      <ComicAudioFx triggers={sfxTriggers} />

      {narration_audio_url ? (
        <Audio
          src={staticFile(narration_audio_url)}
          volume={NARRATION_VOLUME}
          name="narration"
        />
      ) : null}

      <div style={cardsZoneStyle}>
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

      <div style={artifactZoneStyle}>
        {visual_events.map((event, index) => {
          if (!eventShowsArtifact(event)) {
            return null;
          }
          const window = eventWindow(event, fps);
          return (
            <Sequence
              key={`artifact-${event.start_time}-${index}`}
              from={window.from}
              durationInFrames={window.durationInFrames}
              name={`Artifact: ${event.title}`}
              layout="none"
            >
              <ArtifactPanel
                event={event}
                durationInFrames={window.durationInFrames}
              />
            </Sequence>
          );
        })}
      </div>

      <WorldSpeechBubble text={speech} opacity={speech ? 1 : 0} />

      <div style={mascotPanelStyle}>
        {clips.map((clip, index) => {
          const from = secondsToFrames(clip.start_time, fps);
          const durationInClip = Math.max(
            1,
            secondsToFrames(clip.end_time, fps) - from,
          );
          const mode = resolveClipMode(clip, lip_sync_mode);
          const activeEvent =
            visual_events.find(
              (e) => time >= e.start_time && time <= e.end_time,
            ) || visual_events[0];
          const isIntroOrRecap =
            activeEvent?.type === 'intro' ||
            activeEvent?.type === 'summary_badge';
          const isCartoonClip = mode === 'cartoon_svg';

          if (!isCartoonClip && !isIntroOrRecap) {
            return null;
          }

          const position =
            activeEvent?.mascot_position || {x: 550, y: -250, scale: 1.0};

          if (isCartoonClip) {
            if (!clip.audio_url) {
              return null;
            }

            return (
              <Sequence
                key={`cartoon-${clip.pose}-${clip.audio_url}-${index}`}
                from={from}
                durationInFrames={durationInClip}
                name={`Mascot ${clip.pose} (svg)`}
                layout="none"
              >
                <Audio
                  src={staticFile(clip.audio_url)}
                  volume={NARRATION_VOLUME}
                  name={`beat-${index}`}
                />
                <SvgMascotCharacter
                  mascotId={mascot_id}
                  pose={clip.pose}
                  audioUrl={clip.audio_url}
                  position={position}
                />
              </Sequence>
            );
          }

          if (!clip.video_url) {
            return null;
          }

          return (
            <Sequence
              key={`${clip.pose}-${clip.video_url}-${index}`}
              from={from}
              durationInFrames={durationInClip}
              name={`Mascot ${clip.pose}`}
              layout="none"
            >
              <MascotLayer
                videoUrl={clip.video_url}
                pose={clip.pose}
                position={position}
              />
            </Sequence>
          );
        })}
      </div>
    </FullCanvasStage>
  );
};
