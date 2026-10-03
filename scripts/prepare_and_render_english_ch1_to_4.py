"""
Prepare + render English-Poorvi Chapters 1-4 from cached storyboards.

Existing English caches have ~170-word narrations (below the SS 450-word floor),
so Chapter_Agent skips them. This script produces audio/props and Remotion MP4s
from those storyboards anyway, one chapter at a time.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")

from Chapter_Agent import (  # noqa: E402
    MASCOT_VOICES,
    RENDERED_OUTPUT_DIR,
    align_storyboard_panels,
    audit_panel_coverage,
    ensure_lesson_list,
    expand_quiz_item_pool,
    extract_pdf_text,
    normalize_storyboard,
    produce_comic_lesson,
    split_narration_sentences,
)

SUBJECT = "English-Poorvi"
CLASS_NAME = "Class-7"
CHAPTERS = [1, 2, 3, 4]
PROVIDER = "gemini"
MASCOT = "gyanu"
STUDENT = "Saanvi"
SOURCE_PDF_ROOT = ROOT / "Source_Books" / CLASS_NAME / SUBJECT


def load_lessons(chapter_dir: Path) -> list[dict]:
    cache = chapter_dir / "generated_response.json"
    if cache.is_file():
        raw = json.loads(cache.read_text(encoding="utf-8"))
        lessons = ensure_lesson_list(raw)
        if lessons:
            return lessons

    lessons = []
    for lesson_dir in sorted(chapter_dir.glob("Micro_Lesson_*")):
        sb = lesson_dir / "storyboard.json"
        if not sb.is_file():
            continue
        data = json.loads(sb.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            lessons.append(data)
    return lessons


def flatten_english_panels(lesson: dict) -> dict:
    """English comic panels nest title/items under visual_data; lift them up."""
    out = dict(lesson)
    panels = out.get("panels")
    if not isinstance(panels, list):
        return out
    flat = []
    for panel in panels:
        if not isinstance(panel, dict):
            continue
        p = dict(panel)
        vd = p.get("visual_data") if isinstance(p.get("visual_data"), dict) else {}
        if not p.get("title") and vd.get("title"):
            p["title"] = vd["title"]
        if not p.get("items") and isinstance(vd.get("items"), list):
            p["items"] = vd["items"]
        if not p.get("type") and vd.get("type"):
            p["type"] = vd["type"]
        if not p.get("bg_prompt") and (vd.get("bg_prompt") or p.get("background_prompt")):
            p["bg_prompt"] = vd.get("bg_prompt") or p.get("background_prompt") or ""
        flat.append(p)
    out["panels"] = flat
    return out


def process_lesson(
    lesson: dict,
    idx: int,
    chapter_dir: Path,
    pdf_text: str,
    *,
    force_regen: bool = False,
) -> bool:
    title_guess = lesson.get("lesson_title") or lesson.get("title") or f"Lesson {idx + 1}"
    lesson = flatten_english_panels(lesson)
    # Soft completeness: allow short English narrations if panels exist.
    panels = lesson.get("panels") if isinstance(lesson.get("panels"), list) else []
    narr = ""
    for k in ("narration_text", "narration", "script"):
        if isinstance(lesson.get(k), str) and lesson[k].strip():
            narr = lesson[k].strip()
            break
    if len(panels) < 2 or len(narr.split()) < 40:
        print(f"   ❌ Skipping incomplete lesson [{title_guess}] panels={len(panels)} words={len(narr.split())}")
        return False

    lesson = align_storyboard_panels(dict(lesson), split_narration_sentences)
    for warning in audit_panel_coverage(lesson, split_narration_sentences):
        print(f"   ⚠️ Panel coverage: {warning}")

    title, _bg, narration_text, panels, initial_quiz = normalize_storyboard(lesson)
    title = title or f"Micro-Lesson {idx + 1}"
    print(f"\n⚡ English Micro-Lesson {idx + 1}: {title} ({len((narration_text or '').split())} words)")

    lesson_dir = chapter_dir / f"Micro_Lesson_{idx + 1}"
    lesson_dir.mkdir(parents=True, exist_ok=True)

    # Persist storyboard
    (lesson_dir / "storyboard.json").write_text(
        json.dumps(lesson, indent=2), encoding="utf-8"
    )

    # Quiz
    full_quiz = expand_quiz_item_pool(
        lesson_title=title,
        pdf_text=pdf_text,
        initial_quiz=initial_quiz,
        provider=PROVIDER,
        subject_name=SUBJECT,
        narration_text=narration_text,
        target_count=6,
    )
    (lesson_dir / "quiz.json").write_text(json.dumps(full_quiz, indent=2), encoding="utf-8")
    print(f"   📝 Quiz pool: {len(full_quiz.get('item_pool', []))} items")

    if not narration_text or not panels:
        print("   ❌ Missing narration/panels after normalize")
        return False

    (lesson_dir / "narration.txt").write_text(narration_text, encoding="utf-8")

    voice = MASCOT_VOICES.get(MASCOT, "en-US-AndrewMultilingualNeural")
    out = produce_comic_lesson(
        lesson_title=title,
        narration_text=narration_text,
        panels=panels,
        lesson_dir=lesson_dir,
        mascot_name=MASCOT,
        voice=voice,
        student_name=STUDENT,
        force_regen=force_regen,
        subject_name=SUBJECT,
        class_name=CLASS_NAME,
        chapter_name=chapter_dir.name,
        chapter_output_dir=chapter_dir,
    )
    mp4 = lesson_dir / "output.mp4"
    ok = mp4.is_file() and mp4.stat().st_size > 1_000_000
    print(f"   {'✅' if ok else '❌'} output.mp4={'%.1fMB' % (mp4.stat().st_size/1024/1024) if mp4.exists() else 'missing'}")
    return bool(ok or out)


def run_chapter(chapter_num: int) -> bool:
    chapter_dir = RENDERED_OUTPUT_DIR / CLASS_NAME / SUBJECT / f"Chapter-{chapter_num}"
    chapter_dir.mkdir(parents=True, exist_ok=True)
    pdf = SOURCE_PDF_ROOT / f"Chapter-{chapter_num}.pdf"
    pdf_text = extract_pdf_text(pdf) if pdf.is_file() else ""

    print("\n" + "=" * 70)
    print(f"English {SUBJECT} Chapter-{chapter_num}")
    print("=" * 70)

    lessons = load_lessons(chapter_dir)
    if not lessons:
        print("   ❌ No lessons found in cache or Micro_Lesson_*/storyboard.json")
        return False

    print(f"   Found {len(lessons)} micro-lesson(s)")
    results = []
    for idx, lesson in enumerate(lessons):
        # Force regen when prior audio was empty / props missing
        lesson_dir = chapter_dir / f"Micro_Lesson_{idx + 1}"
        props = lesson_dir / "props.json"
        mp4 = lesson_dir / "output.mp4"
        force = not (props.is_file() and mp4.is_file() and mp4.stat().st_size > 1_000_000)
        try:
            results.append(process_lesson(lesson, idx, chapter_dir, pdf_text, force_regen=force))
        except Exception as exc:
            print(f"   ❌ Lesson {idx + 1} failed: {exc}")
            results.append(False)

    ok = all(results) and bool(results)
    print(f"Chapter-{chapter_num}: {'SUCCESS' if ok else 'PARTIAL/FAIL'} ({sum(results)}/{len(results)})")
    return ok


def main() -> int:
    overall = []
    for ch in CHAPTERS:
        t0 = time.time()
        ok = run_chapter(ch)
        overall.append((ch, ok, time.time() - t0))
        print(f"Cooldown after Chapter-{ch}...")
        time.sleep(8)

    print("\n" + "#" * 70)
    for ch, ok, elapsed in overall:
        print(f"  Chapter-{ch}: {'SUCCESS' if ok else 'FAIL'} ({elapsed/60:.1f} min)")
    print("#" * 70)
    return 0 if all(ok for _, ok, _ in overall) else 1


if __name__ == "__main__":
    raise SystemExit(main())
