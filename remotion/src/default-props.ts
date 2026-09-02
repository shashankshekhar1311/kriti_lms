import type {ComicLessonProps} from './schema';

/**
 * Studio preview: cartoon SVG mouth-swap for Gyanu (default mascot).
 * Scrub the first 5 seconds — Gyanu's beak tracks beat audio amplitude.
 */
export const defaultComicLessonProps: ComicLessonProps = {
  lesson_title: 'Light — Reflection (Artifact Preview)',
  student_name: 'Rahul',
  mascot_id: 'gyanu',
  lip_sync_mode: 'cartoon_svg',
  subject: 'science',
  chapter_id: 'class7_science_light',
  artifacts_enabled: true,
  bg_image_url: 'backgrounds/classroom.jpg',
  talking_mascot_video_url: '',
  mascot_clips: [
    {
      audio_url: 'mascots/gyanu/beat_0_talking.mp3',
      lip_sync_mode: 'cartoon_svg',
      start_time: 0,
      end_time: 5,
      pose: 'talking',
    },
  ],
  narration_timeline: [
    {
      text: 'Hey Rahul! I am Gyanu — watch my beak move with the narration beat.',
      start_time: 0,
      end_time: 5,
    },
  ],
  visual_events: [
    {
      type: 'concept_card',
      start_time: 0,
      end_time: 5,
      title: 'Reflection in a Plane Mirror',
      items: ['Angle in = angle out', 'Image is virtual', 'Same size as object'],
      visual_mode: 'artifact',
      artifact_id: 'plane_mirror_diagram',
      artifact_image_url: 'artifacts/plane_mirror_diagram.svg',
      artifact_caption: 'Ray diagram for reflection in a plane mirror',
      artifact_source: 'Textbook p. 112',
      mascot_position: {x: 960, y: 440, scale: 1.05},
      card_position: {x: 960, y: 260},
      mascot_pose: 'pointing',
      bg_image_url: 'backgrounds/classroom.jpg',
    },
  ],
};
