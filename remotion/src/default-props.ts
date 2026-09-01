import type {ComicLessonProps} from './schema';

/**
 * Studio preview: cartoon SVG mouth-swap for Gyanu (default mascot).
 * Scrub the first 5 seconds — Gyanu's beak tracks beat audio amplitude.
 */
export const defaultComicLessonProps: ComicLessonProps = {
  lesson_title: 'Meet Gyanu — Cartoon Lip-Sync Preview',
  student_name: 'Rahul',
  mascot_id: 'gyanu',
  lip_sync_mode: 'cartoon_svg',
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
      type: 'intro',
      start_time: 0,
      end_time: 5,
      title: 'Gyanu Mouth-Swap Test',
      items: [
        'Cartoon SVG owl mascot',
        'Audio amplitude drives beak',
        'No Wav2Lip / no GPU',
      ],
      mascot_position: {x: 960, y: 440, scale: 1.05},
      card_position: {x: 960, y: 260},
      mascot_pose: 'talking',
      bg_image_url: 'backgrounds/classroom.jpg',
    },
  ],
};
