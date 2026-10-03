"""
Prepare + render English-Poorvi Chapters 1–5 (full redo).

Each unit → 3 micro-lessons (story / poem / third piece), SS-length narration,
textbook artifacts enabled, exercise-based quizzes with explanations,
Gyanu voice (en-US-AndrewMultilingualNeural).

Usage (from repo root):
  python -u scripts/prepare_and_render_english_ch1_to_5.py
  python -u scripts/prepare_and_render_english_ch1_to_5.py --extract-only
  python -u scripts/prepare_and_render_english_ch1_to_5.py --chapter 1 --only 2
  python -u scripts/prepare_and_render_english_ch1_to_5.py --resume
  python -u scripts/prepare_and_render_english_ch1_to_5.py --skip-generate
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")

from config.env import load_env_file  # noqa: E402

load_env_file(ROOT / ".env")

from Chapter_Agent import (  # noqa: E402
    MASCOT_VOICES,
    MAX_ITEM_CHARS,
    MAX_TITLE_CHARS,
    NARRATION_WORDS_MAX,
    NARRATION_WORDS_MIN,
    RENDERED_OUTPUT_DIR,
    align_storyboard_panels,
    build_chapter_id,
    clean_and_parse_json,
    expand_quiz_item_pool,
    extract_pdf_text,
    load_chapter_manifest,
    normalize_storyboard,
    produce_comic_lesson,
    split_narration_sentences,
)
from artifact_config import format_manifest_for_prompt  # noqa: E402
from pdf_artifact_extractor import ensure_chapter_artifacts_from_pdf  # noqa: E402
from english_literary import (  # noqa: E402
    build_english_literary_prompt,
    build_literary_fallback_storyboard,
    clean_english_pdf_text,
    english_narration_qa_gate,
    segment_english_piece,
)

CLASS_NAME = "Class-7"
SUBJECT_NAME = "English-Poorvi"
SOURCE_ROOT = ROOT / "Source_Books" / CLASS_NAME / SUBJECT_NAME
STUDENT_NAME = "Saanvi"
MASCOT_NAME = "gyanu"
PROVIDER = os.getenv("KRITI_PREPARE_PROVIDER", "gemini")

# Unit theme → three literary pieces (story / poem / third)
CHAPTER_SPECS: dict[int, dict] = {
    1: {
        "unit": "Learning Together",
        "lessons": [
            {
                "lesson_num": 1,
                "title": "The Day the River Spoke",
                "piece_type": "story",
                "author": '',
                "must_name": ['Jahnavi'],
                "arc": 'Fear of school → magical conversation with the river → one brave step toward learning',
                "coverage": """
- Story overview: Jahnavi lives by a river; she longs to go to school but feels shy and afraid.
- The river speaks to her — magical, listening, encouraging — and pushes her to take one brave step.
- Trace the emotional arc: fear → curiosity → courage → hope; how nature becomes a friend/teacher.
- Key scenes and dialogue that show Jahnavi's change of heart; what "the river spoke" means figuratively and in the tale.
- Themes: courage, education, listening to your dreams, finding voice.
- Language craft: sound words / vivid verbs from the story; how the author paints pictures with sound and feeling.
- Exercises: answer Let us discuss / Let us learn questions from this story section; explain WHY each answer is correct in narration where natural (without reading quiz options aloud).
""",
            },
            {
                "lesson_num": 2,
                "title": "Try Again",
                "piece_type": "poem",
                "author": '',
                "must_name": [],
                "arc": 'Stanza walk: failure → try again → persistence as courage',
                "coverage": """
- Poem walkthrough: recite and explain key stanzas of "Try Again" in warm student-friendly language.
- Central message: persistence after failure; courage to attempt again; not giving up.
- Highlight imagery, rhyme/rhythm, and any refrains that reinforce the theme.
- Connect poem ideas to real student life (exams, skills, friendships) with 2–3 concrete examples.
- Vocabulary / poetic devices appropriate for Class 7 (refrain, imagery, tone).
- Exercises: cover Let us discuss / Let us learn items for this poem; narrate correct reasoning for sample answers.
""",
            },
            {
                "lesson_num": 3,
                "title": "Three Days to See",
                "piece_type": "non-fiction",
                "author": 'Helen Keller',
                "must_name": ['Helen Keller'],
                "arc": 'Day 1: people she loves → Day 2: nature and museums → Day 3: city life → gratitude for sight',
                "coverage": """
- MUST name Helen Keller in the first ~40 words as the writer of this non-fiction essay.
- Never speak PDF chrome (.indd, timestamps, Reprint lines) or glossary dumps.
- Walk her imagined three days of sight as a short film: Day 1 people she loves; Day 2 nature + museums/history of life; Day 3 the busy city and ordinary lives.
- Contrast touch/fingertips with the gift of sight; awe, gratitude, noticing beauty we take for granted.
- Themes: empathy, gratitude, curiosity; inspiring Class-7 tone — not gloomy.
- Link briefly to Unit 1 Learning Together — learning includes noticing and caring.
- Close with one Let us discuss/learn answer explained with textual evidence.
""",
            },
        ],
    },
    2: {
        "unit": "Wit and Humour",
        "lessons": [
            {
                "lesson_num": 1,
                "title": "Animals, Birds, and Dr. Dolittle",
                "piece_type": "story",
                "author": 'Hugh Lofting',
                "must_name": ['Dr. Dolittle'],
                "arc": 'Doctor who listens to animals → comic episodes → empathy and communication',
                "coverage": """
- Story of Dr. Dolittle: a doctor who understands animal speech; how animals "talk" beyond human words.
- Humorous episodes that show wit; how listening carefully builds understanding.
- Characters, setting, and the playful tone of the narrative.
- Themes: empathy for animals, communication, curiosity, humour.
- Language: compound words / word play appearing in or around this unit piece; explain with examples from the text.
- Exercises: Let us discuss / learn questions for this story; explain correct answers with evidence from the text.
""",
            },
            {
                "lesson_num": 2,
                "title": "A Funny Man",
                "piece_type": "poem",
                "author": '',
                "must_name": [],
                "arc": 'Funny situations and odd behaviour → rhyme and surprise → joy of noticing details',
                "coverage": """
- Poem walkthrough of "A Funny Man": funny situations, unexpected behaviour, light-hearted tone.
- Recite/paraphrase key lines; explain jokes and surprises without spoiling the fun.
- Poetic devices: rhyme, humour through contrast or exaggeration.
- What the poem teaches about laughter, oddity, and noticing details.
- Exercises: poem comprehension and Let us learn items; narrate why sample answers are right.
""",
            },
            {
                "lesson_num": 3,
                "title": "Say the Right Thing",
                "piece_type": "play",
                "author": '',
                "must_name": [],
                "arc": 'Social scenes → saying the wrong vs right thing → tact, wit, recovery',
                "coverage": """
- Play / conversation piece: saying the right (or wrong) thing in social situations; manners, tact, humour.
- Key scenes/dialogues that create comic misunderstanding; how characters recover.
- Themes: polite speech, listening, choosing words carefully, wit.
- Dramatic reading style in narration: voices of characters briefly paraphrased.
- Exercises: discussion and language tasks after the play; explain model answers with textual support.
""",
            },
        ],
    },
    3: {
        "unit": "Dreams and Discoveries",
        "lessons": [
            {
                "lesson_num": 1,
                "title": "My Brother's Great Invention",
                "piece_type": "story",
                "author": '',
                "must_name": ['Anand'],
                "arc": 'Invention idea → cause-effect mishaps → character traits of a young inventor',
                "coverage": """
- Story of Anand (or the inventor sibling) and the burglar-alarm / invention mishaps — comedy of cause and effect.
- Trace cause → effect chains clearly so students see how one idea leads to chaos or discovery.
- Character traits of the young inventor: curiosity, confidence, carelessness, creativity.
- Themes: experimentation, learning from failure, family, humour in science-at-home.
- Exercises: Let us discuss / learn items (cause-effect, character); explain correct answers with story evidence.
""",
            },
            {
                "lesson_num": 2,
                "title": "Paper Boats",
                "piece_type": "poem",
                "author": 'Rabindranath Tagore',
                "must_name": ['Rabindranath Tagore'],
                "arc": 'Paper boats on the stream → monsoon images → dreams floating to distant friends',
                "coverage": """
- Poem "Paper Boats" (Tagore / unit poem): childhood imagination, paper boats on a stream, dreams floating away.
- Walk through images: monsoon, writing name on boats, hope they reach someone far away.
- Themes: wonder, innocence, connection across distance, creativity.
- Poetic language: imagery, mood, simple profound feeling — explain without heavy jargon.
- Exercises: comprehension and appreciation questions; narrate model answer reasoning.
""",
            },
            {
                "lesson_num": 3,
                "title": "North, South, East, West",
                "piece_type": "non-fiction",
                "author": '',
                "must_name": [],
                "arc": 'Directions and discovery → places and people → open-minded travel learning',
                "coverage": """
- Travel / discovery non-fiction in the unit: directions, exploring places, open-minded discovery.
- Key ideas about geography of experience — noticing culture, nature, and people in different directions.
- Themes: curiosity, travel, learning from new places, dreams becoming real journeys.
- Keep narrative engaging with concrete textbook examples and place names from the piece.
- Exercises: discuss/learn/write tasks; explain answers using facts from the text.
""",
            },
        ],
    },
    4: {
        "unit": "Travel and Adventure",
        "lessons": [
            {
                "lesson_num": 1,
                "title": "The Tunnel",
                "piece_type": "story",
                "author": 'Ruskin Bond',
                "must_name": ['Suraj'],
                "arc": "Railway tunnel dare → darkness and fear → courage and the watchman's world",
                "coverage": """
- Story "The Tunnel": adventure, darkness, courage; Suraj / characters facing the railway tunnel.
- Build suspense then resolve; what courage looks like in a scary place.
- Setting details (railway, jungle/hills as in text), the watchman connection if present in this piece.
- Themes: bravery, responsibility, adventure, growing up.
- Exercises: comprehension and discuss questions; explain answers with textual evidence.
""",
            },
            {
                "lesson_num": 2,
                "title": "Travel",
                "piece_type": "poem",
                "author": '',
                "must_name": [],
                "arc": 'Longing to travel → trains/ships imagery → imagination of far places',
                "coverage": """
- Poem "Travel": longing to journey, trains/ships/imagination of far-off places.
- Recite/paraphrase key lines; mood of wanderlust and curiosity.
- Imagery of vehicles, destinations, the pull of the unknown.
- Themes: imagination, adventure spirit, restlessness vs home.
- Exercises: poem questions; narrate why answers fit the poem's tone and meaning.
""",
            },
            {
                "lesson_num": 3,
                "title": "Conquering the Summit",
                "piece_type": "non-fiction",
                "author": '',
                "must_name": [],
                "arc": 'Prepare → climb challenges → summit perseverance and respect for nature',
                "coverage": """
- Non-fiction adventure: climbing / conquering a summit — preparation, perseverance, teamwork, respect for nature.
- Key factual beats from the textbook piece (people, mountain, challenges, triumph).
- Themes: grit, planning, humility before nature, national/adventure pride as in text.
- Keep thrilling but accurate to the chapter content.
- Exercises: discuss/learn questions; explain model answers with facts from the piece.
""",
            },
        ],
    },
    5: {
        "unit": "Bravehearts",
        "lessons": [
            {
                "lesson_num": 1,
                "title": "A Homage to Our Brave Soldiers",
                "piece_type": "story",
                "author": '',
                "must_name": [],
                "arc": "Homage scenes → soldiers' courage and sacrifice → gratitude and peace",
                "coverage": """
- Homage piece: honouring soldiers' courage, sacrifice, and service to the nation.
- Concrete examples/stories from the textbook; memorials, letters, or visits if present.
- Themes: patriotism, gratitude, bravery, peace that sacrifice protects.
- Tone: respectful, moving, age-appropriate — not graphic.
- Exercises: discuss/learn questions; explain answers with evidence from the homage text.
""",
            },
            {
                "lesson_num": 2,
                "title": "My Dear Soldiers",
                "piece_type": "poem",
                "author": '',
                "must_name": [],
                "arc": 'Address to soldiers → images of pride and prayer → remembrance',
                "coverage": """
- Poem "My Dear Soldiers": address to soldiers; gratitude, prayer, pride.
- Walk through stanzas; key images and emotional appeals.
- Themes: love for soldiers, nation, remembrance.
- Poetic devices: apostrophe (speaking to soldiers), imagery, tone of reverence.
- Exercises: poem comprehension; narrate correct answer explanations.
""",
            },
            {
                "lesson_num": 3,
                "title": "Rani Abbakka",
                "piece_type": "graphic",
                "author": '',
                "must_name": ['Rani Abbakka'],
                "arc": 'Graphic beats of resistance → leadership against invaders → why she is remembered',
                "coverage": """
- Graphic / illustrated narrative of Rani Abbakka: resistance, leadership, courage against invaders as in textbook.
- Story beats panel-by-panel in narrative form; who she was and why she is remembered.
- Themes: brave women in history, freedom, strategy, inspiration for Class 7.
- Use textbook illustrations as visual anchors (artifact panels).
- Exercises: questions after the graphic narrative; explain answers using story facts.
""",
            },
        ],
    },
}


def flatten_english_panels(lesson: dict) -> dict:
    """Lift title/items/type from nested visual_data when present."""
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
        for key in ("visual_mode", "artifact_id", "mascot_pose", "phase"):
            if not p.get(key) and vd.get(key):
                p[key] = vd[key]
        flat.append(p)
    out["panels"] = flat
    return out


def partition_artifacts(manifest: dict | None, n_lessons: int = 3) -> list[list[str]]:
    arts = []
    if isinstance(manifest, dict):
        for a in manifest.get("artifacts") or []:
            if isinstance(a, dict) and a.get("id"):
                arts.append(str(a["id"]))
    if not arts:
        return [[] for _ in range(n_lessons)]
    buckets: list[list[str]] = [[] for _ in range(n_lessons)]
    for i, aid in enumerate(arts):
        buckets[i % n_lessons].append(aid)
    return buckets


def wipe_chapter_lessons(chapter_dir: Path) -> None:
    """Remove old micro-lessons and short storyboard caches (keep artifacts/)."""
    for child in list(chapter_dir.iterdir()) if chapter_dir.is_dir() else []:
        if child.name.startswith("Micro_Lesson_"):
            shutil.rmtree(child, ignore_errors=True)
            print(f"   🧹 Removed {child.name}")
        elif child.name in {"generated_response.json"}:
            child.unlink(missing_ok=True)
            print(f"   🧹 Removed {child.name}")


def extract_chapter_artifacts(chapter_num: int, *, force: bool = True) -> Path | None:
    chapter_name = f"Chapter-{chapter_num}"
    pdf = SOURCE_ROOT / f"{chapter_name}.pdf"
    chapter_dir = RENDERED_OUTPUT_DIR / CLASS_NAME / SUBJECT_NAME / chapter_name
    chapter_dir.mkdir(parents=True, exist_ok=True)
    chapter_id = build_chapter_id(CLASS_NAME, SUBJECT_NAME, chapter_name)
    if not pdf.is_file():
        print(f"   ❌ Missing PDF: {pdf}")
        return None
    print(f"\n{'=' * 70}\n📷 Extracting artifacts {SUBJECT_NAME} {chapter_name}\n{'=' * 70}")
    return ensure_chapter_artifacts_from_pdf(
        pdf,
        chapter_id,
        class_name=CLASS_NAME,
        subject_name=SUBJECT_NAME,
        chapter_name=chapter_name,
        chapter_output_dir=chapter_dir,
        force=force,
        provider=PROVIDER,
        use_llm_captions=True,
    )



def build_fallback_storyboard(
    *,
    pdf_text: str,
    chapter_num: int,
    unit: str,
    spec: dict,
    artifact_ids: list[str],
    next_titles: list[str] | None = None,
) -> dict:
    """Literary fallback — never pastes raw PDF chrome into narration."""
    piece = segment_english_piece(pdf_text, spec["title"], next_titles=next_titles)
    return build_literary_fallback_storyboard(
        piece_text=piece,
        chapter_num=chapter_num,
        unit=unit,
        spec=spec,
        artifact_ids=artifact_ids,
        student_name=STUDENT_NAME,
        max_title_chars=MAX_TITLE_CHARS,
        max_item_chars=MAX_ITEM_CHARS,
    )


def _ensure_storyboard_quality(
    lesson_obj: dict,
    *,
    spec: dict,
    pdf_text: str,
    chapter_num: int,
    unit: str,
    artifact_ids: list[str],
    next_titles: list[str] | None,
) -> dict:
    ok, reasons = english_narration_qa_gate(lesson_obj, spec)
    if ok:
        soft = [r for r in reasons if r.startswith("must_name_not_early:")]
        if soft:
            print(f"   ⚠️ QA soft warnings: {soft}")
        return lesson_obj
    print(f"   ⛔ Narration QA failed: {reasons}")
    # Prefer literary fallback over chrome-tainted drafts
    fb = build_fallback_storyboard(
        pdf_text=pdf_text,
        chapter_num=chapter_num,
        unit=unit,
        spec=spec,
        artifact_ids=artifact_ids,
        next_titles=next_titles,
    )
    ok2, reasons2 = english_narration_qa_gate(fb, spec)
    if not ok2:
        print(f"   ⚠️ Fallback still has QA notes: {reasons2}")
    return fb


def generate_one_storyboard(
    client,
    pdf_text: str,
    *,
    chapter_num: int,
    unit: str,
    spec: dict,
    artifact_ids: list[str],
    artifact_catalog: str,
    total_lessons: int,
    next_titles: list[str] | None = None,
) -> dict:
    num = spec["lesson_num"]
    title = spec["title"]
    piece_text = segment_english_piece(pdf_text, title, next_titles=next_titles)
    if not piece_text:
        piece_text = clean_english_pdf_text(pdf_text)[:5000]

    if os.getenv("KRITI_FORCE_FALLBACK_STORYBOARDS", "").strip() in {"1", "true", "yes"}:
        print("   🧩 KRITI_FORCE_FALLBACK_STORYBOARDS=1 — literary fallback only")
        return _ensure_storyboard_quality(
            build_fallback_storyboard(
                pdf_text=pdf_text,
                chapter_num=chapter_num,
                unit=unit,
                spec=spec,
                artifact_ids=artifact_ids,
                next_titles=next_titles,
            ),
            spec=spec,
            pdf_text=pdf_text,
            chapter_num=chapter_num,
            unit=unit,
            artifact_ids=artifact_ids,
            next_titles=next_titles,
        )

    prompt = build_english_literary_prompt(
        chapter_num=chapter_num,
        unit=unit,
        spec=spec,
        piece_text=piece_text,
        artifact_ids=artifact_ids,
        artifact_catalog=artifact_catalog,
        student_name=STUDENT_NAME,
        total_lessons=total_lessons,
        narration_words_min=NARRATION_WORDS_MIN,
        narration_words_max=NARRATION_WORDS_MAX,
        max_title_chars=MAX_TITLE_CHARS,
        max_item_chars=MAX_ITEM_CHARS,
    )

    user_msg = (
        f"PROMPT:\n{prompt}\n\n"
        "RETURN ONLY VALID UNWRAPPED JSON OBJECT."
    )

    def _llm_raw(msg: str) -> str:
        errors: list[Exception] = []
        skip_anthropic = os.getenv("KRITI_SKIP_ANTHROPIC", "").strip() in {"1", "true", "yes"}

        def _try_gemini() -> str | None:
            from google import genai

            gclient = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
            models = ["gemini-3.8-flash", "gemini-3.6-flash"]
            env_model = (os.getenv("GEMINI_MODEL") or "").strip()
            if (
                env_model
                and env_model not in models
                and "2.5" not in env_model
                and "2.0" not in env_model
            ):
                models.insert(0, env_model)
            seen: set[str] = set()
            models = [m for m in models if not (m in seen or seen.add(m))]
            for model in models:
                for attempt in range(1, 6):
                    try:
                        print(f"   🤖 Gemini model={model} attempt={attempt}")
                        res = gclient.models.generate_content(model=model, contents=msg)
                        text_out = res.text or ""
                        if text_out.strip():
                            return text_out
                    except Exception as e:
                        errors.append(e)
                        print(f"   ⚠️ Gemini error ({model}): {e}")
                        time.sleep(min(60, 10 * attempt))
            return None

        def _try_anthropic() -> str | None:
            nonlocal skip_anthropic
            import anthropic

            if skip_anthropic or not os.getenv("ANTHROPIC_API_KEY"):
                return None
            print("   🤖 Trying Anthropic claude-sonnet-4-6")
            cl = client or anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            try:
                res = cl.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=8192,
                    messages=[{"role": "user", "content": msg}],
                )
                text_out = res.content[0].text or ""
                if text_out.strip():
                    return text_out
            except Exception as e:
                errors.append(e)
                print(f"   ⚠️ Anthropic error: {e}")
                if "credit balance" in str(e).lower():
                    skip_anthropic = True
                    os.environ["KRITI_SKIP_ANTHROPIC"] = "1"
                    print("   ⛔ Disabling Anthropic for rest of run (no credits)")
            return None

        order = [_try_gemini, _try_anthropic]
        if PROVIDER != "gemini":
            order = [_try_anthropic, _try_gemini]
        for fn in order:
            out = fn()
            if out:
                return out
        if errors:
            raise errors[-1]
        raise RuntimeError("All LLM providers failed for storyboard")

    best = None
    msg = user_msg
    for round_i in range(1, 4):
        try:
            raw = _llm_raw(msg)
        except Exception as exc:
            print(f"   ⚠️ LLM round {round_i} failed: {exc}")
            if best is not None:
                return _ensure_storyboard_quality(
                    best,
                    spec=spec,
                    pdf_text=pdf_text,
                    chapter_num=chapter_num,
                    unit=unit,
                    artifact_ids=artifact_ids,
                    next_titles=next_titles,
                )
            print("   🧩 Switching to literary fallback after LLM failure")
            return _ensure_storyboard_quality(
                build_fallback_storyboard(
                    pdf_text=pdf_text,
                    chapter_num=chapter_num,
                    unit=unit,
                    spec=spec,
                    artifact_ids=artifact_ids,
                    next_titles=next_titles,
                ),
                spec=spec,
                pdf_text=pdf_text,
                chapter_num=chapter_num,
                unit=unit,
                artifact_ids=artifact_ids,
                next_titles=next_titles,
            )
        lesson_obj = clean_and_parse_json(raw)
        if isinstance(lesson_obj, list):
            lesson_obj = lesson_obj[0]
        if not isinstance(lesson_obj, dict):
            print(f"   ⚠️ Storyboard parse failed round={round_i}")
            continue
        lesson_obj["lesson_title"] = title
        lesson_obj = flatten_english_panels(lesson_obj)
        words = len((lesson_obj.get("narration_text") or "").split())
        panels = lesson_obj.get("panels") if isinstance(lesson_obj.get("panels"), list) else []
        print(f"   📏 Round {round_i}: {words} words, {len(panels)} panels")
        ok, reasons = english_narration_qa_gate(lesson_obj, spec)
        print(f"   🧪 QA: {'PASS' if ok else 'FAIL'} {reasons}")
        best = lesson_obj
        if ok and words >= max(400, NARRATION_WORDS_MIN - 50) and len(panels) >= 5:
            return lesson_obj
        # Rewrite with QA feedback
        msg = (
            f"PROMPT:\n{prompt}\n\n"
            f"PREVIOUS DRAFT FAILED QUALITY CHECK: {reasons}. "
            f"Rewrite {NARRATION_WORDS_MIN}-{NARRATION_WORDS_MAX} words. "
            f"Name required authors early. ZERO pdf chrome. Movie-like literary walkthrough.\n"
            "RETURN ONLY VALID UNWRAPPED JSON OBJECT."
        )
        time.sleep(2)

    if not best:
        return _ensure_storyboard_quality(
            build_fallback_storyboard(
                pdf_text=pdf_text,
                chapter_num=chapter_num,
                unit=unit,
                spec=spec,
                artifact_ids=artifact_ids,
                next_titles=next_titles,
            ),
            spec=spec,
            pdf_text=pdf_text,
            chapter_num=chapter_num,
            unit=unit,
            artifact_ids=artifact_ids,
            next_titles=next_titles,
        )
    return _ensure_storyboard_quality(
        best,
        spec=spec,
        pdf_text=pdf_text,
        chapter_num=chapter_num,
        unit=unit,
        artifact_ids=artifact_ids,
        next_titles=next_titles,
    )



def process_lesson(
    lesson: dict,
    lesson_num: int,
    *,
    chapter_dir: Path,
    pdf_text: str,
    force_regen: bool,
    spec: dict | None = None,
) -> bool:
    lesson = flatten_english_panels(lesson)
    if spec is not None:
        ok, reasons = english_narration_qa_gate(lesson, spec)
        if not ok:
            print(f"   ⛔ Pre-render QA failed {reasons}; rebuilding literary fallback")
            ch_num = int(chapter_dir.name.split("-")[-1])
            unit = CHAPTER_SPECS[ch_num]["unit"]
            nxt = [
                s["title"]
                for s in CHAPTER_SPECS[ch_num]["lessons"]
                if s["lesson_num"] > lesson_num
            ]
            lesson = build_fallback_storyboard(
                pdf_text=pdf_text,
                chapter_num=ch_num,
                unit=unit,
                spec=spec,
                artifact_ids=[],
                next_titles=nxt,
            )
    lesson = align_storyboard_panels(dict(lesson), split_narration_sentences)
    title, _bg, narration_text, panels, initial_quiz = normalize_storyboard(lesson)
    title = title or f"Micro-Lesson {lesson_num}"
    words = len((narration_text or "").split())
    print(f"\n⚡ English Micro-Lesson {lesson_num}: {title} ({words} words, {len(panels)} panels)")

    lesson_dir = chapter_dir / f"Micro_Lesson_{lesson_num}"
    if force_regen and lesson_dir.exists():
        shutil.rmtree(lesson_dir, ignore_errors=True)
    lesson_dir.mkdir(parents=True, exist_ok=True)

    (lesson_dir / "storyboard.json").write_text(
        json.dumps(lesson, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (lesson_dir / "narration.txt").write_text(narration_text or "", encoding="utf-8")

    quiz_target = 5 if os.getenv("KRITI_SKIP_QUIZ_EXPAND", "").strip() in {"1", "true", "yes"} else 8
    full_quiz = expand_quiz_item_pool(
        lesson_title=title,
        pdf_text=pdf_text,
        initial_quiz=initial_quiz,
        provider=PROVIDER,
        subject_name=SUBJECT_NAME,
        narration_text=narration_text,
        target_count=quiz_target,
    )
    (lesson_dir / "quiz.json").write_text(
        json.dumps(full_quiz, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"   📝 Quiz pool: {len(full_quiz.get('item_pool', []))} items")

    if not narration_text or not panels:
        print("   ❌ Missing narration/panels")
        return False

    voice = MASCOT_VOICES.get(MASCOT_NAME, "en-US-AndrewMultilingualNeural")
    produce_comic_lesson(
        lesson_title=title,
        narration_text=narration_text,
        panels=panels,
        lesson_dir=lesson_dir,
        mascot_name=MASCOT_NAME,
        voice=voice,
        student_name=STUDENT_NAME,
        force_regen=force_regen,
        subject_name=SUBJECT_NAME,
        class_name=CLASS_NAME,
        chapter_name=chapter_dir.name,
        chapter_output_dir=chapter_dir,
    )
    mp4 = lesson_dir / "output.mp4"
    ok = mp4.is_file() and mp4.stat().st_size > 1_000_000
    size = f"{mp4.stat().st_size / 1024 / 1024:.1f}MB" if mp4.exists() else "missing"
    print(f"   {'✅' if ok else '❌'} output.mp4={size}")
    return ok


def run_chapter(
    chapter_num: int,
    *,
    only_lesson: int | None = None,
    from_lesson: int = 1,
    extract: bool = True,
    force_extract: bool = True,
    wipe: bool = True,
    skip_generate: bool = False,
    resume: bool = False,
) -> bool:
    spec_root = CHAPTER_SPECS[chapter_num]
    unit = spec_root["unit"]
    lesson_specs = spec_root["lessons"]
    chapter_name = f"Chapter-{chapter_num}"
    chapter_dir = RENDERED_OUTPUT_DIR / CLASS_NAME / SUBJECT_NAME / chapter_name
    chapter_dir.mkdir(parents=True, exist_ok=True)
    pdf = SOURCE_ROOT / f"{chapter_name}.pdf"
    chapter_id = build_chapter_id(CLASS_NAME, SUBJECT_NAME, chapter_name)

    print("\n" + "#" * 70)
    print(f"English {SUBJECT_NAME} {chapter_name}: {unit}")
    print("#" * 70)

    if extract:
        extract_chapter_artifacts(chapter_num, force=force_extract)

    if wipe and not resume and not skip_generate and only_lesson is None:
        wipe_chapter_lessons(chapter_dir)

    pdf_text = clean_english_pdf_text(extract_pdf_text(pdf) if pdf.is_file() else "")
    manifest = load_chapter_manifest(chapter_id, chapter_output_dir=chapter_dir)
    artifact_catalog = format_manifest_for_prompt(manifest) if manifest else ""
    buckets = partition_artifacts(manifest, n_lessons=len(lesson_specs))
    n_arts = len((manifest or {}).get("artifacts") or [])
    print(f"   🖼️ Artifacts in manifest: {n_arts}")
    for i, b in enumerate(buckets):
        print(f"      L{i + 1} artifacts ({len(b)}): {', '.join(b[:4])}{'...' if len(b) > 4 else ''}")

    cache_file = chapter_dir / "generated_response.json"
    lessons: list = []
    if skip_generate and cache_file.is_file():
        lessons = json.loads(cache_file.read_text(encoding="utf-8"))
        print(f"   ♻️ Loaded {len(lessons)} cached storyboards")
    else:
        # Keep prior lessons when --only regenerating one
        if cache_file.is_file():
            try:
                lessons = json.loads(cache_file.read_text(encoding="utf-8"))
                if not isinstance(lessons, list):
                    lessons = []
                kept = len([x for x in lessons if x])
                print(f"   ♻️ Loaded {kept} cached storyboard slot(s)")
            except Exception:
                lessons = []
        while len(lessons) < len(lesson_specs):
            lessons.append(None)

        client = None
        if PROVIDER != "gemini":
            import anthropic

            client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

        for spec in lesson_specs:
            n = spec["lesson_num"]
            if only_lesson and n != only_lesson:
                continue
            if n < from_lesson:
                continue
            existing = lessons[n - 1] if n - 1 < len(lessons) else None
            if resume and isinstance(existing, dict):
                ok_keep, reason_keep = english_narration_qa_gate(existing, spec)
                if ok_keep:
                    print(f"   ♻️ Resume keep storyboard Lesson {n}: {spec['title']}")
                    continue
                print(f"   🔄 Resume refresh Lesson {n} (QA: {reason_keep})")
            print(f"\n==================================================")
            print(f"🎬 Generating storyboard Lesson {n}/{len(lesson_specs)}: {spec['title']}")
            print(f"==================================================")
            try:
                nxt = [s["title"] for s in lesson_specs if s["lesson_num"] > n]
                lesson_obj = generate_one_storyboard(
                    client,
                    pdf_text,
                    chapter_num=chapter_num,
                    unit=unit,
                    spec=spec,
                    artifact_ids=buckets[n - 1],
                    artifact_catalog=artifact_catalog,
                    total_lessons=len(lesson_specs),
                    next_titles=nxt,
                )
            except Exception as gen_exc:
                print(f"   ❌ Storyboard generation failed for lesson {n}: {gen_exc}")
                print("   🧩 Building offline fallback storyboard from PDF excerpt...")
                nxt = [s["title"] for s in lesson_specs if s["lesson_num"] > n]
                lesson_obj = build_fallback_storyboard(
                    pdf_text=pdf_text,
                    chapter_num=chapter_num,
                    unit=unit,
                    spec=spec,
                    artifact_ids=buckets[n - 1],
                    next_titles=nxt,
                )
            lessons[n - 1] = lesson_obj
            cache_file.write_text(
                json.dumps([x for x in lessons if x is not None], indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            words = len((lesson_obj.get("narration_text") or "").split())
            print(f"   ✅ Storyboard saved ({words} words, {len(lesson_obj.get('panels') or [])} panels)")
            time.sleep(8)

        # Normalize cache length
        lessons = [(lessons[i] if i < len(lessons) else None) for i in range(len(lesson_specs))]
        if all(lessons):
            cache_file.write_text(
                json.dumps(lessons, indent=2, ensure_ascii=False), encoding="utf-8"
            )

    results = []
    for spec in lesson_specs:
        n = spec["lesson_num"]
        if only_lesson and n != only_lesson:
            continue
        if n < from_lesson:
            continue
        lesson_dir = chapter_dir / f"Micro_Lesson_{n}"
        mp4 = lesson_dir / "output.mp4"
        if (
            os.getenv("KRITI_RESUME_VIDEOS", "").strip() in {"1", "true", "yes"}
            and mp4.is_file()
            and mp4.stat().st_size > 1_000_000
        ):
            print(f"   ♻️ Resume skip Lesson {n} (output.mp4 exists)")
            results.append(True)
            continue
        if n - 1 >= len(lessons) or not lessons[n - 1]:
            print(f"   ❌ Missing storyboard for lesson {n}")
            results.append(False)
            continue
        try:
            ok = process_lesson(
                lessons[n - 1],
                n,
                chapter_dir=chapter_dir,
                pdf_text=pdf_text,
                force_regen=True,
                spec=spec,
            )
            results.append(ok)
        except Exception as exc:
            print(f"   ❌ Lesson {n} failed: {exc}")
            results.append(False)

    ok = all(results) and bool(results)
    print(
        f"{chapter_name}: {'SUCCESS' if ok else 'PARTIAL/FAIL'} "
        f"({sum(1 for r in results if r)}/{len(results)})"
    )
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="English Poorvi Ch1–5 full redo")
    parser.add_argument("--chapter", type=int, choices=[1, 2, 3, 4, 5], help="Only one chapter")
    parser.add_argument("--only", type=int, help="Only this lesson number within chapter")
    parser.add_argument("--from-lesson", type=int, default=1)
    parser.add_argument("--extract-only", action="store_true")
    parser.add_argument("--skip-extract", action="store_true")
    parser.add_argument("--no-force-extract", action="store_true")
    parser.add_argument("--skip-generate", action="store_true")
    parser.add_argument("--resume", action="store_true", help="Skip lessons that already have output.mp4")
    parser.add_argument("--no-wipe", action="store_true")
    args = parser.parse_args()

    chapters = [args.chapter] if args.chapter else [1, 2, 3, 4, 5]

    if args.extract_only:
        overall = []
        for ch in chapters:
            path = extract_chapter_artifacts(ch, force=not args.no_force_extract)
            overall.append(bool(path and Path(path).is_file()))
        return 0 if all(overall) else 1

    overall = []
    for ch in chapters:
        t0 = time.time()
        ok = run_chapter(
            ch,
            only_lesson=args.only,
            from_lesson=args.from_lesson,
            extract=not args.skip_extract,
            force_extract=not args.no_force_extract,
            wipe=not args.no_wipe,
            skip_generate=args.skip_generate,
            resume=args.resume,
        )
        overall.append((ch, ok, time.time() - t0))
        print(f"Cooldown after Chapter-{ch}...")
        time.sleep(6)

    print("\n" + "#" * 70)
    for ch, ok, elapsed in overall:
        print(f"  Chapter-{ch}: {'SUCCESS' if ok else 'FAIL'} ({elapsed / 60:.1f} min)")
    print("#" * 70)
    return 0 if all(ok for _, ok, _ in overall) else 1


if __name__ == "__main__":
    raise SystemExit(main())
