export interface TranscriptLine {
  id: string;
  text: string;
  start: number;
  end: number;
}

/** Split narration into sentence-like chunks. */
export function splitNarrationSentences(narration: string): string[] {
  const cleaned = narration.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const parts = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [cleaned];
}

/**
 * Build timed transcript lines. Prefer proportional word-weight timing
 * across the known video duration so click-to-seek stays useful even
 * without explicit timestamps in narration.txt.
 */
export function buildTimedTranscript(
  narration: string,
  durationSeconds: number
): TranscriptLine[] {
  const sentences = splitNarrationSentences(narration);
  if (sentences.length === 0) return [];

  const duration =
    Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : Math.max(30, sentences.length * 4);

  const weights = sentences.map((s) => Math.max(1, s.split(/\s+/).length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let cursor = 0;
  return sentences.map((text, index) => {
    const span = (weights[index] / totalWeight) * duration;
    const start = cursor;
    const end =
      index === sentences.length - 1 ? duration : cursor + span;
    cursor = end;
    return {
      id: `line-${index}`,
      text,
      start,
      end,
    };
  });
}

export function activeTranscriptIndex(
  lines: TranscriptLine[],
  currentTime: number
): number {
  if (lines.length === 0) return -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (currentTime >= lines[i].start) return i;
  }
  return 0;
}
