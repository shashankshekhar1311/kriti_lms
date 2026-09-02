# ==============================================================================
# Master Production Engine: Spatial Storyboard + Dynamic SDXL Story Backgrounds
# Place in: E:\Kriti\chapter_agent.py (or Chapter_Agent.py)
#
# CHANGED — PASS 1 (transparency + honesty pass, see lip_sync_service.py):
#   1. Mascot clips published as .webm (real alpha) instead of .mp4; the old
#      alpha-destroying concat-into-one-file step is skipped.
#   2. Per-lesson gpu_status.json aggregation from lip_sync_service sidecars.
#   3. _validate_sfx_assets() warns if pop/swoosh/chime.mp3 are near-silent.
#   4. Storyboard prompt caps title/item/chip character length.
#
# CHANGED — PASS 2 (this pass — coverage & duration):
#   5. Micro-lesson narration target raised from 300-350 words (~2-2.5 min)
#      to NARRATION_WORDS_MIN-NARRATION_WORDS_MAX words (~3-4 min).
#   6. Lesson COUNT is no longer hard-capped at "2 to 3" — the prompt now
#      asks the model to identify every major topic in the chapter and
#      produce one lesson per topic/cluster, with no artificial ceiling.
#   7. Panel COUNT is no longer hard-capped at 4 (panels_to_visual_events_precise
#      used to silently discard everything past panels[:4]), and no longer
#      indexes into a fixed 4-slot SPATIAL_PHASES table (which would have
#      raised IndexError the moment a lesson legitimately needed a 5th or
#      6th panel). Replaced with `_phase_defaults(idx, total)`, which
#      produces sensible mascot pose/position defaults for any panel count
#      from MIN_PANELS_PER_LESSON to MAX_PANELS_PER_LESSON.
#   8. NEW: a free (no extra API call), heuristic post-generation coverage
#      check — _extract_key_terms() pulls likely named topics out of the
#      source PDF text, _find_missing_terms() checks whether each one shows
#      up anywhere in the combined narration across all generated lessons.
#      If (and only if) something is missing, exactly ONE additional
#      Anthropic call (generate_gap_fill_lesson) generates a single
#      supplementary micro-lesson that specifically covers the gap, which
#      then runs through the same pipeline (audio, mascot, Remotion render)
#      as every other lesson. No API call is spent if nothing is missing.
# ==============================================================================
import os
import sys
import json
import time
import re
import random
import shutil
import unicodedata
import warnings
import argparse
import asyncio
import subprocess
import tempfile
from pathlib import Path
from dotenv import load_dotenv

warnings.filterwarnings("ignore")

# Dynamic Image Generation Import
try:
    import torch
    from diffusers import AutoPipelineForText2Image
except ImportError:
    torch = None
    AutoPipelineForText2Image = None

# Background Removal Import
try:
    from rembg import remove
    from PIL import Image
except ImportError:
    remove = None
    Image = None

# Conditional Provider SDK Imports
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

try:
    import anthropic
except ImportError:
    anthropic = None

try:
    import openai
except ImportError:
    openai = None

try:
    import json_repair
except ImportError:
    json_repair = None

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    import edge_tts
except ImportError:
    edge_tts = None

# ------------------------------------------------------------------------------
# 1. ENVIRONMENT & PATH SETUP
# ------------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH)

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from lip_sync_service import (  # noqa: E402
    VALID_POSES,
    generate_talking_mascot,
    resolve_lip_sync_mode,
    resolve_mascot_dir,
    resolve_pose_image,
)
from lesson_sync import (  # noqa: E402
    align_storyboard_panels,
    audit_panel_coverage,
    is_storyboard_complete,
    split_timeline_cues,
)
from artifact_config import (  # noqa: E402
    artifacts_enabled_for_subject,
    build_chapter_id,
    copy_artifact_assets_to_public,
    format_manifest_for_prompt,
    load_chapter_manifest,
    resolve_panel_artifact_fields,
    resolve_subject_key,
    should_skip_sdxl_for_beat,
)
from pdf_artifact_extractor import ensure_chapter_artifacts_from_pdf  # noqa: E402

CUSTOM_TEMP = BASE_DIR / "temp"
CUSTOM_TEMP.mkdir(exist_ok=True)
os.environ["TEMP"] = str(CUSTOM_TEMP)
os.environ["TMP"] = str(CUSTOM_TEMP)
tempfile.tempdir = str(CUSTOM_TEMP)

SOURCE_BOOKS_DIR = BASE_DIR / "Source_Books"
RENDERED_OUTPUT_DIR = BASE_DIR / "Rendered_Output"
ASSETS_DIR = BASE_DIR / "assets" / "mascots"
REMOTION_DIR = BASE_DIR / "remotion"
REMOTION_PUBLIC_DIR = REMOTION_DIR / "public"

MASCOT_VOICES = {
    "gyanu": "en-US-AndrewMultilingualNeural",
    "kito": "en-US-BrianNeural",
    "chirp": "en-IN-NeerjaNeural",
    "arya": "en-US-GuyNeural",
    # CHANGED — new mascot: Volt (original squirrel gadget-hero, see
    # assets/mascots/volt/DESIGN_TOKENS.md). Distinct voice from Gyanu/Kito/
    # Arya so a "choose your mascot" screen doesn't sound identical.
    "volt": "en-US-ChristopherNeural",
}
VOICE_ALIASES = {
    "en-IN-JennyNeural": "en-US-AndrewMultilingualNeural",
    "en-IN-Jenny": "en-US-AndrewMultilingualNeural",
}
TTS_FALLBACK_VOICES = (
    "en-US-AndrewMultilingualNeural",
    "en-US-BrianNeural",
    "en-US-JennyNeural",
    "en-IN-NeerjaNeural",
)

TTS_TICKS_PER_SECOND = 10_000_000
CANVAS_WIDTH = 1920
CANVAS_HEIGHT = 1080

MASCOT_CLIP_EXT = "webm"

NARRATION_WORDS_MIN = 450
NARRATION_WORDS_MAX = 600

MIN_PANELS_PER_LESSON = 2
MAX_PANELS_PER_LESSON = 6

PHASE_TO_EVENT_TYPE = {
    "intro": "intro",
    "concept": "concept_card",
    "concept_card": "concept_card",
    "place_value_grid": "concept_card",
    "worked example": "math_step",
    "worked_example": "math_step",
    "math_step": "math_step",
    "summary": "summary_badge",
    "recap": "summary_badge",
    "summary_badge": "summary_badge",
}
VALID_EVENT_TYPES = {"intro", "concept_card", "math_step", "summary_badge"}

MAX_TITLE_CHARS = 42
MAX_ITEM_CHARS = 30
MAX_CHIP_CHARS = 20

REQUIRED_TOOLS = ["ffmpeg", "ffprobe", "npx"]
missing_tools = [tool for tool in REQUIRED_TOOLS if shutil.which(tool) is None]
if edge_tts is None and shutil.which("edge-tts") is None:
    missing_tools.append("edge-tts")

if missing_tools:
    print(f"\n❌ SYSTEM DEPENDENCY ERROR: Missing CLI tools in PATH: {missing_tools}")
    sys.exit(1)

if not (REMOTION_DIR / "package.json").is_file():
    print(f"\n❌ Remotion project not found at: {REMOTION_DIR}")
    sys.exit(1)

_SDXL_PIPE = None

# ------------------------------------------------------------------------------
# 2. DYNAMIC BACKGROUND GENERATOR & REMBG INTEGRATION
# ------------------------------------------------------------------------------
def ensure_transparent_mascot(input_path: Path) -> Path:
    input_path = Path(input_path)
    if not input_path.is_file():
        return input_path

    transparent_path = input_path.parent / f"{input_path.stem}_nobg.png"
    if transparent_path.is_file() and transparent_path.stat().st_size > 1000:
        return transparent_path

    if remove is None or Image is None:
        print("   ⚠️ rembg/PIL not installed. Skipping automatic background removal.")
        return input_path

    try:
        print(f"   ✂️ Removing background from mascot still: {input_path.name}")
        img = Image.open(input_path)
        no_bg = remove(img)
        transparent_path.parent.mkdir(parents=True, exist_ok=True)
        no_bg.save(transparent_path, format="PNG")
        return transparent_path
    except Exception as err:
        print(f"   ⚠️ Background removal failed: {err}")
        return input_path

def generate_story_background(prompt_text: str, output_path: Path):
    global _SDXL_PIPE
    output_path = Path(output_path)
    if output_path.is_file() and output_path.stat().st_size > 10_000:
        print(f"   🎨 Reusing background image: {output_path.name}")
        return output_path

    print(f"   🎨 Generating dynamic story background...")
    print(f"      Prompt: '{prompt_text[:90]}...'")

    if AutoPipelineForText2Image is None or torch is None or not torch.cuda.is_available():
        print("   ⚠️ GPU or diffusers unavailable. Creating solid dark fallback background.")
        _create_fallback_background(output_path)
        return output_path

    try:
        if _SDXL_PIPE is None:
            _SDXL_PIPE = AutoPipelineForText2Image.from_pretrained(
                "stabilityai/sdxl-turbo",
                torch_dtype=torch.float16,
                variant="fp16",
            ).to("cuda")

        image = _SDXL_PIPE(
            prompt=f"{prompt_text}, cinematic lighting, photorealistic digital art, soft background blur, 8k --no text --no people",
            num_inference_steps=2,
            guidance_scale=0.0,
            width=1024,
            height=576,
        ).images[0]

        image = image.resize((1920, 1080))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path, quality=92)
        print(f"   ✅ Saved background to {output_path.name}")
    except Exception as err:
        print(f"   ⚠️ SDXL generation failed: {err}. Writing fallback background.")
        _create_fallback_background(output_path)

    return output_path

def _create_fallback_background(output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", "color=c=0f172a:s=1920x1080:d=1",
        "-frames:v", "1",
        str(output_path),
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# ------------------------------------------------------------------------------
# 3. JSON REPAIR & TIMELINE NORMALIZERS
# ------------------------------------------------------------------------------
def clean_and_parse_json(raw_text):
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\n?```$", "", text)
    text = text.strip()

    try:
        return json.loads(text, strict=False)
    except Exception:
        pass

    if json_repair:
        try:
            parsed = json_repair.loads(text)
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed
            if isinstance(parsed, dict):
                return parsed.get("lessons", [parsed])
        except Exception:
            pass

    print(f"❌ RAW RESPONSE THAT FAILED JSON PARSING:\n{text[:600]}...\n")
    raise ValueError("Could not parse or repair JSON response from AI provider.")

def extract_pdf_text(pdf_path):
    if PdfReader is None:
        raise RuntimeError("pypdf is required. Run: pip install pypdf")
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted + "\n"
    return text

def ensure_lesson_list(raw_lessons):
    if isinstance(raw_lessons, dict):
        for key in ["lessons", "micro_lessons", "storyboard", "data", "items"]:
            if key in raw_lessons and isinstance(raw_lessons[key], list):
                raw_lessons = raw_lessons[key]
                break
        else:
            raw_lessons = [raw_lessons]

    if isinstance(raw_lessons, list) and len(raw_lessons) > 0 and isinstance(raw_lessons[0], list):
        raw_lessons = raw_lessons[0]

    cleaned = []
    if isinstance(raw_lessons, list):
        for item in raw_lessons:
            if isinstance(item, list):
                cleaned.extend([x for x in item if isinstance(x, dict)])
            elif isinstance(item, dict):
                cleaned.append(item)

    return cleaned

def _as_question_list(raw_quiz):
    if isinstance(raw_quiz, list):
        return [q for q in raw_quiz if isinstance(q, dict)]
    if isinstance(raw_quiz, dict):
        for key in ("item_pool", "questions", "quiz", "initial_quiz"):
            pool = raw_quiz.get(key)
            if isinstance(pool, list):
                return [q for q in pool if isinstance(q, dict)]
        if "question" in raw_quiz:
            return [raw_quiz]
    return []

def _normalize_event_type(raw_type, phase_hint="", fallback="intro"):
    token = str(raw_type or phase_hint or fallback).strip().lower().replace("-", "_")
    token = re.sub(r"\s+", " ", token)
    compact = token.replace(" ", "_")
    if token in VALID_EVENT_TYPES:
        return token
    if compact in VALID_EVENT_TYPES:
        return compact
    if token in PHASE_TO_EVENT_TYPE:
        return PHASE_TO_EVENT_TYPE[token]
    if compact in PHASE_TO_EVENT_TYPE:
        return PHASE_TO_EVENT_TYPE[compact]
    return PHASE_TO_EVENT_TYPE.get(str(fallback).strip().lower(), "intro")

def _normalize_mascot_pose(raw_pose, fallback="talking"):
    token = str(raw_pose or fallback).strip().lower().replace("-", "_")
    aliases = {
        "talk": "talking",
        "speak": "talking",
        "speaking": "talking",
        "idle": "neutral",
        "point": "pointing",
        "smile": "happy",
        "celebrate": "happy",
    }
    token = aliases.get(token, token)
    return token if token in VALID_POSES else fallback

def _clean_items(items):
    if items is None:
        return []
    if not isinstance(items, list):
        items = [items]
    cleaned = []
    for item in items:
        if isinstance(item, (int, float)) and not isinstance(item, bool):
            cleaned.append(int(item) if float(item).is_integer() else str(item))
        else:
            cleaned.append(str(item))
    return cleaned

def _as_xy(raw, fallback):
    if not isinstance(raw, dict):
        return dict(fallback)
    result = dict(fallback)
    if "x" in raw:
        result["x"] = float(raw["x"])
    if "y" in raw:
        result["y"] = float(raw["y"])
    if "scale" in raw:
        result["scale"] = float(raw["scale"])
    return result

def world_to_canvas(pos, include_scale=False, default_scale=1.0):
    x = float(pos.get("x", 0))
    y = float(pos.get("y", 0))
    looks_absolute = abs(x) > 700 or abs(y) > 500
    if looks_absolute:
        canvas = {"x": round(x, 1), "y": round(y, 1)}
    else:
        canvas = {
            "x": round(CANVAS_WIDTH / 2 + x, 1),
            "y": round(CANVAS_HEIGHT / 2 - y, 1),
        }
    if include_scale:
        canvas["scale"] = float(pos.get("scale", default_scale))
    return canvas


def _phase_defaults(idx: int, total: int) -> dict:
    is_first = idx == 0
    is_last = idx == total - 1

    if is_first:
        event_type = "intro"
        pose = "talking"
        scale = 1.0
    elif is_last:
        event_type = "summary_badge"
        pose = "happy"
        scale = 1.05
    else:
        event_type = "concept_card"
        pose = "pointing" if idx % 2 == 0 else "neutral"
        scale = 1.0

    return {
        "event_type": event_type,
        "mascot_pose": pose,
        "mascot": {"x": 550, "y": -250, "scale": scale},
        "card": {"x": -350, "y": 0},
        "glowing_badge": is_last,
    }


def panels_to_visual_events_precise(
    panels,
    narration_timeline,
    lesson_dir,
    *,
    artifacts_enabled=False,
    chapter_manifest=None,
):
    raw_panels = panels if isinstance(panels, list) else []
    if len(raw_panels) > MAX_PANELS_PER_LESSON:
        print(
            f"   ⚠️ Lesson requested {len(raw_panels)} panels, capping at "
            f"MAX_PANELS_PER_LESSON={MAX_PANELS_PER_LESSON}. Consider raising "
            f"that constant if this happens often."
        )
        raw_panels = raw_panels[:MAX_PANELS_PER_LESSON]

    total_sentences = len(narration_timeline)
    total_panels = len(raw_panels)

    events = []
    chunk_size = max(1, total_sentences // max(1, total_panels))

    for idx, panel in enumerate(raw_panels):
        start_sentence_idx = min(idx * chunk_size, total_sentences - 1)
        end_sentence_idx = (
            min((idx + 1) * chunk_size - 1, total_sentences - 1)
            if idx < total_panels - 1
            else total_sentences - 1
        )

        start_time = float(narration_timeline[start_sentence_idx]["start_time"])
        end_time = float(narration_timeline[end_sentence_idx]["end_time"])

        defaults = _phase_defaults(idx, total_panels)

        phase_raw = panel.get("phase") or defaults["event_type"]
        raw_type = panel.get("type") or panel.get("card_type") or phase_raw

        event_type = _normalize_event_type(raw_type, phase_hint=phase_raw, fallback=defaults["event_type"])

        artifact_fields = resolve_panel_artifact_fields(
            panel,
            artifacts_enabled=artifacts_enabled,
            manifest=chapter_manifest,
            lesson_dir=Path(lesson_dir),
        )
        has_artifact = bool(artifact_fields.get("artifact_image_url"))
        visual_mode = artifact_fields.get("visual_mode", "generated")

        bg_filename = f"bg_phase_{idx + 1}.jpg"
        if should_skip_sdxl_for_beat(visual_mode, has_artifact=has_artifact):
            print(f"   🖼️ Artifact beat {idx + 1} — skipping SDXL ({bg_filename})")
            _create_fallback_background(lesson_dir / bg_filename)
        else:
            generate_story_background(panel.get("bg_prompt", ""), lesson_dir / bg_filename)

        event = {
            "type": event_type,
            "start_time": start_time,
            "end_time": end_time,
            "title": str(panel.get("title", f"Phase {idx + 1}")),
            "items": _clean_items(panel.get("items", [])),
            "mascot_pose": _normalize_mascot_pose(panel.get("mascot_pose"), defaults["mascot_pose"]),
            "mascot_position": world_to_canvas(
                _as_xy(panel.get("mascot_position"), defaults["mascot"]),
                include_scale=True,
                default_scale=defaults["mascot"].get("scale", 1.0)
            ),
            "card_position": world_to_canvas(_as_xy(panel.get("card_position"), defaults["card"])),
            "glowing_badge": bool(panel.get("glowing_badge", defaults["glowing_badge"])),
            "bg_image_url": bg_filename
        }
        event.update(artifact_fields)
        events.append(event)
    return events

def normalize_storyboard(lesson):
    if not isinstance(lesson, dict):
        return "", "", "", [], []

    lesson_title = ""
    for k in ["lesson_title", "title", "name"]:
        if k in lesson and isinstance(lesson[k], str) and lesson[k].strip():
            lesson_title = lesson[k].strip()
            break

    background_prompt = lesson.get("background_prompt", "")

    narration_text = ""
    for k in ["narration_text", "narration", "script", "audio_script", "speech", "text"]:
        if k in lesson and isinstance(lesson[k], str) and len(lesson[k].strip()) > 10:
            narration_text = lesson[k].strip()
            break

    panels = lesson.get("panels")
    if not isinstance(panels, list):
        panels = lesson.get("keyframes") if isinstance(lesson.get("keyframes"), list) else []
    if not isinstance(panels, list):
        panels = lesson.get("visual_events") if isinstance(lesson.get("visual_events"), list) else []

    initial_quiz = []
    for k in ["initial_quiz", "quiz_json", "quiz", "quiz_questions", "questions", "item_pool"]:
        if k in lesson:
            initial_quiz = _as_question_list(lesson[k])
            if initial_quiz:
                break

    return lesson_title, background_prompt, narration_text, panels, initial_quiz


# ------------------------------------------------------------------------------
# 3b. Self-healing coverage check
# ------------------------------------------------------------------------------
_HEADING_STOPWORDS = {
    "The", "This", "That", "These", "Those", "Chapter", "Figure", "Fig",
    "Let", "What", "How", "Why", "Do", "In", "It", "We", "You", "Notice",
    "Think", "About", "And", "But", "Who", "When", "Where", "Which",
    "There", "Here", "Also", "Its", "His", "Her", "They", "Their",
    "Class", "Page", "Grade", "Reprint", "Exploring", "Society", "Part",
}


def _normalize_for_match(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(c for c in nfkd if not unicodedata.combining(c))
    return ascii_text.lower()


def _extract_key_terms(pdf_text: str, max_terms: int = 24) -> list:
    pattern = r"\b([A-Z][\w\u00C0-\u024F\u1E00-\u1EFF]*(?:\s+[A-Z][\w\u00C0-\u024F\u1E00-\u1EFF]*){0,2})"
    candidates = re.findall(pattern, pdf_text)

    counts = {}
    for raw in candidates:
        words = raw.split()
        while words and words[0] in _HEADING_STOPWORDS:
            words = words[1:]
        if not words:
            continue
        term = " ".join(words)
        if len(term) < 4:
            continue
        counts[term] = counts.get(term, 0) + 1

    scored = [(term, n) for term, n in counts.items() if n >= 2 or " " in term]
    scored.sort(key=lambda pair: -pair[1])

    seen_norm = set()
    terms = []
    for term, _ in scored:
        norm = _normalize_for_match(term)
        if norm in seen_norm:
            continue
        seen_norm.add(norm)
        terms.append(term)
        if len(terms) >= max_terms:
            break
    return terms


def _find_missing_terms(key_terms, all_narration_text: str) -> list:
    haystack = _normalize_for_match(all_narration_text)
    missing = []
    for term in key_terms:
        needle = _normalize_for_match(term)
        if needle and needle not in haystack:
            missing.append(term)
    return missing


def build_gap_fill_prompt(class_name, student_name, existing_lessons, missing_terms):
    student = student_name or "Rahul"
    existing_summary = "\n".join(
        f"- {l.get('lesson_title') or l.get('title') or 'Untitled'}: "
        f"{(l.get('narration_text') or l.get('narration') or '')[:200]}..."
        for l in existing_lessons
        if isinstance(l, dict)
    )
    terms_list = ", ".join(missing_terms)
    return f"""
    You are the Senior Spatial Storyboard Director for Kriti School's Drona Engine.

    A chapter has already been broken into these micro-lessons:
    {existing_summary}

    An automated coverage check found these topics/names from the source chapter
    that do NOT appear to be covered by any lesson above:
    {terms_list}

    Generate EXACTLY ONE additional micro-lesson that specifically covers these
    missing topics, in the same warm, conversational storytelling style speaking
    directly to {student}. Do not repeat material already covered above — this
    lesson exists purely to fill the gap.

    STRICT TIME & WORD CAP MANDATE:
    - Narration script MUST be between {NARRATION_WORDS_MIN} and {NARRATION_WORDS_MAX} words.

    STRICT ON-SCREEN TEXT LENGTH MANDATE (prevents mid-word truncation in the video UI):
    - Every "title" string MUST be {MAX_TITLE_CHARS} characters or fewer.
    - Every string inside "items" MUST be {MAX_ITEM_CHARS} characters or fewer.
    - Chip/label-style short phrases MUST be {MAX_CHIP_CHARS} characters or fewer.

    NARRATION-TO-CARD ALIGNMENT:
    - Each panel's "items" must list every named term spoken in that panel's narration portion.
    - Use 3–6 separate items per concept_card; one chip per fact/name.
    - Keep narration sentences under 100 characters when possible.

    PANEL COUNT: use between {MIN_PANELS_PER_LESSON} and {MAX_PANELS_PER_LESSON}
    panels — one panel per distinct missing topic, not merged together. Each
    panel needs: "phase", "bg_prompt", "title", "items" (array of short strings),
    and optionally "type" (one of: intro, concept_card, math_step, summary_badge)
    and "mascot_pose" (one of: talking, neutral, pointing, happy).

    Return ONLY a single valid JSON OBJECT (not an array) matching:
    {{
      "lesson_title": "string",
      "narration_text": "string ({NARRATION_WORDS_MIN}-{NARRATION_WORDS_MAX} words)",
      "panels": [
        {{"phase": "Intro", "bg_prompt": "...", "title": "...", "items": ["..."]}}
      ],
      "initial_quiz": []
    }}
    """


def generate_gap_fill_lesson(pdf_text, existing_lessons, missing_terms, provider, class_name, student_name):
    prompt = build_gap_fill_prompt(class_name, student_name, existing_lessons, missing_terms)
    provider = provider.lower()

    if provider == "anthropic":
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        if not anthropic_key:
            raise RuntimeError("ANTHROPIC_API_KEY missing in .env")
        client = anthropic.Anthropic(api_key=anthropic_key)

        anthropic_candidates = ["claude-sonnet-4-6", "claude-3-5-sonnet-20241022"]
        res = None
        for model_id in anthropic_candidates:
            try:
                res = client.messages.create(
                    model=model_id,
                    max_tokens=4096,
                    messages=[{
                        "role": "user",
                        "content": (
                            f"PDF TEXT CONTENT:\n{pdf_text[:15000]}\n\n"
                            f"PROMPT:\n{prompt}\n\n"
                            f"RETURN ONLY VALID UNWRAPPED JSON OBJECT."
                        ),
                    }],
                )
                break
            except anthropic.NotFoundError:
                continue
        if res is None:
            raise RuntimeError("Gap-fill generation failed: all candidate Anthropic models failed.")
        parsed = clean_and_parse_json(res.content[0].text)

    elif provider == "gemini":
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            raise RuntimeError("GEMINI_API_KEY missing in .env")
        client = genai.Client(api_key=gemini_key)
        res = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=[f"PDF TEXT CONTENT:\n{pdf_text[:15000]}\n\nPROMPT:\n{prompt}"],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
                max_output_tokens=4096,
            ),
        )
        parsed = clean_and_parse_json(res.text)

    else:
        raise RuntimeError(f"Gap-fill generation is not implemented for provider={provider!r}")

    if isinstance(parsed, list):
        parsed = parsed[0] if parsed else {}
    return parsed if isinstance(parsed, dict) else {}


# ------------------------------------------------------------------------------
# 4. LLM GENERATION & QUIZ EXPANSION ENGINE
# ------------------------------------------------------------------------------
def generate_micro_lessons(pdf_path, prompt, provider="anthropic", cache_file=None):
    if cache_file and cache_file.exists():
        print(f"💾 Found cached AI output at [{cache_file.name}]. Skipping API call! (Saving Credits)")
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)

    provider = provider.lower()
    lessons = None

    if provider == "anthropic":
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        if not anthropic_key:
            raise RuntimeError("ANTHROPIC_API_KEY missing in .env")
        client = anthropic.Anthropic(api_key=anthropic_key)
        pdf_text = extract_pdf_text(pdf_path)

        anthropic_candidates = ["claude-sonnet-4-6", "claude-3-5-sonnet-20241022"]
        res = None
        for model_id in anthropic_candidates:
            try:
                print(f"🤖 Requesting generation via Anthropic model: [{model_id}]...")
                res = client.messages.create(
                    model=model_id,
                    max_tokens=8192,
                    messages=[
                        {
                            "role": "user",
                            "content": f"PDF TEXT CONTENT:\n{pdf_text[:15000]}\n\nPROMPT:\n{prompt}\n\nRETURN ONLY VALID UNWRAPPED JSON ARRAY."
                        }
                    ]
                )
                break
            except anthropic.NotFoundError:
                print(f"⚠️ Model [{model_id}] returned 404. Trying next candidate...")

        if res is None:
            raise RuntimeError("❌ All candidate Anthropic models failed.")

        lessons = clean_and_parse_json(res.content[0].text)

    elif provider == "gemini":
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            raise RuntimeError("GEMINI_API_KEY missing in .env")
        client = genai.Client(api_key=gemini_key)
        uploaded_file = client.files.upload(file=str(pdf_path))
        print("🤖 Requesting generation via model: [gemini-3.6-flash]...")
        res = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=[uploaded_file, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
                max_output_tokens=8192
            )
        )
        lessons = clean_and_parse_json(res.text)

    if cache_file and lessons:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(lessons, f, indent=2)
        print(f"💾 Cached API response to [{cache_file.name}]")

    return lessons

def expand_quiz_item_pool(lesson_title, pdf_text, initial_quiz, provider="anthropic"):
    current_pool = _as_question_list(initial_quiz)
    needed = 20 - len(current_pool)
    if needed <= 0:
        randomized = current_pool[:20]
        random.shuffle(randomized)
        return {"item_pool": randomized}

    print(f"   🎯 Expanding Quiz Pool: Generating {needed} extra questions (Target: 20 Items)...")

    prompt = f"""
    You are a Class 7 Mathematics Assessment Expert for Kriti School.
    Generate EXACTLY {needed} diverse practice quiz questions for Class 7 students on topic: "{lesson_title}".

    PDF CONTEXT REFERENCE:
    {pdf_text[:6000]}

    REQUIREMENTS:
    - Questions must cover numerical calculations, place value concepts, comparison word problems, and short-answer items.
    - Difficulty levels: Mix of 'easy', 'medium', and 'hard'.
    - Output format MUST be a valid JSON array of objects.
    - Each object must include:
      "id": integer starting at {len(current_pool) + 1},
      "type": "numerical" or "conceptual",
      "question": "Question text here",
      "correct_answer": "Answer here",
      "explanation": "Brief explanation",
      "difficulty": "easy" / "medium" / "hard"

    RETURN ONLY THE VALID UNWRAPPED JSON ARRAY.
    """

    extra_questions = []
    try:
        if provider == "anthropic":
            client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            res = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}]
            )
            extra_questions = clean_and_parse_json(res.content[0].text)
        elif provider == "gemini":
            client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
            res = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[prompt],
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            extra_questions = clean_and_parse_json(res.text)
    except Exception as e:
        print(f"   ⚠️ Quiz expansion warning: {e}. Falling back to initial pool.")

    if isinstance(extra_questions, list):
        current_pool.extend(extra_questions)
    elif isinstance(extra_questions, dict) and "item_pool" in extra_questions:
        current_pool.extend(extra_questions["item_pool"])

    randomized = current_pool[:20]
    random.shuffle(randomized)
    return {"item_pool": randomized}

# ------------------------------------------------------------------------------
# 5. TTS TIMESTAMPS, GPU LIP-SYNC & REMOTION RENDER
# ------------------------------------------------------------------------------
def get_media_duration(file_path):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(file_path)
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    return float(res.stdout.strip())

def split_narration_sentences(narration_text):
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', narration_text) if len(s.strip()) > 3]
    if not sentences:
        sentences = [narration_text.strip()]
    return sentences

def resolve_tts_voice(voice):
    return VOICE_ALIASES.get(voice, voice)

def _tts_voice_candidates(preferred):
    ordered = [resolve_tts_voice(preferred)]
    for fallback in TTS_FALLBACK_VOICES:
        if fallback not in ordered:
            ordered.append(fallback)
    return ordered

def _ticks_to_seconds(value):
    return float(value) / TTS_TICKS_PER_SECOND

def _round_cue(text, start, end):
    return {
        "text": str(text).strip(),
        "start_time": round(max(0.0, float(start)), 3),
        "end_time": round(max(float(start) + 0.05, float(end)), 3),
    }

def _group_word_cues(cues):
    sentences = []
    words = []
    start = None
    end = None
    for cue in cues:
        token = cue["text"]
        if start is None:
            start = cue["start_time"]
        words.append(token)
        end = cue["end_time"]
        if re.search(r'[.!?]"?$', token):
            sentences.append(_round_cue(" ".join(words), start, end))
            words, start, end = [], None, None
    if words and start is not None:
        sentences.append(_round_cue(" ".join(words), start, end if end is not None else start))
    return sentences

def _cues_to_timeline(cues):
    if not cues:
        return []
    kinds = {c.get("kind") for c in cues}
    if kinds == {"WordBoundary"}:
        return _group_word_cues(cues)
    return [_round_cue(c["text"], c["start_time"], c["end_time"]) for c in cues if c.get("text")]

def parse_srt_timeline(srt_text):
    pattern = re.compile(
        r"(\d+)\s+(\d{2}):(\d{2}):(\d{2})[,.](\d+)\s+-->\s+(\d{2}):(\d{2}):(\d{2})[,.](\d+)\s+(.*?)(?=\n\s*\n|\Z)",
        re.S,
    )
    timeline = []
    for match in pattern.finditer(srt_text.strip() + "\n\n"):
        def stamp(h, m, s, frac):
            ms = int((frac + "000")[:3])
            return int(h) * 3600 + int(m) * 60 + int(s) + ms / 1000.0
        text = re.sub(r"\s+", " ", match.group(10)).strip()
        if not text:
            continue
        timeline.append(_round_cue(
            text,
            stamp(*match.group(2, 3, 4, 5)),
            stamp(*match.group(6, 7, 8, 9)),
        ))
    return timeline

async def _edge_tts_stream_narration(text, dest, voice):
    proxy = os.getenv("EDGE_TTS_PROXY") or None
    communicate = edge_tts.Communicate(
        text,
        voice,
        proxy=proxy,
        boundary="SentenceBoundary",
    )
    cues = []
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                start = _ticks_to_seconds(chunk["offset"])
                end = _ticks_to_seconds(chunk["offset"] + chunk["duration"])
                cues.append({
                    "kind": chunk["type"],
                    "text": (chunk.get("text") or "").strip(),
                    "start_time": start,
                    "end_time": end,
                })
    return cues

def _cli_tts_with_srt(text, dest, voice):
    srt_path = Path(dest).with_suffix(".srt")
    cmd = [
        "edge-tts",
        "--text", text,
        "--voice", voice,
        "--write-media", str(dest),
        "--write-subtitles", str(srt_path),
    ]
    proxy = os.getenv("EDGE_TTS_PROXY")
    if proxy:
        cmd.extend(["--proxy", proxy])
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "").strip() or f"exit {result.returncode}")
    timeline = []
    if srt_path.is_file():
        timeline = parse_srt_timeline(srt_path.read_text(encoding="utf-8"))
        srt_path.unlink(missing_ok=True)
    return timeline

def synthesize_narration_timeline(narration_text, voice, lesson_dir, attempts=3):
    dest = lesson_dir / "narration.mp3"
    last_error = None
    used_voice = resolve_tts_voice(voice)

    for candidate in _tts_voice_candidates(voice):
        for attempt in range(1, attempts + 1):
            if dest.exists():
                dest.unlink()
            try:
                if edge_tts is not None:
                    cues = asyncio.run(_edge_tts_stream_narration(narration_text, dest, candidate))
                    timeline = _cues_to_timeline(cues)
                else:
                    timeline = _cli_tts_with_srt(narration_text, dest, candidate)
                if dest.is_file() and dest.stat().st_size > 0:
                    used_voice = candidate
                    if candidate != resolve_tts_voice(voice):
                        print(f"   ⚠️ TTS voice fallback: {voice} → {candidate}")
                    if not timeline:
                        timeline = _timeline_from_probe(narration_text, dest)
                    return dest, timeline, used_voice
            except Exception as err:
                last_error = err
                time.sleep(1.2 * attempt)

    raise RuntimeError(
        f"edge-tts produced no timestamped audio for voice {voice}. Last error: {last_error}."
    )

def _timeline_from_probe(narration_text, audio_path):
    sentences = split_narration_sentences(narration_text)
    total = max(get_media_duration(audio_path), 0.4)
    weights = [max(len(s), 1) for s in sentences]
    weight_sum = sum(weights)
    cursor = 0.0
    timeline = []
    for sentence, weight in zip(sentences, weights):
        dur = total * (weight / weight_sum)
        timeline.append(_round_cue(sentence, cursor, cursor + dur))
        cursor += dur
    if timeline:
        timeline[-1]["end_time"] = round(total, 3)
    return timeline

def resolve_mascot_pose_dir(mascot_name):
    try:
        return resolve_mascot_dir(mascot_name=mascot_name, hint=ASSETS_DIR / mascot_name.lower())
    except FileNotFoundError:
        return resolve_mascot_dir(mascot_name="gyanu", hint=ASSETS_DIR / "gyanu")

def resolve_mascot_image(mascot_name, pose_type="talking", *, lip_sync_mode=None):
    mascot_dir = resolve_mascot_pose_dir(mascot_name)
    mode = lip_sync_mode or resolve_lip_sync_mode(
        mascot_dir,
        force_presenter=_presenter_mode_enabled(),
    )
    prefer_photo = mode == "wav2lip"

    selected_file = resolve_pose_image(
        mascot_image_path=mascot_dir,
        pose_type=pose_type,
        mascot_name=mascot_name,
        prefer_photographic_avatar=prefer_photo,
    )
    return ensure_transparent_mascot(selected_file)


def _presenter_mode_enabled() -> bool:
    return (os.getenv("LIP_SYNC_PRESENTER_MODE", "") or "").strip().lower() in {
        "1",
        "true",
        "yes",
    }

def extract_audio_segment(src_audio, dest, start_time, end_time):
    duration = max(0.25, float(end_time) - float(start_time))
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{max(0.0, float(start_time)):.3f}",
        "-i", str(src_audio),
        "-t", f"{duration:.3f}",
        "-ac", "1",
        "-ar", "24000",
        "-c:a", "libmp3lame",
        "-q:a", "4",
        str(dest),
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0 or not dest.is_file() or dest.stat().st_size == 0:
        raise RuntimeError(f"ffmpeg audio slice failed for {dest.name}: {(result.stderr or '')[-400:]}")
    return dest

def concat_mascot_clips(clip_paths, output_path):
    """DEPRECATED for mascot clips: re-encoding through libx264 here destroys
    any alpha channel produced by lip_sync_service.py. Do not wire this back
    into produce_comic_lesson() for mascot clips.
    """
    output_path = Path(output_path)
    list_file = output_path.parent / "mascot_concat.txt"
    with open(list_file, "w", encoding="utf-8") as handle:
        for clip in clip_paths:
            escaped = str(Path(clip).resolve()).replace("\\", "/").replace("'", r"'\''")
            handle.write(f"file '{escaped}'\n")
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        str(output_path),
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if list_file.exists():
        list_file.unlink()
    if result.returncode != 0 or not output_path.is_file():
        raise RuntimeError(f"ffmpeg mascot concat failed: {(result.stderr or '')[-400:]}")
    return output_path


def _is_effectively_silent(path: Path, floor_db: float = -50.0) -> bool:
    path = Path(path)
    if not path.is_file():
        return True
    cmd = [
        "ffmpeg", "-i", str(path),
        "-af", "volumedetect",
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
    match = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB", result.stderr or "")
    if not match:
        return False
    return float(match.group(1)) <= floor_db


def _validate_sfx_assets():
    sfx_dir = REMOTION_PUBLIC_DIR / "sfx"
    for name in ("pop.mp3", "swoosh.mp3", "chime.mp3"):
        candidate = sfx_dir / name
        if not candidate.is_file():
            print(f"   ⚠️ SFX missing: {candidate} — cards/beats using it will render silent.")
            continue
        try:
            if _is_effectively_silent(candidate):
                print(
                    f"   ⚠️ SFX '{name}' is near-silent — this looks like the setup "
                    f"script's placeholder fallback, not a real sound effect. "
                    f"Re-run remotion/scripts/generate-sfx.bat (or the ffmpeg synth "
                    f"commands in it) to produce real tones before this render is final."
                )
        except Exception as exc:
            print(f"   ⚠️ Could not probe SFX '{name}' for silence: {exc}")


def _aggregate_gpu_status(clip_paths, lesson_dir):
    statuses = []
    any_fallback = False
    for clip_path in clip_paths:
        sidecar = Path(clip_path).with_suffix(Path(clip_path).suffix + ".status.json")
        if sidecar.is_file():
            try:
                data = json.loads(sidecar.read_text(encoding="utf-8"))
            except Exception:
                data = {"error": "could not parse status sidecar"}
        else:
            data = {"error": "no status sidecar found"}
        data["clip"] = Path(clip_path).name
        if data.get("used_fallback"):
            any_fallback = True
        statuses.append(data)

    summary = {"any_cpu_fallback_used": any_fallback, "clips": statuses}
    out_path = Path(lesson_dir) / "gpu_status.json"
    out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    if any_fallback:
        print(
            f"   ⚠️ At least one mascot clip in this lesson used the CPU bounce "
            f"fallback (no GPU lip movement). See {out_path.name} for details."
        )
    return summary

def render_remotion(props, lesson_dir, output_path):
    REMOTION_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    lesson_dir = Path(lesson_dir)

    for event in props.get("visual_events", []):
        bg_name = event.get("bg_image_url")
        if bg_name:
            bg_src = lesson_dir / bg_name
            if bg_src.is_file():
                shutil.copy2(bg_src, REMOTION_PUBLIC_DIR / bg_name)

    copy_artifact_assets_to_public(props, lesson_dir, REMOTION_PUBLIC_DIR)

    published_videos = []
    published_audio = []
    for clip in props.get("mascot_clips") or []:
        mode = clip.get("lip_sync_mode", props.get("lip_sync_mode", "cartoon_svg"))
        if mode == "cartoon_svg":
            audio_name = clip.get("audio_url")
            if not audio_name:
                raise ValueError(f"Cartoon mascot clip missing audio_url: {clip}")
            src = lesson_dir / Path(audio_name).name
            if not src.is_file():
                raise FileNotFoundError(f"Beat audio not found: {src}")
            dest_name = src.name
            shutil.copy2(src, REMOTION_PUBLIC_DIR / dest_name)
            clip["audio_url"] = dest_name
            published_audio.append(dest_name)
            continue

        src = lesson_dir / Path(clip["video_url"]).name
        if not src.is_file():
            raise FileNotFoundError(f"Mascot clip not found: {src}")
        dest_name = src.name
        shutil.copy2(src, REMOTION_PUBLIC_DIR / dest_name)
        clip["video_url"] = dest_name
        published_videos.append(dest_name)

    narration_name = props.get("narration_audio_url")
    if narration_name:
        narration_src = lesson_dir / Path(narration_name).name
        if narration_src.is_file():
            shutil.copy2(narration_src, REMOTION_PUBLIC_DIR / narration_src.name)
            props["narration_audio_url"] = narration_src.name

    if not published_videos and not published_audio:
        raise FileNotFoundError("No mascot clips or beat audio were generated for this lesson.")

    if published_videos:
        props["talking_mascot_video_url"] = published_videos[0]
    else:
        props["talking_mascot_video_url"] = ""

    props_file = lesson_dir / "props.json"
    with open(props_file, "w", encoding="utf-8") as f:
        json.dump(props, f, indent=2)

    npx = shutil.which("npx")
    if not npx:
        raise RuntimeError("npx is required to render Remotion compositions.")

    cmd = [
        npx,
        "remotion",
        "render",
        "ComicLesson",
        str(output_path),
        f"--props={props_file.resolve()}",
        "--concurrency=4",
        "--scale=0.75",
        "--timeout=120000",
    ]
    print(f"   🎬 Headless Remotion render: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(REMOTION_DIR), text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Remotion render failed for ComicLesson (exit {result.returncode})")
    if not output_path.is_file():
        raise FileNotFoundError(f"Remotion did not write output video: {output_path}")
    return output_path

def _log_gpu_status():
    os.environ.setdefault("LIP_SYNC_ENGINE", "wav2lip")
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            print(f"   🚀 Local GPU lip-sync on cuda:0 ({name})")
            return
        print("   ⚠️ CUDA unavailable — lip_sync_service will fall back to CPU bounce")
    except ImportError:
        print("   ⚠️ PyTorch not installed — lip_sync_service will fall back to CPU bounce")

def produce_comic_lesson(
    lesson_title,
    narration_text,
    panels,
    lesson_dir,
    mascot_name="gyanu",
    voice="en-US-AndrewMultilingualNeural",
    student_name=None,
    force_regen=False,
    *,
    subject_name=None,
    class_name=None,
    chapter_name=None,
    chapter_output_dir=None,
):
    print(f"   🎙️ Synthesizing narration.mp3 with exact sentence timestamps ({voice})...")
    full_audio_path, narration_timeline, used_voice = synthesize_narration_timeline(
        narration_text, voice, lesson_dir
    )
    raw_cue_count = len(narration_timeline)
    narration_timeline = split_timeline_cues(narration_timeline)
    if len(narration_timeline) != raw_cue_count:
        print(
            f"   💬 Split long narration lines for speech bubble: "
            f"{raw_cue_count} → {len(narration_timeline)} cues"
        )
    last_end = narration_timeline[-1]["end_time"] if narration_timeline else 0.0
    print(f"   ⏱️ Timeline ready: {len(narration_timeline)} sentences, {last_end:.2f}s ({used_voice})")

    lesson_dir = Path(lesson_dir)
    chapter_id = (
        build_chapter_id(class_name, subject_name, chapter_name)
        if class_name and subject_name and chapter_name
        else None
    )
    artifacts_enabled = artifacts_enabled_for_subject(subject_name or "")
    chapter_manifest = None
    if artifacts_enabled and chapter_id:
        chapter_manifest = load_chapter_manifest(
            chapter_id,
            chapter_output_dir=chapter_output_dir,
        )
        if chapter_manifest:
            print(
                f"   🖼️ Artifact manifest loaded ({chapter_id}): "
                f"{len(chapter_manifest.get('artifacts', []))} entries"
            )
        else:
            print(f"   ℹ️ Artifacts enabled for subject, but no manifest found for {chapter_id}")

    visual_events = panels_to_visual_events_precise(
        panels,
        narration_timeline,
        lesson_dir,
        artifacts_enabled=artifacts_enabled,
        chapter_manifest=chapter_manifest,
    )
    
    timeline_file = lesson_dir / "narration_timeline.json"
    with open(timeline_file, "w", encoding="utf-8") as f:
        json.dump(narration_timeline, f, indent=2)

    mascot_dir = resolve_mascot_pose_dir(mascot_name)
    mascot_id = str(mascot_name).strip().lower()
    lip_sync_mode = resolve_lip_sync_mode(
        mascot_dir,
        force_presenter=_presenter_mode_enabled(),
    )
    print(f"   🗂️ Pose directory: {mascot_dir}")
    print(f"   🎭 Lip-sync mode: {lip_sync_mode} (mascot_id={mascot_id})")
    if lip_sync_mode == "cartoon_svg":
        print("   ✨ Cartoon SVG mouth-swap — skipping Wav2Lip GPU encode per beat")
    else:
        _log_gpu_status()
    _validate_sfx_assets()

    mascot_clips = []
    clip_paths = []
    for idx, event in enumerate(visual_events):
        pose = _normalize_mascot_pose(event.get("mascot_pose"), "talking")
        beat_audio_name = f"beat_{idx}_{pose}.mp3"
        beat_audio = lesson_dir / beat_audio_name
        extract_audio_segment(full_audio_path, beat_audio, event["start_time"], event["end_time"])

        if lip_sync_mode == "cartoon_svg":
            print(
                f"   🎙️ Cartoon beat {idx + 1}/{len(visual_events)} "
                f"pose={pose} audio={beat_audio_name} "
                f"[{event['start_time']:.2f}s–{event['end_time']:.2f}s]"
            )
            mascot_clips.append({
                "audio_url": beat_audio_name,
                "lip_sync_mode": "cartoon_svg",
                "start_time": event["start_time"],
                "end_time": event["end_time"],
                "pose": pose,
            })
            continue

        clip_name = f"talking_mascot_{idx}_{pose}.{MASCOT_CLIP_EXT}"
        clip_path = lesson_dir / clip_name
        pose_still = resolve_mascot_image(mascot_name, pose, lip_sync_mode=lip_sync_mode)
        reuse_clip = (
            not force_regen
            and clip_path.is_file()
            and clip_path.stat().st_size > 10_000
        )
        if reuse_clip:
            print(f"   ♻️ Reusing {clip_name} ({clip_path.stat().st_size // 1024} KB)")
        else:
            print(
                f"   🎭 GPU lip-sync beat {idx + 1}/{len(visual_events)} "
                f"pose={pose} still={pose_still.name} "
                f"[{event['start_time']:.2f}s–{event['end_time']:.2f}s]"
            )
            generate_talking_mascot(
                mascot_dir,
                beat_audio,
                clip_path,
                pose_type=pose,
                mascot_name=mascot_name,
            )
            if beat_audio.exists():
                beat_audio.unlink()
        mascot_clips.append({
            "video_url": clip_name,
            "lip_sync_mode": "wav2lip",
            "start_time": event["start_time"],
            "end_time": event["end_time"],
            "pose": pose,
        })
        clip_paths.append(clip_path)

    if clip_paths:
        _aggregate_gpu_status(clip_paths, lesson_dir)

    props = assemble_remotion_props(
        lesson_title=lesson_title,
        student_name=student_name,
        narration_timeline=narration_timeline,
        visual_events=visual_events,
        mascot_clips=mascot_clips,
        mascot_id=mascot_id,
        lip_sync_mode=lip_sync_mode,
        narration_audio_url="narration.mp3" if lip_sync_mode == "wav2lip" else None,
        subject=resolve_subject_key(subject_name or "") or subject_name,
        chapter_id=chapter_id,
        artifacts_enabled=artifacts_enabled,
    )
    output_path = lesson_dir / "output.mp4"
    render_remotion(props, lesson_dir, output_path)
    print(f"   ✨ Comic lesson ready ({output_path.name})")
    return output_path


def assemble_remotion_props(
    lesson_title,
    student_name,
    narration_timeline,
    visual_events,
    mascot_clips=None,
    mascot_id="gyanu",
    lip_sync_mode="cartoon_svg",
    narration_audio_url=None,
    subject=None,
    chapter_id=None,
    artifacts_enabled=False,
):
    clips = mascot_clips or []
    first_video = next((c.get("video_url") for c in clips if c.get("video_url")), "")
    props = {
        "lesson_title": lesson_title,
        "student_name": student_name or "Rahul",
        "mascot_id": mascot_id,
        "lip_sync_mode": lip_sync_mode,
        "narration_audio_url": narration_audio_url,
        "bg_image_url": visual_events[0]["bg_image_url"] if visual_events else "background.jpg",
        "talking_mascot_video_url": first_video or f"talking_mascot.{MASCOT_CLIP_EXT}",
        "mascot_clips": clips,
        "narration_timeline": narration_timeline,
        "visual_events": visual_events,
        "artifacts_enabled": bool(artifacts_enabled),
    }
    if subject:
        props["subject"] = subject
    if chapter_id:
        props["chapter_id"] = chapter_id
    return props

# ------------------------------------------------------------------------------
# 6. CHAPTER PROCESSING ENGINE
# ------------------------------------------------------------------------------
def build_storyboard_prompt(class_name, student_name, artifact_catalog=""):
    student = student_name or "Rahul"
    artifact_block = ""
    if artifact_catalog and artifact_catalog.strip():
        artifact_block = f"""
    {artifact_catalog.strip()}
    """
    return f"""
    You are the Senior Spatial Storyboard Director for Kriti School's Drona Engine.
    Analyze this ENTIRE PDF chapter and generate micro-lessons for {class_name} students.

    ADAPTIVE LESSON COUNT MANDATE (do not miss content for a big chapter):
    - First, identify EVERY major topic, dynasty/ruler/kingdom, or named concept
      covered anywhere in this chapter.
    - Generate ONE micro-lesson per topic or tightly-related cluster of topics.
      Use as many micro-lessons as necessary so that NO major topic is
      compressed out or omitted — do not artificially limit yourself to a
      small number of lessons if the chapter covers more distinct topics
      than that would allow you to cover properly.
    - Most chapters need 3 to 6 micro-lessons; a long, dense chapter may
      legitimately need more. It is far better to produce one extra lesson
      than to silently drop a named topic from the chapter.
    - OUTPUT ONLY a JSON array of storyboard objects.

    STRICT TIME & WORD CAP MANDATE (3-4 MINUTE LESSONS):
    - Each micro-lesson narration script MUST be between {NARRATION_WORDS_MIN}
      and {NARRATION_WORDS_MAX} words total (~3 to 4 minutes spoken).
    - Do not pad a lesson with filler to hit the word count — if a topic
      genuinely needs fewer words, that's fine; prefer starting a new lesson
      over stretching thin content or cramming unrelated topics together.

    STRICT ON-SCREEN TEXT LENGTH MANDATE (prevents mid-word truncation in the video UI):
    - Every "title" string MUST be {MAX_TITLE_CHARS} characters or fewer.
    - Every string inside "items" MUST be {MAX_ITEM_CHARS} characters or fewer.
    - If a fact needs more room than that, shorten it to its key phrase (e.g.
      "Warfare: military conquest of rival territory" -> "Warfare: military conquest").
      Never rely on the renderer to truncate text for you — write it short to begin with.
    - Chip/label-style short phrases MUST be {MAX_CHIP_CHARS} characters or fewer.

    NARRATION-TO-CARD ALIGNMENT (all subjects — history, science, math, geography):
    - Each panel's "items" MUST list EVERY named person, place, kingdom, formula, step,
      or key term spoken during that panel's portion of the narration.
    - Use separate chips — do NOT compress lists into one item
      (bad: "Inside: Shungas, Chedis" when narration names Satavahanas, Cholas too).
    - Target item counts: intro 2–4 items; concept_card 3–6 items; math_step 3–6 items;
      summary_badge 4–6 items.
    - Write narration in shorter sentences (under 100 characters when possible) so the
      on-screen speech bubble can show the full line.

    ADAPTIVE PANEL COUNT MANDATE (one fact per panel, not merged):
    - Each micro-lesson should have between {MIN_PANELS_PER_LESSON} and
      {MAX_PANELS_PER_LESSON} panels — one panel per major sub-point of that
      lesson, not a fixed number.
    - The FIRST panel of a lesson should introduce/hook the topic (use
      "type": "intro").
    - The LAST panel of a lesson should recap its key points (use
      "type": "summary_badge").
    - Panels in between should each cover ONE distinct fact, ruler, kingdom,
      or concept. Use "type": "math_step" for sequential/step-by-step
      content, or "type": "concept_card" for descriptive/factual content.
      Do NOT merge multiple distinct facts into a single panel's "items"
      list just to keep the panel count low.
    - Set "mascot_pose" per panel to one of: talking, neutral, pointing, happy.
{artifact_block}
    CONTEXTUAL SDXL VISUAL BACKGROUNDS PER PHASE:
    - Each panel with visual_mode "generated" or "hybrid" MUST include its own "bg_prompt" string matching that beat.
    - Panels with visual_mode "artifact" should NOT include bg_prompt — the textbook reference image is the hero visual.
    - Write photorealistic scene descriptions for hybrid/generated beats (e.g., "Photorealistic ancient Satavahana trading ship with two tall wooden masts on a blue ocean, 8k --no text --no people").

    CONVERSATIONAL NARRATION MANDATE:
    - Write a warm, friendly, storytelling teacher script speaking directly to the student ({student}).
    - Avoid dry textbook statements. Use engaging questions.

    Return a valid JSON array matching (panel count and lesson count are
    EXAMPLES only — use as many of each as the chapter actually requires):
    {{
      "lesson_title": "string",
      "narration_text": "string ({NARRATION_WORDS_MIN}-{NARRATION_WORDS_MAX} words)",
      "panels": [
        {{
          "phase": "Intro",
          "type": "intro",
          "bg_prompt": "Vivid SDXL scene description",
          "title": "Intro Title",
          "items": ["Point 1", "Point 2"],
          "mascot_pose": "talking"
        }},
        {{
          "phase": "Concept",
          "type": "concept_card",
          "visual_mode": "artifact",
          "artifact_id": "trade_routes_map",
          "title": "Concept Title",
          "items": ["Point 1", "Point 2", "Point 3", "Point 4"],
          "mascot_pose": "pointing"
        }},
        {{
          "phase": "Concept",
          "type": "concept_card",
          "bg_prompt": "Vivid SDXL scene description",
          "visual_mode": "generated",
          "title": "Concept Title",
          "items": ["Fact A", "Fact B", "Fact C"],
          "mascot_pose": "pointing"
        }},
        {{
          "phase": "Recap",
          "type": "summary_badge",
          "bg_prompt": "Vivid SDXL scene description",
          "title": "Recap Title",
          "items": ["Summary 1", "Summary 2", "Summary 3", "Summary 4"],
          "mascot_pose": "happy"
        }}
      ],
      "initial_quiz": [...]
    }}
    """

def _process_single_lesson(
    lesson,
    idx,
    chapter_output_dir,
    pdf_text,
    mascot_name,
    voice,
    student_name,
    force_regen,
    provider,
    label_suffix="",
    *,
    class_name=None,
    subject_name=None,
    chapter_name=None,
):
    if not isinstance(lesson, dict):
        return None

    if not is_storyboard_complete(lesson, min_panels=MIN_PANELS_PER_LESSON):
        lesson_title_guess = lesson.get("lesson_title") or lesson.get("title") or f"Lesson {idx + 1}"
        print(
            f"   ❌ ERROR: Incomplete storyboard for [{lesson_title_guess}] — "
            f"truncated narration and/or missing panels. Skipping render. "
            f"Re-run with --force to regenerate this lesson."
        )
        return None

    lesson = align_storyboard_panels(dict(lesson), split_narration_sentences)
    for warning in audit_panel_coverage(lesson, split_narration_sentences):
        print(f"   ⚠️ Panel coverage: {warning}")

    title, bg_prompt, narration_text, panels, initial_quiz = normalize_storyboard(lesson)
    title = title or f"Micro-Lesson {idx + 1}{label_suffix}"

    print(f"\n⚡ Processing Micro-Lesson {idx + 1}{label_suffix}: {title}")

    lesson_dir = chapter_output_dir / f"Micro_Lesson_{idx + 1}"
    lesson_dir.mkdir(parents=True, exist_ok=True)

    storyboard_file = lesson_dir / "storyboard.json"
    with open(storyboard_file, "w", encoding="utf-8") as f:
        json.dump(lesson, f, indent=2)

    full_quiz = expand_quiz_item_pool(
        lesson_title=title,
        pdf_text=pdf_text,
        initial_quiz=initial_quiz,
        provider=provider,
    )
    quiz_file = lesson_dir / "quiz.json"
    with open(quiz_file, "w", encoding="utf-8") as f:
        json.dump(full_quiz, f, indent=2)
    print(f"   📝 Saved Quiz Bank: {quiz_file.name} ({len(full_quiz.get('item_pool', []))} randomized items ready!)")

    if not narration_text:
        print("   ❌ ERROR: No narration text found in AI storyboard.")
        return None
    if not panels:
        print("   ❌ ERROR: No spatial panels found in AI storyboard.")
        return None

    narration_file = lesson_dir / "narration.txt"
    with open(narration_file, "w", encoding="utf-8") as f:
        f.write(narration_text)

    produce_comic_lesson(
        lesson_title=title,
        narration_text=narration_text,
        panels=panels,
        lesson_dir=lesson_dir,
        mascot_name=mascot_name,
        voice=voice,
        student_name=student_name,
        force_regen=force_regen,
        subject_name=subject_name,
        class_name=class_name,
        chapter_name=chapter_name,
        chapter_output_dir=chapter_output_dir,
    )
    return narration_text


def process_chapter_pdf(pdf_path, class_name, subject_name, force_regen=False, provider="anthropic", mascot_name="gyanu", student_name=None):
    chapter_name = pdf_path.stem
    voice = MASCOT_VOICES.get(mascot_name.lower(), "en-US-AndrewMultilingualNeural")
    pdf_text = extract_pdf_text(pdf_path)

    print(f"\n==================================================")
    print(f"🚀 Processing: [{class_name}] -> [{subject_name}] -> [{chapter_name}]")
    print(f"🎭 Mascot Narrator: [{mascot_name.upper()}] | Voice: [{voice}] | Student: [{student_name or 'Default'}]")
    print(f"==================================================")

    chapter_output_dir = RENDERED_OUTPUT_DIR / class_name / subject_name / chapter_name
    cache_file = chapter_output_dir / "generated_response.json"

    if force_regen and cache_file.exists():
        print(f"🧹 Force flag detected. Clearing cache for {chapter_name}...")
        os.remove(cache_file)

    chapter_id = build_chapter_id(class_name, subject_name, chapter_name)
    artifacts_on = artifacts_enabled_for_subject(subject_name)
    chapter_manifest = None
    artifact_catalog = ""
    if artifacts_on:
        ensure_chapter_artifacts_from_pdf(
            pdf_path,
            chapter_id,
            class_name=class_name,
            subject_name=subject_name,
            chapter_name=chapter_name,
            chapter_output_dir=chapter_output_dir,
            force=force_regen,
            provider=provider,
        )
        chapter_manifest = load_chapter_manifest(
            chapter_id,
            chapter_output_dir=chapter_output_dir,
        )
        artifact_catalog = format_manifest_for_prompt(chapter_manifest)
        if chapter_manifest:
            print(
                f"   🖼️ Reference images enabled — manifest loaded for {chapter_id} "
                f"({len(chapter_manifest.get('artifacts', []))} entries)"
            )
        else:
            print(
                f"   🖼️ Reference images enabled for subject, but no manifest at "
                f"assets/chapters/{chapter_id}/artifacts/manifest.json "
                f"or {chapter_output_dir / 'artifacts' / 'manifest.json'}"
            )

    prompt = build_storyboard_prompt(class_name, student_name, artifact_catalog=artifact_catalog)
    lessons = generate_micro_lessons(pdf_path, prompt, provider=provider, cache_file=cache_file)
    lessons = ensure_lesson_list(lessons)
    print(f"🧩 Chapter broken into {len(lessons)} comic micro-lessons.")

    covered_narrations = []
    for idx, lesson in enumerate(lessons):
        narration_text = _process_single_lesson(
            lesson, idx, chapter_output_dir, pdf_text,
            mascot_name, voice, student_name, force_regen, provider,
            class_name=class_name,
            subject_name=subject_name,
            chapter_name=chapter_name,
        )
        if narration_text:
            covered_narrations.append(narration_text)

    key_terms = _extract_key_terms(pdf_text)
    combined_narration = " ".join(covered_narrations)
    missing_terms = _find_missing_terms(key_terms, combined_narration)

    if missing_terms:
        preview = ", ".join(missing_terms[:10]) + ("..." if len(missing_terms) > 10 else "")
        print(f"\n🔎 Coverage check: {len(missing_terms)} topic(s) from the source PDF "
              f"were not found in any lesson's narration:")
        print(f"   {preview}")
        print("   🩹 Requesting one self-heal micro-lesson to cover the gap (single extra API call)...")
        gap_lesson = None
        try:
            gap_lesson = generate_gap_fill_lesson(
                pdf_text=pdf_text,
                existing_lessons=lessons,
                missing_terms=missing_terms,
                provider=provider,
                class_name=class_name,
                student_name=student_name,
            )
        except Exception as exc:
            print(f"   ⚠️ Gap-fill generation failed: {exc}. Proceeding without a patch lesson.")

        if gap_lesson:
            gap_idx = len(lessons)
            narration_text = _process_single_lesson(
                gap_lesson, gap_idx, chapter_output_dir, pdf_text,
                mascot_name, voice, student_name, force_regen, provider,
                label_suffix=" (Coverage Patch)",
                class_name=class_name,
                subject_name=subject_name,
                chapter_name=chapter_name,
            )
            if narration_text:
                lessons.append(gap_lesson)
                print(f"   ✅ Coverage patch lesson added as Micro_Lesson_{gap_idx + 1}.")
            else:
                print("   ⚠️ Coverage patch lesson was generated but failed to process.")
    else:
        print("\n✅ Coverage check passed — heuristic scan found no obviously-missing named topics.")

# ------------------------------------------------------------------------------
# 7. RECURSIVE BATCH ORCHESTRATION
# ------------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Drona Engine Spatial Remotion + GPU Lip-Sync Agent")
    parser.add_argument("--grade", type=str, help="Filter by class folder (e.g. Class-7)")
    parser.add_argument("--subject", type=str, help="Filter by subject folder (e.g. Maths-Ganith-Prakash-I)")
    parser.add_argument("--chapter", type=str, help="Filter by chapter number or name (e.g. 1 or Chapter-1)")
    parser.add_argument("--provider", type=str, default="anthropic", choices=["gemini", "anthropic", "openai"], help="Select AI Provider")
    parser.add_argument("--mascot", type=str, default="gyanu", choices=["gyanu", "kito", "chirp", "arya", "volt"], help="Select Mascot")
    parser.add_argument("--student-name", type=str, help="Personalize video intro for student name (e.g. Rahul)")
    parser.add_argument("--force", action="store_true", help="Force regenerate storyboards and lip-sync bypassing cache")
    args = parser.parse_args()

    if not SOURCE_BOOKS_DIR.exists():
        print(f"❌ Source books directory not found at: {SOURCE_BOOKS_DIR}")
        return

    class_dirs = [d for d in SOURCE_BOOKS_DIR.iterdir() if d.is_dir()]
    if args.grade:
        class_dirs = [d for d in class_dirs if d.name.lower() == args.grade.lower()]

    for class_dir in class_dirs:
        class_name = class_dir.name
        subject_dirs = [s for s in class_dir.iterdir() if s.is_dir()]

        if args.subject:
            subject_dirs = [s for s in subject_dirs if s.name.lower() == args.subject.lower()]

        for subject_dir in subject_dirs:
            subject_name = subject_dir.name
            pdf_files = sorted(subject_dir.glob("Chapter-*.pdf"))

            if args.chapter:
                ch_target = args.chapter.strip().lower()
                if ch_target.isdigit():
                    allowed_stems = [f"chapter-{ch_target}", f"chapter-{int(ch_target):02d}"]
                else:
                    allowed_stems = [ch_target, ch_target.replace(".pdf", "")]

                pdf_files = [p for p in pdf_files if p.stem.lower() in allowed_stems]

            for pdf_path in pdf_files:
                try:
                    process_chapter_pdf(
                        pdf_path=pdf_path,
                        class_name=class_name,
                        subject_name=subject_name,
                        force_regen=args.force,
                        provider=args.provider,
                        mascot_name=args.mascot,
                        student_name=args.student_name
                    )
                    print("⏳ Cooldown pause (10s)...")
                    time.sleep(10)
                except Exception as e:
                    print(f"❌ Error processing {pdf_path.name}: {str(e)}")
                    continue

    print(f"\n🎉 Tasks completed! Output directory: {RENDERED_OUTPUT_DIR}")

if __name__ == "__main__":
    main()
