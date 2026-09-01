# Change set: mascot transparency, GPU honesty, card polish

These files are ready to drop into `kriti_lms` in place of the matching
paths. I have **not** modified anything I haven't personally seen the source
of in this conversation — notably, the "chip row" card visible in your
sample video (`Warfare: mili...`, `Trade Netwo...`) is not one of the card
components you've shared, so I could not patch it directly. Paste that
file's source here and I'll fix its truncation the same way as `IntroCard.tsx`.

## How to apply

1. Copy each file below over the matching path in your repo (same relative
   path is used here: `remotion/src/...`, root-level `Chapter_Agent.py` /
   `lip_sync_service.py`).
2. Diff against your current versions before overwriting, in case your repo
   has drifted from what was pasted into this conversation (e.g. if you've
   made local edits since).
3. Run `git diff` locally to review, then commit/push as normal.

## Files changed

| File | What changed | Why |
|---|---|---|
| `lip_sync_service.py` | Full rewrite. Chroma-key green background baked into every rasterize/fallback path instead of slate `#0F172A`; new `_finalize_alpha_video()` keys it out and encodes real alpha (VP9/WebM); new `LIP_SYNC_REQUIRE_GPU` env flag; renamed `_is_valid_mp4` → `_is_valid_video`; every generated clip writes a `<clip>.webm.status.json` sidecar. | This is the actual root cause of the hard-edged box behind the mascot in your sample video — H.264 MP4 cannot carry an alpha channel, so no CSS transparency trick downstream could ever have worked. Also stops a missing GPU from silently producing a motionless "video". |
| `Chapter_Agent.py` | Full rewrite. Mascot clips published as `.webm` instead of `.mp4`; the old concat-into-one-file step (which re-encoded through libx264 and destroyed alpha every time) is skipped — `ComicLesson.tsx` already supports playing `mascot_clips` as separate Sequences; new `_aggregate_gpu_status()` writes `gpu_status.json` per lesson; new `_validate_sfx_assets()` warns if `pop/swoosh/chime.mp3` are near-silent; storyboard prompt now caps title/item/chip character lengths. | Wires the transparency fix all the way through to what actually gets copied into `remotion/public/`; makes GPU/SFX problems visible in the output folder instead of only in scrollback logs; attacks text truncation at the content-generation source, not just the UI. |
| `remotion/src/schema.ts` | Added optional `bg_image_url` to `visualEventSchema`. | `Chapter_Agent.py` has *always* generated one background image per beat (`panels_to_visual_events_precise`) — it just wasn't in the schema, so Remotion could never read it. |
| `remotion/src/ComicLesson.tsx` | Background now renders per-beat inside each event's own `Sequence`, using `event.bg_image_url` with a fallback to the lesson-level image. | Fixes "one dim static image for the whole 2-3 minute lesson." **Known limitation:** this is a hard cut between beats, not a cross-dissolve — flagged in-code as a good follow-up once you see it in a real render. |
| `remotion/src/layout.ts` | `CardBox.height` → `CardBox.maxHeight` (a ceiling, not a forced size); non-intro cards anchor near the top of the zone instead of centering around a fixed height. | Fixes the large dead empty space visible below short card content in your sample video. |
| `remotion/src/components/FloatingMathCard.tsx` | Card now uses `height: 'auto'` capped by `maxHeight`; forwards `durationInFrames` to `IntroCard`. | Companion change to `layout.ts` — lets cards actually shrink to their content. |
| `remotion/src/components/cards/IntroCard.tsx` | Chip text wraps to 2 lines (`clampLines(2)`) instead of hard single-line truncation; bullet reveal now staggers across the beat's real duration instead of a fixed short stride. | Fixes the mid-word "Warfare: mili..." truncation pattern, and makes bullets feel like they're landing with the narration instead of all popping in within the first half-second. |
| `remotion/src/default-props.ts` | Sample data updated to `.webm` mascot filenames and per-event `bg_image_url`, so Remotion Studio previews actually reflect the new pipeline. | Keeps local dev/preview consistent with the real render path. |
| `remotion/src/MascotLayer.tsx` | Added a blink overlay (two simple eyelid shapes, randomized 2.8–5.2s cadence, seeded per-clip) composited on top of the video. | Wav2Lip only animates the mouth — everything else was frozen. This adds baseline "alive" motion independent of whether lip-sync succeeded. **Needs calibration**: the eye-band position is a first-pass estimate from the source SVG coordinates; Wav2Lip crops/warps the face during inference, so once you have a real rendered clip, scrub to a frame and nudge `BLINK_BAND` in the file until it lines up. |

## Before you consider this "done" — test checklist

- [ ] Confirm your Kaggle GPU accelerator is turned on for the session, and
      `torch.cuda.is_available()` returns `True` inside the same process
      that calls `generate_talking_mascot` (add a print/assert if unsure).
- [ ] Confirm `ffmpeg -encoders | grep vp9` shows `libvpx-vp9` available in
      your Kaggle environment's ffmpeg build — that's what the new alpha
      finalize step depends on. If it's missing, tell me and I'll switch
      the encoder to ProRes 4444 instead.
- [ ] Render one micro-lesson and open the resulting `.webm` mascot clip
      directly (not through Remotion) to confirm it's actually transparent
      — most video players show alpha as checkerboard or black; VLC and
      `ffplay` both handle WebM alpha correctly.
- [ ] Check `gpu_status.json` in the output lesson folder — `any_cpu_fallback_used`
      should be `false` for a real GPU render.
- [ ] Watch for `_validate_sfx_assets()` warnings in the console output — if
      they fire, regenerate real SFX via `remotion/scripts/generate-sfx.bat`.
- [ ] Scrub to a talking frame in the render and check the blink overlay is
      roughly aligned with the eyes — if not, adjust `BLINK_BAND` in
      `MascotLayer.tsx` as described in that file's comments.
- [ ] Confirm no bullet/chip text is still visually truncated — if it is,
      the storyboard prompt's new length caps may need tightening further,
      or send me the "chip row" card component so I can patch it directly.
