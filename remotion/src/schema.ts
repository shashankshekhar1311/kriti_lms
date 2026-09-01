import {z} from 'zod';

export const narrationLineSchema = z.object({
  text: z.string(),
  start_time: z.number().min(0),
  end_time: z.number().min(0),
});

export const xySchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const mascotPositionSchema = xySchema.extend({
  scale: z.number().positive(),
});

export const mascotPoseSchema = z.enum(['neutral', 'talking', 'pointing', 'happy']);

export const lipSyncModeSchema = z.enum(['cartoon_svg', 'wav2lip']);

export const mascotIdSchema = z.enum(['gyanu', 'kito', 'volt']);

export const mascotClipSchema = z.object({
  video_url: z.string().optional(),
  audio_url: z.string().optional(),
  lip_sync_mode: lipSyncModeSchema.optional(),
  start_time: z.number().min(0),
  end_time: z.number().min(0),
  pose: mascotPoseSchema,
});

export const visualEventSchema = z.object({
  type: z.enum(['intro', 'concept_card', 'math_step', 'summary_badge']),
  start_time: z.number().min(0),
  end_time: z.number().min(0),
  title: z.string(),
  items: z.array(z.union([z.string(), z.number()])),
  mascot_position: mascotPositionSchema,
  card_position: xySchema.optional(),
  glowing_badge: z.boolean().optional(),
  mascot_pose: mascotPoseSchema.optional(),
  // CHANGED: Chapter_Agent.py's panels_to_visual_events_precise() has always
  // written a per-event "bg_image_url" (one SDXL image per beat) — it just
  // was never part of this schema, so ComicLesson.tsx could never read it
  // and every micro-lesson silently used only the single top-level
  // bg_image_url for its entire duration. Adding it here is what lets the
  // background actually change per beat (see ComicLesson.tsx).
  bg_image_url: z.string().optional(),
});

export const comicLessonSchema = z.object({
  lesson_title: z.string(),
  student_name: z.string(),
  mascot_id: mascotIdSchema.optional(),
  lip_sync_mode: lipSyncModeSchema.optional(),
  narration_audio_url: z.string().optional(),
  bg_image_url: z.string(),
  talking_mascot_video_url: z.string(),
  mascot_clips: z.array(mascotClipSchema).optional(),
  narration_timeline: z.array(narrationLineSchema),
  visual_events: z.array(visualEventSchema),
});

export type NarrationLine = z.infer<typeof narrationLineSchema>;
export type MascotPosition = z.infer<typeof mascotPositionSchema>;
export type MascotClip = z.infer<typeof mascotClipSchema>;
export type VisualEvent = z.infer<typeof visualEventSchema>;
export type ComicLessonProps = z.infer<typeof comicLessonSchema>;
export type VisualEventType = VisualEvent['type'];
export type MascotPose = z.infer<typeof mascotPoseSchema>;
export type LipSyncMode = z.infer<typeof lipSyncModeSchema>;
export type MascotId = z.infer<typeof mascotIdSchema>;
