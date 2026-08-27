import type {MascotPosition, VisualEvent, VisualEventType} from './schema';
import {secondsToFrames} from './timing';
import {MASCOT_MOVE_THRESHOLD_PX, type SfxId} from './sfx';

export type SfxTrigger = {
  id: string;
  sfx: SfxId;
  frame: number;
};

const CARD_POP_TYPES: VisualEventType[] = [
  'intro',
  'concept_card',
  'math_step',
];

const positionDelta = (a: MascotPosition, b: MascotPosition): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Derive one-shot SFX trigger frames from visual_events.
 * - pop: card / box fade-in at event start
 * - swoosh: mascot keyframe travel between consecutive events
 * - chime: summary badge unlock (Phase 4)
 */
export const buildSfxTriggers = (
  events: VisualEvent[],
  fps: number,
): SfxTrigger[] => {
  const sorted = [...events].sort((a, b) => a.start_time - b.start_time);
  const triggers: SfxTrigger[] = [];

  sorted.forEach((event, index) => {
    const frame = secondsToFrames(event.start_time, fps);

    if (CARD_POP_TYPES.includes(event.type)) {
      triggers.push({
        id: `pop-${event.type}-${index}-${frame}`,
        sfx: 'pop',
        frame,
      });
    }

    if (event.type === 'summary_badge') {
      triggers.push({
        id: `chime-summary-${index}-${frame}`,
        sfx: 'chime',
        frame,
      });
    }

    if (index === 0) {
      return;
    }

    const previous = sorted[index - 1];
    if (
      positionDelta(previous.mascot_position, event.mascot_position) >=
      MASCOT_MOVE_THRESHOLD_PX
    ) {
      triggers.push({
        id: `swoosh-${index}-${frame}`,
        sfx: 'swoosh',
        frame,
      });
    }
  });

  return triggers;
};
