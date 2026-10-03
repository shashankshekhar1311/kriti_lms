# ==============================================================================
# Kriti Drona Engine: Fast Asset Generator & Supabase Cloud Pipeline
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

# PyTorch & SDXL Turbo Pipeline
try:
    import torch
    from diffusers import AutoPipelineForText2Image
except ImportError:
    torch = None
    AutoPipelineForText2Image = None

# Supabase Client
try:
    from supabase import create_client, Client
except ImportError:
    create_client = None

# LLM Providers
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

# Neural Voice Mappings
MASCOT_VOICES = {
    "gyanu": "en-US-AndrewMultilingualNeural",
    "kito": "en-US-BrianNeural",
    "chirp": "en-IN-NeerjaNeural",
    "arya": "en-US-GuyNeural",
}

TTS_TICKS_PER_SECOND = 10_000_000
CANVAS_WIDTH = 1920
CANVAS_HEIGHT = 1080

SPATIAL_PHASES = (
    {"phase": "Intro", "event_type": "intro", "mascot_pose": "talking", "mascot": {"x": 550, "y": -250, "scale": 1.0}, "card": {"x": -350, "y": 0}, "glowing_badge": False},
    {"phase": "Concept", "event_type": "concept_card", "mascot_pose": "neutral", "mascot": {"x": 550, "y": -250, "scale": 1.0}, "card": {"x": -350, "y": 0}, "glowing_badge": False},
    {"phase": "Worked Example", "event_type": "math_step", "mascot_pose": "pointing", "mascot": {"x": 550, "y": -250, "scale": 1.0}, "card": {"x": -350, "y": 0}, "glowing_badge": False},
    {"phase": "Recap", "event_type": "summary_badge", "mascot_pose": "happy", "mascot": {"x": 550, "y": -250, "scale": 1.05}, "card": {"x": -350, "y": 0}, "glowing_badge": True},
)

# Global SDXL Cache
_SDXL_PIPE = None

# Supabase Initialization
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
supabase: Client = None
if create_client and SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("☁️ Supabase client connected.")
    except Exception as e:
        print(f"⚠️ Supabase init warning: {e}")

# ------------------------------------------------------------------------------
# 2. ASSET RESOLUTION & DYNAMIC BACKGROUND GENERATION
# ------------------------------------------------------------------------------
def resolve_mascot_pose_dir(mascot_name: str) -> Path:
    try:
        return resolve_mascot_dir(mascot_name=mascot_name, hint=ASSETS_DIR / mascot_name.lower())
    except FileNotFoundError:
        return resolve_mascot_dir(mascot_name="gyanu", hint=ASSETS_DIR / "gyanu")

def resolve_mascot_image(mascot_name: str, pose_type: str = "talking") -> Path:
    """Prioritizes photorealistic avatar (real_avatar.jpg/.png) over 2D SVG poses."""
    mascot_dir = resolve_mascot_pose_dir(mascot_name)
    for ext in ["jpg", "jpeg", "png"]:
        candidate = mascot_dir / f"real_avatar.{ext}"
        if candidate.is_file():
            return candidate

    return resolve_pose_image(
        mascot_image_path=mascot_dir,
        pose_type=pose_type,
        mascot_name=mascot_name,
    )

def generate_story_background(prompt_text: str, output_path: Path) -> Path:
    global _SDXL_PIPE
    output_path = Path(output_path)
    if output_path.is_file() and output_path.stat().st_size > 10_000:
        print(f"   🎨 Reusing existing background: {output_path.name}")
        return output_path

    print(f"   🎨 Generating dynamic SDXL background...")
    print(f"      Prompt: '{prompt_text[:80]}...'")

    if AutoPipelineForText2Image is None or torch is None or not torch.cuda.is_available():
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
            prompt=f"{prompt_text}, atmospheric cinematic lighting, highly detailed environment, 8k, photorealistic digital art --no text --no people",
            num_inference_steps=2,
            guidance_scale=0.0,
            width=1024,
            height=576,
        ).images[0]

        image = image.resize((1920, 1080))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path, quality=92)
        print(f"   ✅ Saved dynamic background: {output_path.name}")
    except Exception as err:
        print(f"   ⚠️ SDXL generation fallback: {err}")
        _create_fallback_background(output_path)

    return output_path

def _create_fallback_background(output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "color=c=090d16:s=1920x1080:d=1",
        "-frames:v", "1", str(output_path)
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# ------------------------------------------------------------------------------
# 3. TEXT & NARRATION SYNTHESIS
# ------------------------------------------------------------------------------
def clean_and_parse_json(raw_text: str):
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
    raise ValueError("Could not parse valid JSON from LLM response.")

def extract_pdf_text(pdf_path: Path) -> str:
    if PdfReader is None:
        raise RuntimeError("pypdf required: pip install pypdf")
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted + "\n"
    return text

def split_narration_sentences(narration_text: str):
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', narration_text) if len(s.strip()) > 3]
    return sentences or [narration_text.strip()]

def get_media_duration(file_path: Path) -> float:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(file_path)
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    return float(res.stdout.strip())

async def _edge_tts_stream_narration(text: str, dest: Path, voice: str):
    proxy = os.getenv("EDGE_TTS_PROXY") or None
    communicate = edge_tts.Communicate(text, voice, proxy=proxy, boundary="SentenceBoundary")
    cues = []
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                start = float(chunk["offset"]) / TTS_TICKS_PER_SECOND
                end = float(chunk["offset"] + chunk["duration"]) / TTS_TICKS_PER_SECOND
                cues.append({
                    "kind": chunk["type"],
                    "text": (chunk.get("text") or "").strip(),
                    "start_time": round(start, 3),
                    "end_time": round(end, 3),
                })
    return cues

def synthesize_narration_timeline(narration_text: str, voice: str, lesson_dir: Path):
    dest = lesson_dir / "narration.mp3"
    if dest.exists():
        dest.unlink()
    cues = asyncio.run(_edge_tts_stream_narration(narration_text, dest, voice))
    timeline = [{"text": c["text"], "start_time": c["start_time"], "end_time": c["end_time"]} for c in cues if c.get("text")]
    if not timeline:
        total = max(get_media_duration(dest), 0.4)
        sentences = split_narration_sentences(narration_text)
        cursor = 0.0
        dur_step = total / len(sentences)
        for s in sentences:
            timeline.append({"text": s, "start_time": round(cursor, 3), "end_time": round(cursor + dur_step, 3)})
            cursor += dur_step
    return dest, timeline, voice

def extract_audio_segment(src_audio: Path, dest: Path, start_time: float, end_time: float) -> Path:
    duration = max(0.25, float(end_time) - float(start_time))
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{max(0.0, float(start_time)):.3f}",
        "-i", str(src_audio),
        "-t", f"{duration:.3f}",
        "-ac", "1", "-ar", "24000",
        "-c:a", "libmp3lame", "-q:a", "4",
        str(dest),
    ]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    return dest

def concat_mascot_clips(clip_paths, output_path: Path) -> Path:
    output_path = Path(output_path)
    list_file = output_path.parent / "mascot_concat.txt"
    with open(list_file, "w", encoding="utf-8") as handle:
        for clip in clip_paths:
            escaped = str(Path(clip).resolve()).replace("\\", "/").replace("'", r"'\''")
            handle.write(f"file '{escaped}'\n")
    cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        str(output_path),
    ]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    if list_file.exists():
        list_file.unlink()
    return output_path

# ------------------------------------------------------------------------------
# 4. STORYBOARD PROCESSING & SUPABASE CLOUD SYNC
# ------------------------------------------------------------------------------
def world_to_canvas(pos, include_scale=False, default_scale=1.0):
    x, y = float(pos.get("x", 0)), float(pos.get("y", 0))
    canvas = {"x": round(CANVAS_WIDTH / 2 + x, 1), "y": round(CANVAS_HEIGHT / 2 - y, 1)}
    if include_scale:
        canvas["scale"] = float(pos.get("scale", default_scale))
    return canvas

def panels_to_visual_events(narration_timeline):
    total_time = narration_timeline[-1]["end_time"] if narration_timeline else 180.0
    phase_dur = total_time / len(SPATIAL_PHASES)
    events = []
    for idx, spatial in enumerate(SPATIAL_PHASES):
        events.append({
            "type": spatial["event_type"],
            "start_time": round(idx * phase_dur, 3),
            "end_time": round((idx + 1) * phase_dur, 3),
            "title": f"Phase {idx + 1}: {spatial['phase']}",
            "items": [f"Key learning outcome {idx + 1}"],
            "mascot_pose": spatial["mascot_pose"],
            "mascot_position": world_to_canvas(spatial["mascot"], include_scale=True),
            "card_position": world_to_canvas(spatial["card"]),
            "glowing_badge": spatial["glowing_badge"],
        })
    return events

import mimetypes

def upload_lesson_to_supabase(lesson_dir: Path, grade: str, subject: str, chapter_num: int, lesson_idx: int, lesson_title: str, quiz_data: dict, total_seconds: float):
    if not supabase:
        print("   ℹ️ Supabase credentials not found. Local assets preserved in Rendered_Output.")
        return

    bucket_name = "lesson-assets"
    remote_base = f"{grade.lower()}/{subject.lower()}/chapter-{chapter_num}/lesson-{lesson_idx}"
    print(f"\n   ☁️ Uploading Lesson {lesson_idx} media to Supabase Storage [{bucket_name}]...")

    files_to_sync = ["background.jpg", "narration.mp3", "talking_mascot.mp4", "props.json", "quiz.json"]
    public_urls = {}

    for file_name in files_to_sync:
        local_path = lesson_dir / file_name
        if local_path.is_file():
            storage_path = f"{remote_base}/{file_name}"
            file_bytes = local_path.read_bytes()
            
            # Determine legitimate MIME type (no "auto" string)
            content_type = mimetypes.guess_type(str(local_path))[0] or "application/octet-stream"
            if file_name.endswith(".json"):
                content_type = "application/json"

            try:
                supabase.storage.from_(bucket_name).upload(
                    path=storage_path,
                    file=file_bytes,
                    file_options={"upsert": "true", "content-type": content_type}
                )
            except Exception as upload_err:
                # If file already exists and upload throws conflict, update it
                try:
                    supabase.storage.from_(bucket_name).update(
                        path=storage_path,
                        file=file_bytes,
                        file_options={"upsert": "true", "content-type": content_type}
                    )
                except Exception as inner_err:
                    print(f"      ⚠️️ Failed uploading {file_name}: {inner_err}")

            url = supabase.storage.from_(bucket_name).get_public_url(storage_path)
            public_urls[file_name] = url
            print(f"      ✅ Uploaded: {file_name} ({content_type})")

    try:
        supabase.table("micro_lessons").upsert({
            "grade": grade,
            "subject": subject,
            "chapter_number": chapter_num,
            "lesson_index": lesson_idx,
            "title": lesson_title,
            "props_url": public_urls.get("props.json", ""),
            "quiz_data": quiz_data,
            "duration_seconds": int(total_seconds)
        }, on_conflict="grade,subject,chapter_number,lesson_index").execute()
        print(f"   ✅ Upserted metadata to PostgreSQL table [micro_lessons]: Lesson {lesson_idx}")
    except Exception as err:
        print(f"   ⚠️ PostgreSQL sync notice: {err}")

# ------------------------------------------------------------------------------
# 5. LLM STORYBOARD PROMPTING (SCALABLE 3-MINUTE CURRICULUM)
# ------------------------------------------------------------------------------
def build_storyboard_prompt(class_name: str) -> str:
    return f"""
    You are the Senior Curriculum Director for Kriti School.
    Analyze the provided PDF content and break down this chapter into 4 to 5 comprehensive, highly engaging micro-lessons for {class_name} students.

    NARRATIVE & PEDAGOGICAL GUIDELINES:
    1. Duration: Aim for ~3 minutes of spoken narration per lesson (approximately 380-420 words of clear, spoken text).
    2. Conversational Direct Address: Speak directly to the listener using natural conversational engagement ("Welcome back!", "Look at what happens here", "Imagine this").
       DO NOT hardcode a specific student name into the spoken narration text so that this audio track can be seamlessly shared across all learners.
    3. Structural Phases: Structure the narration across 4 distinct phases:
       - Phase 1: Real-world hook & intuitive motivation
       - Phase 2: Core theoretical concept & definitions
       - Phase 3: Step-by-step worked example or historical inquiry
       - Phase 4: Big-picture recap & takeaway challenge

    JSON SCHEMA REQUIREMENTS:
    Return an unwrapped JSON array of lesson objects with this exact structure:
    [
      {{
        "lesson_title": "Descriptive, engaging lesson title",
        "background_prompt": "Cinematic visual scene description of historical architecture, landscape, or mathematical space, 8k, photorealistic digital art --no text --no people",
        "narration_text": "Spoken narration text (~380-420 words) covering all 4 phases smoothly.",
        "initial_quiz": [
          {{
            "id": "q1",
            "question": "Conceptual question text",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correct_answer": "Option A",
            "explanation": "Clear explanation of the concept"
          }}
        ]
      }}
    ]
    """

def generate_micro_lessons(pdf_path: Path, prompt: str, provider: str = "gemini"):
    pdf_text = extract_pdf_text(pdf_path)

    # 1. Anthropic Path (with automatic failover)
    if provider == "anthropic" and os.getenv("ANTHROPIC_API_KEY"):
        try:
            client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            res = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=8192,
                messages=[{"role": "user", "content": f"PDF TEXTBOOK EXCERPT:\n{pdf_text[:15000]}\n\n{prompt}"}]
            )
            return clean_and_parse_json(res.content[0].text)
        except Exception as err:
            print(f"   ⚠️ Anthropic failed: {err}. Falling back to Gemini...")

    # 2. Gemini Multi-Model Cascade with Exponential Backoff
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not configured.")

    client = genai.Client(api_key=api_key)
    candidate_models = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"]

    for model_name in candidate_models:
        for attempt in range(1, 4):
            try:
                print(f"   🤖 Calling Gemini [{model_name}] (Attempt {attempt}/3)...")
                res = client.models.generate_content(
                    model=model_name,
                    contents=[prompt, pdf_text[:15000]],
                    config=types.GenerateContentConfig(response_mime_type="application/json")
                )
                if res.text:
                    print(f"   ✅ Successfully generated syllabus using [{model_name}].")
                    return clean_and_parse_json(res.text)
            except Exception as e:
                err_msg = str(e)
                if "503" in err_msg or "UNAVAILABLE" in err_msg or "429" in err_msg:
                    wait_time = attempt * 4
                    print(f"   ⏳ {model_name} busy (503/429). Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"   ⚠️ {model_name} error: {err_msg[:90]}. Trying next model...")
                    break

    raise RuntimeError("All LLM providers and model fallbacks failed. Please check API quota or try again in a few minutes.")

# ------------------------------------------------------------------------------
# 6. PIPELINE ORCHESTRATION
# ------------------------------------------------------------------------------
def process_chapter_pdf(pdf_path: Path, class_name: str, subject_name: str, chapter_num: int, provider: str = "anthropic", mascot_name: str = "gyanu", default_student: str = "Scholar"):
    chapter_name = pdf_path.stem
    voice = MASCOT_VOICES.get(mascot_name.lower(), "en-US-AndrewMultilingualNeural")
    chapter_output_dir = RENDERED_OUTPUT_DIR / class_name / subject_name / chapter_name

    print(f"\n==================================================")
    print(f"🚀 Kriti Engine: [{class_name}] -> [{subject_name}] -> [Chapter {chapter_num}]")
    print(f"🎭 Presenter: [{mascot_name.upper()}] | Neural Voice: [{voice}]")
    print(f"==================================================")

    prompt = build_storyboard_prompt(class_name)
    lessons = generate_micro_lessons(pdf_path, prompt, provider=provider)
    if isinstance(lessons, dict) and "lessons" in lessons:
        lessons = lessons["lessons"]

    print(f"🧩 Successfully structured {len(lessons)} comprehensive micro-lessons.")

    for idx, lesson in enumerate(lessons):
        title = lesson.get("lesson_title") or f"Micro-Lesson {idx + 1}"
        narration_text = lesson.get("narration_text", "")
        bg_prompt = lesson.get("background_prompt") or f"Cinematic digital background for {title}"
        quiz_data = {"item_pool": lesson.get("initial_quiz", [])}

        print(f"\n⚡ Synthesizing Micro-Lesson {idx + 1}/{len(lessons)}: {title}")
        lesson_dir = chapter_output_dir / f"Micro_Lesson_{idx + 1}"
        lesson_dir.mkdir(parents=True, exist_ok=True)

        # 1. Dynamic Background Generation (SDXL Turbo)
        bg_file = lesson_dir / "background.jpg"
        generate_story_background(bg_prompt, bg_file)

        # 2. Audio Narration & Sentence Timeline
        print(f"   🎙️ Synthesizing voice audio & sentence boundaries ({voice})...")
        full_audio, narration_timeline, _ = synthesize_narration_timeline(narration_text, voice, lesson_dir)
        total_duration = narration_timeline[-1]["end_time"] if narration_timeline else 180.0

        # 3. Presenter Avatar Lip-Sync
        mascot_dir = resolve_mascot_pose_dir(mascot_name)
        visual_events = panels_to_visual_events(narration_timeline)
        clip_paths = []
        mascot_clips = []

        for b_idx, event in enumerate(visual_events):
            pose = event["mascot_pose"]
            clip_name = f"talking_mascot_{b_idx}_{pose}.mp4"
            clip_path = lesson_dir / clip_name
            beat_audio = lesson_dir / f"beat_{b_idx}_{pose}.mp3"
            extract_audio_segment(full_audio, beat_audio, event["start_time"], event["end_time"])

            generate_talking_mascot(
                mascot_dir,
                beat_audio,
                clip_path,
                pose_type=pose,
                mascot_name=mascot_name,
            )
            if beat_audio.exists():
                beat_audio.unlink()

            mascot_clips.append({"video_url": clip_name, "start_time": event["start_time"], "end_time": event["end_time"]})
            clip_paths.append(clip_path)

        talking_mascot_path = lesson_dir / "talking_mascot.mp4"
        concat_mascot_clips(clip_paths, talking_mascot_path)

        # 4. Write Remotion Dynamic Props (No Headless Browser Rendering!)
        props = {
            "lesson_title": title,
            "student_name": default_student,
            "durationInSeconds": total_duration,
            "bg_image_url": "background.jpg",
            "talking_mascot_video_url": "talking_mascot.mp4",
            "narration_timeline": narration_timeline,
            "visual_events": visual_events,
        }
        with open(lesson_dir / "props.json", "w", encoding="utf-8") as f:
            json.dump(props, f, indent=2)
        with open(lesson_dir / "quiz.json", "w", encoding="utf-8") as f:
            json.dump(quiz_data, f, indent=2)

        # 5. Direct Supabase Cloud Sync
        upload_lesson_to_supabase(
            lesson_dir=lesson_dir,
            grade=class_name,
            subject=subject_name,
            chapter_num=chapter_num,
            lesson_idx=idx + 1,
            lesson_title=title,
            quiz_data=quiz_data,
            total_seconds=total_duration
        )

    print(f"\n🎉 All lessons generated and synchronized to cloud storage successfully!")

def main():
    parser = argparse.ArgumentParser(description="Kriti Drona Engine Cloud Pipeline")
    parser.add_argument("--grade", type=str, default="Class-7")
    parser.add_argument("--subject", type=str, default="SocialScience-Part1-Class-7")
    parser.add_argument("--chapter", type=int, default=6)
    parser.add_argument("--provider", type=str, default="anthropic")
    parser.add_argument("--mascot", type=str, default="gyanu")
    parser.add_argument("--student-name", type=str, default="Scholar")
    args = parser.parse_args()

    subject_dir = SOURCE_BOOKS_DIR / args.grade / args.subject
    pdf_files = list(subject_dir.glob(f"Chapter-{args.chapter}.pdf")) or list(subject_dir.glob(f"Chapter-{args.chapter:02d}.pdf"))

    if not pdf_files:
        print(f"❌ PDF for Chapter {args.chapter} not found under: {subject_dir}")
        return

    process_chapter_pdf(
        pdf_path=pdf_files[0],
        class_name=args.grade,
        subject_name=args.subject,
        chapter_num=args.chapter,
        provider=args.provider,
        mascot_name=args.mascot,
        default_student=args.student_name,
    )

if __name__ == "__main__":
    main()