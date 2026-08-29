# ==============================================================================
# Master Production Engine: Spatial Storyboard + Dynamic SDXL Story Backgrounds
# Place in: E:\Kriti\chapter_agent.py (or Chapter_Agent.py)
# ==============================================================================
import os
import sys
import json
import time
import re
import random
import shutil
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
    resolve_mascot_dir,
    resolve_pose_image,
)

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

SPATIAL_PHASES = (
    {
        "phase": "Intro",
        "event_type": "intro",
        "mascot_pose": "talking",
        "mascot": {"x": 550, "y": -250, "scale": 1.0},
        "card": {"x": -350, "y": 0},
        "glowing_badge": False,
    },
    {
        "phase": "Concept",
        "event_type": "concept_card",
        "mascot_pose": "neutral",
        "mascot": {"x": 550, "y": -250, "scale": 1.0},
        "card": {"x": -350, "y": 0},
        "glowing_badge": False,
    },
    {
        "phase": "Worked Example",
        "event_type": "math_step",
        "mascot_pose": "pointing",
        "mascot": {"x": 550, "y": -250, "scale": 1.0},
        "card": {"x": -350, "y": 0},
        "glowing_badge": False,
    },
    {
        "phase": "Recap",
        "event_type": "summary_badge",
        "mascot_pose": "happy",
        "mascot": {"x": 550, "y": -250, "scale": 1.05},
        "card": {"x": -350, "y": 0},
        "glowing_badge": True,
    },
)

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
    """Strips solid background cards from mascot stills to create clean transparent PNGs."""
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
    """Generate dynamic 1080p story background using SDXL Turbo on CUDA GPU."""
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

def panels_to_visual_events_precise(panels, narration_timeline, lesson_dir):
    """Align spatial panels to precise TTS sentence boundaries and generate contextual backgrounds per phase."""
    raw_panels = panels if isinstance(panels, list) else []
    total_sentences = len(narration_timeline)
    
    if total_sentences >= 4:
        s_per_phase = total_sentences // 4
        phase_indices = [
            (0, s_per_phase),
            (s_per_phase, s_per_phase * 2),
            (s_per_phase * 2, s_per_phase * 3),
            (s_per_phase * 3, total_sentences)
        ]
    else:
        phase_indices = [(i, min(i+1, total_sentences)) for i in range(min(4, total_sentences))]

    events = []
    for idx, spatial in enumerate(SPATIAL_PHASES):
        if idx < len(phase_indices) and phase_indices[idx][0] < total_sentences:
            start_idx, end_idx = phase_indices[idx]
            start_time = float(narration_timeline[start_idx]["start_time"])
            end_time = float(narration_timeline[end_idx - 1]["end_time"])
        else:
            last_end = events[-1]["end_time"] if events else 0.0
            start_time, end_time = last_end, last_end + 5.0

        panel = raw_panels[idx] if idx < len(raw_panels) and isinstance(raw_panels[idx], dict) else {}
        visual = panel.get("visual_data") if isinstance(panel.get("visual_data"), dict) else panel
        phase = panel.get("phase") or panel.get("id") or panel.get("state") or spatial["phase"]
        
        event_type = _normalize_event_type(
            visual.get("type") or visual.get("card_type") or panel.get("type"),
            phase_hint=phase,
            fallback=spatial["event_type"],
        )
        mascot_raw = panel.get("mascot_position") or visual.get("mascot_position") or spatial["mascot"]
        card_raw = panel.get("card_position") or visual.get("card_position") or spatial["card"]
        title = visual.get("title") or panel.get("title") or spatial["phase"]
        
        items = visual.get("items")
        if items is None:
            items = visual.get("content") or visual.get("bullets") or []

        glowing = bool(
            panel.get("glowing_badge")
            if "glowing_badge" in panel
            else visual.get("glowing_badge", spatial["glowing_badge"])
        )
        pose = _normalize_mascot_pose(
            panel.get("mascot_pose") or visual.get("mascot_pose") or spatial["mascot_pose"]
        )

        # Contextual background generation per phase beat
        phase_bg_prompt = panel.get("bg_prompt") or visual.get("bg_prompt") or f"Cinematic digital art representing {title}"
        bg_filename = f"bg_phase_{idx + 1}.jpg"
        bg_path = lesson_dir / bg_filename
        generate_story_background(phase_bg_prompt, bg_path)

        events.append({
            "type": event_type,
            "start_time": start_time,
            "end_time": end_time,
            "title": str(title),
            "items": _clean_items(items) or [f"{spatial['phase']} beat"],
            "mascot_pose": pose,
            "mascot_position": world_to_canvas(
                _as_xy(mascot_raw, spatial["mascot"]),
                include_scale=True,
                default_scale=spatial["mascot"].get("scale", 1.0),
            ),
            "card_position": world_to_canvas(_as_xy(card_raw, spatial["card"])),
            "glowing_badge": glowing,
            "bg_image_url": bg_filename
        })

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

def resolve_mascot_image(mascot_name, pose_type="talking"):
    """Detects avatar images, strips background cards via rembg, and returns transparent PNG path."""
    mascot_dir = resolve_mascot_pose_dir(mascot_name)
    
    selected_file = None
    for avatar_name in ["real_avatar.jpg", "real_avatar.png", "real_avatar.jpeg"]:
        candidate = mascot_dir / avatar_name
        if candidate.is_file():
            selected_file = candidate
            break

    if not selected_file:
        selected_file = resolve_pose_image(
            mascot_image_path=mascot_dir,
            pose_type=pose_type,
            mascot_name=mascot_name,
        )

    # Automatically remove white background card via rembg
    return ensure_transparent_mascot(selected_file)

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

def assemble_remotion_props(lesson_title, student_name, narration_timeline, visual_events, mascot_clips=None):
    clips = mascot_clips or []
    return {
        "lesson_title": lesson_title,
        "student_name": student_name or "Rahul",
        "bg_image_url": visual_events[0]["bg_image_url"] if visual_events else "background.jpg",
        "talking_mascot_video_url": clips[0]["video_url"] if clips else "talking_mascot.mp4",
        "mascot_clips": clips,
        "narration_timeline": narration_timeline,
        "visual_events": visual_events,
    }

def render_remotion(props, lesson_dir, output_path):
    REMOTION_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    lesson_dir = Path(lesson_dir)

    for event in props.get("visual_events", []):
        bg_name = event.get("bg_image_url")
        if bg_name:
            bg_src = lesson_dir / bg_name
            if bg_src.is_file():
                shutil.copy2(bg_src, REMOTION_PUBLIC_DIR / bg_name)

    published = []
    for clip in props.get("mascot_clips") or []:
        src = lesson_dir / Path(clip["video_url"]).name
        if not src.is_file():
            raise FileNotFoundError(f"Mascot clip not found: {src}")
        dest_name = src.name
        shutil.copy2(src, REMOTION_PUBLIC_DIR / dest_name)
        clip["video_url"] = dest_name
        published.append(dest_name)

    combined = lesson_dir / "talking_mascot.mp4"
    if combined.is_file():
        shutil.copy2(combined, REMOTION_PUBLIC_DIR / "talking_mascot.mp4")
        props["talking_mascot_video_url"] = "talking_mascot.mp4"
    elif published:
        props["talking_mascot_video_url"] = published[0]
    else:
        raise FileNotFoundError(f"Talking mascot MP4 not found at {combined}")

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
        "--concurrency=4",          # Uses 4 CPU threads simultaneously
        "--scale=0.75",             # Renders 720p/1080p proxy (2x faster)
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
):
    print(f"   🎙️ Synthesizing narration.mp3 with exact sentence timestamps ({voice})...")
    full_audio_path, narration_timeline, used_voice = synthesize_narration_timeline(
        narration_text, voice, lesson_dir
    )
    last_end = narration_timeline[-1]["end_time"] if narration_timeline else 0.0
    print(f"   ⏱️ Timeline ready: {len(narration_timeline)} sentences, {last_end:.2f}s ({used_voice})")

    visual_events = panels_to_visual_events_precise(panels, narration_timeline, lesson_dir)
    
    timeline_file = lesson_dir / "narration_timeline.json"
    with open(timeline_file, "w", encoding="utf-8") as f:
        json.dump(narration_timeline, f, indent=2)

    mascot_dir = resolve_mascot_pose_dir(mascot_name)
    print(f"   🗂️ Pose directory: {mascot_dir}")
    _log_gpu_status()

    mascot_clips = []
    clip_paths = []
    for idx, event in enumerate(visual_events):
        pose = _normalize_mascot_pose(event.get("mascot_pose"), "talking")
        clip_name = f"talking_mascot_{idx}_{pose}.mp4"
        clip_path = lesson_dir / clip_name
        pose_still = resolve_mascot_image(mascot_name, pose)
        reuse_clip = (
            not force_regen
            and clip_path.is_file()
            and clip_path.stat().st_size > 10_000
        )
        if reuse_clip:
            print(f"   ♻️ Reusing {clip_name} ({clip_path.stat().st_size // 1024} KB)")
        else:
            beat_audio = lesson_dir / f"beat_{idx}_{pose}.mp3"
            extract_audio_segment(full_audio_path, beat_audio, event["start_time"], event["end_time"])
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
            "start_time": event["start_time"],
            "end_time": event["end_time"],
            "pose": pose,
        })
        clip_paths.append(clip_path)

    talking_mascot_path = lesson_dir / "talking_mascot.mp4"
    reuse_combined = (
        not force_regen
        and talking_mascot_path.is_file()
        and talking_mascot_path.stat().st_size > 10_000
        and all(p.is_file() for p in clip_paths)
    )
    if reuse_combined:
        print(f"   ♻️ Reusing concatenated talking_mascot.mp4")
    elif clip_paths:
        print("   🔗 Combining pose clips → talking_mascot.mp4")
        concat_mascot_clips(clip_paths, talking_mascot_path)

    props = assemble_remotion_props(
        lesson_title=lesson_title,
        student_name=student_name,
        narration_timeline=narration_timeline,
        visual_events=visual_events,
        mascot_clips=mascot_clips,
    )
    output_path = lesson_dir / "output.mp4"
    render_remotion(props, lesson_dir, output_path)
    print(f"   ✨ Comic lesson ready ({output_path.name})")
    return output_path

# ------------------------------------------------------------------------------
# 6. CHAPTER PROCESSING ENGINE
# ------------------------------------------------------------------------------
def build_storyboard_prompt(class_name, student_name):
    student = student_name or "Rahul"
    return f"""
    You are the Senior Spatial Storyboard Director for Kriti School's Drona Engine.
    Analyze this PDF chapter and generate 2 to 3 micro-lessons for {class_name} students.

    STRICT TIME & WORD CAP MANDATE (2–3 MINUTE LESSONS):
    - Each micro-lesson narration script MUST be between 300 and 350 words total (~2 to 2.5 minutes spoken).
    - Break long chapter content across multiple lessons instead of overloading one lesson.
    - OUTPUT ONLY a JSON array of storyboard objects.

    CONTEXTUAL SDXL VISUAL BACKGROUNDS PER PHASE:
    - Each panel object MUST include its own "bg_prompt" string matching that specific beat concept.
    - Write photorealistic scene descriptions (e.g., "Photorealistic ancient Satavahana trading ship with two tall wooden masts on a blue ocean, 8k --no text --no people").

    CONVERSATIONAL NARRATION MANDATE:
    - Write a warm, friendly, storytelling teacher script speaking directly to the student ({student}).
    - Avoid dry textbook statements. Use engaging questions.

    SPATIAL KEYFRAMES (EXACTLY 4 PANELS):
    1. Phase 1 Intro: mascot at Bottom-Right {{"x": 550, "y": -250, "scale": 1.0}}, mascot_pose "talking".
    2. Phase 2 Concept: mascot at Bottom-Right {{"x": 550, "y": -250, "scale": 1.0}}, mascot_pose "neutral"; card at Left {{"x": -350, "y": 0}}.
    3. Phase 3 Worked Example: mascot at Bottom-Right {{"x": 550, "y": -250, "scale": 1.0}}, mascot_pose "pointing"; math card at Left {{"x": -350, "y": 0}}.
    4. Phase 4 Recap: mascot at Bottom-Right {{"x": 550, "y": -250, "scale": 1.05}}, mascot_pose "happy", set glowing_badge true.

    Return a valid JSON array matching:
    {{
      "lesson_title": "string",
      "narration_text": "string (300-350 words max)",
      "panels": [
        {{
          "phase": "Intro",
          "bg_prompt": "Vivid SDXL scene description 1",
          "title": "Intro Title",
          "items": ["Point 1", "Point 2"]
        }},
        {{
          "phase": "Concept",
          "bg_prompt": "Vivid SDXL scene description 2",
          "title": "Concept Title",
          "items": ["Point 1", "Point 2"]
        }},
        {{
          "phase": "Worked Example",
          "bg_prompt": "Vivid SDXL scene description 3",
          "title": "Example Title",
          "items": ["Point 1", "Point 2"]
        }},
        {{
          "phase": "Recap",
          "bg_prompt": "Vivid SDXL scene description 4",
          "title": "Recap Title",
          "items": ["Summary Point 1", "Summary Point 2"]
        }}
      ],
      "initial_quiz": [...]
    }}
    """

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

    prompt = build_storyboard_prompt(class_name, student_name)
    lessons = generate_micro_lessons(pdf_path, prompt, provider=provider, cache_file=cache_file)
    lessons = ensure_lesson_list(lessons)
    print(f"🧩 Chapter broken into {len(lessons)} comic micro-lessons.")

    for idx, lesson in enumerate(lessons):
        if not isinstance(lesson, dict):
            continue

        title, bg_prompt, narration_text, panels, initial_quiz = normalize_storyboard(lesson)
        title = title or f"Micro-Lesson {idx + 1}"

        print(f"\n⚡ [{chapter_name}] Processing Micro-Lesson {idx + 1}: {title}")

        lesson_dir = chapter_output_dir / f"Micro_Lesson_{idx + 1}"
        lesson_dir.mkdir(parents=True, exist_ok=True)

        storyboard_file = lesson_dir / "storyboard.json"
        with open(storyboard_file, "w", encoding="utf-8") as f:
            json.dump(lesson, f, indent=2)

        full_quiz = expand_quiz_item_pool(
            lesson_title=title,
            pdf_text=pdf_text,
            initial_quiz=initial_quiz,
            provider=provider
        )
        quiz_file = lesson_dir / "quiz.json"
        with open(quiz_file, "w", encoding="utf-8") as f:
            json.dump(full_quiz, f, indent=2)
        print(f"   📝 Saved Quiz Bank: {quiz_file.name} ({len(full_quiz.get('item_pool', []))} randomized items ready!)")

        if not narration_text:
            print("   ❌ ERROR: No narration text found in AI storyboard.")
            continue
        if not panels:
            print("   ❌ ERROR: No spatial panels found in AI storyboard.")
            continue

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
        )

# ------------------------------------------------------------------------------
# 7. RECURSIVE BATCH ORCHESTRATION
# ------------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Drona Engine Spatial Remotion + GPU Lip-Sync Agent")
    parser.add_argument("--grade", type=str, help="Filter by class folder (e.g. Class-7)")
    parser.add_argument("--subject", type=str, help="Filter by subject folder (e.g. Maths-Ganith-Prakash-I)")
    parser.add_argument("--chapter", type=str, help="Filter by chapter number or name (e.g. 1 or Chapter-1)")
    parser.add_argument("--provider", type=str, default="anthropic", choices=["gemini", "anthropic", "openai"], help="Select AI Provider")
    parser.add_argument("--mascot", type=str, default="gyanu", choices=["gyanu", "kito", "chirp", "arya"], help="Select Mascot")
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