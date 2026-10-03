"""
Prepare Social Science Chapter-10 (The Constitution of India — An Introduction):
1) Generate storyboard JSON per lesson (Anthropic)
2) Write storyboard / narration / quiz
3) TTS narration + timeline + beat audio + Remotion props (cartoon_svg)

Usage (from repo root):
  python scripts/prepare_ss_ch10_lessons.py
  python scripts/prepare_ss_ch10_lessons.py --only 1
  python scripts/prepare_ss_ch10_lessons.py --from 3
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config.env import load_env_file

load_env_file(Path(".env"))

import anthropic

from Chapter_Agent import (
    MASCOT_VOICES,
    NARRATION_WORDS_MAX,
    NARRATION_WORDS_MIN,
    MAX_ITEM_CHARS,
    MAX_TITLE_CHARS,
    RENDERED_OUTPUT_DIR,
    align_storyboard_panels,
    assemble_remotion_props,
    build_chapter_id,
    clean_and_parse_json,
    extract_audio_segment,
    extract_pdf_text,
    expand_quiz_item_pool,
    load_chapter_manifest,
    merge_short_bubble_cues,
    normalize_storyboard,
    panels_to_visual_events_precise,
    resolve_lip_sync_mode,
    resolve_mascot_pose_dir,
    resolve_subject_key,
    split_narration_sentences,
    split_timeline_cues,
    synthesize_narration_timeline,
    _normalize_mascot_pose,
)
from artifact_config import format_manifest_for_prompt

CLASS_NAME = "Class-7"
SUBJECT_NAME = "SocialScience-Part1-Class-7"
CHAPTER_NAME = "Chapter-10"
PDF_PATH = Path("Source_Books/Class-7/SocialScience-Part1-Class-7/Chapter-10.pdf")
STUDENT_NAME = "Saanvi"
MASCOT_NAME = "gyanu"
PROVIDER = "anthropic"

LESSON_SPECS = [
    {
        "lesson_num": 1,
        "title": "What Is a Constitution & Why We Need One",
        "artifacts": [
            "p01_01_chapter_10_opener_introducti",
            "p02_11_children_watch_the_republic",
        ],
        "coverage": """
- Open with Republic Day parade significance: 26 January marks the Constitution coming into force.
- Define constitution: the supreme rulebook / guiding document for a country.
- Explain why we need one using the sports/game rules metaphor (fair play, agreement when disputes arise).
- A constitution sets basic rules and principles: what government may do, how power is organised, and often citizens' rights and duties.
- Structure fact: Constitution of India has 25 parts and 12 schedules (like sections/chapters of a big book).
- Typical contents of constitutions: values & ideals; rights & duties; functions of different organs of government.
- Closing: without a shared rulebook, peaceful democratic life becomes chaotic.
""",
    },
    {
        "lesson_num": 2,
        "title": "Writing India's Constitution",
        "artifacts": [
            "p06_08_the_constituent_assembly_194",
            "p08_13_constituent_assembly_in_sess",
        ],
        "coverage": """
- While struggling for independence, Indians debated: What type of government? What rules should bind us?
- Constituent Assembly formed in 1946, initially 389 members (later 299 after Partition).
- Constitution developed and written over almost three years by the Constituent Assembly.
- Dr. Rajendra Prasad: Chairman of the Constituent Assembly.
- Drafting Committee chaired by Dr. B.R. Ambedkar (eminent social reformer and jurist).
- Constitution adopted and came into force on 26 January 1950 — celebrated as Republic Day.
- Emphasise democratic debate, compromise, and representation of diverse voices in the Assembly.
""",
    },
    {
        "lesson_num": 3,
        "title": "Freedom Struggle & Civilisational Roots",
        "artifacts": [
            "p09_12_india_s_ancient_governance_t",
            "p12_05_key_features_of_the_constitu",
        ],
        "coverage": """
- Freedom struggle ideals that shaped the Constitution: equality of all, justice for everyone, respect for diversity/heritage, and non-violence / dignity of people.
- Many freedom fighters sat in the Constituent Assembly and carried those experiences into drafting.
- Civilisational heritage: idea of India as one country with unity in diversity is embedded in the Constitution.
- Ancient Indian traditions of governance, duty, and ethical public life influenced features such as Fundamental Duties.
- The Constitution is not only a borrowed modern document — it also grows from India's own heritage.
""",
    },
    {
        "lesson_num": 4,
        "title": "World Ideas & Heritage Illustrations",
        "artifacts": [
            "p10_02_ancient_gurukula_scene_one_o",
            "p10_15_ramayana_scene_rama_s_conque",
            "p10_16_krishna_propounding_the_gita",
            "p11_03_nataraja_statue_an_illustrat",
            "p11_14_bhagiratha_s_penance_descent",
            "p11_19_nalanda_india_s_ancient_univ",
        ],
        "coverage": """
- Constitution makers studied constitutions/ideas from France, USA, UK, Ireland, Australia and others.
- Notable borrowings: ideals of liberty/equality/fraternity linked to France's Declaration of the Rights of Man; Directive Principles inspired in part by Ireland; parliamentary practices from the UK, etc. (keep accurate and age-appropriate).
- The handwritten Constitution manuscript includes beautiful illustrations of India's civilisational heritage: gurukula, Ramayana, Mahabharata/Gita, Nataraja, Nalanda, Bhagiratha's penance at Mahabalipuram, and more.
- Message: modern constitutional ideals + Indian cultural memory travel together in one document.
""",
    },
    {
        "lesson_num": 5,
        "title": "Key Features: Rights, Duties & Governance",
        "artifacts": [
            "p12_05_key_features_of_the_constitu",
            "p14_06_fundamental_duties_of_indian",
        ],
        "coverage": """
- Three organs of government: Legislature (makes laws), Executive (implements laws, headed by PM at Centre / CM in states), Judiciary (interprets laws; ensures laws follow the Constitution; Supreme Court is highest court).
- Three-tier government: Central, State, and local (Panchayati Raj / urban local bodies).
- Core pillars: Fundamental Rights, Fundamental Duties, and Directive Principles of State Policy (DPSP).
- Fundamental Rights are justiciable rights (e.g. Equality before law Art.14; Protection of life & personal liberty Art.21; Right to Education Art.21-A; Right against Exploitation).
- Fundamental Duties include respecting Constitution, Flag, Anthem; preserving heritage; protecting environment — civic responsibilities.
- DPSPs are goals/guidelines for government (welfare, nutrition, environment, protection of monuments) — not enforced like rights but guide policy.
- Quote idea from Constituent Assembly debates on women's equal heritage — Constitution affirms equality.
""",
    },
    {
        "lesson_num": 6,
        "title": "Living Constitution & The Preamble",
        "artifacts": [
            "p16_07_fig_10_15_introducing_the_pr",
            "p17_04_the_preamble_of_the_indian_c",
            "p17_09_preamble_of_the_indian_const",
            "p17_10_preamble_detail_india_declar",
        ],
        "coverage": """
- Constitution is a living document: can be amended as needs change; amendments are rigorously debated in Parliament.
- Example: Fundamental Duties added in 1976; terms Socialist, Secular, Integrity added to Preamble by 42nd Amendment (1976).
- Popular movements/court judgments can expand meaning (e.g. flying the national flag as freedom of expression).
- Preamble as the soul/guiding values: We, the People of India; Sovereign; Socialist; Secular; Democratic; Republic; Justice; Liberty; Equality; Fraternity.
- Explain each Preamble keyword in Class-7 language with a daily-life connection.
- Closing: Constitution remains relevant 70+ years later because it balances ideals, institutions, and the power to improve itself.
""",
    },
]


def generate_one_storyboard(client, pdf_text: str, spec: dict, artifact_catalog: str) -> dict:
    num = spec["lesson_num"]
    title = spec["title"]
    artifacts = spec["artifacts"]
    coverage = spec["coverage"]
    art_line = ", ".join(artifacts) if artifacts else "(none — use generated backgrounds)"

    prompt = f"""
You are the Senior Spatial Storyboard Director for Kriti School's Drona Engine.
Generate ONE complete micro-lesson storyboard for Grade 7 Social Science Chapter 10: "The Constitution of India — An Introduction".

TARGET LESSON: Lesson {num} of 6
LESSON TITLE: "{title}"
STUDENT NAME: {STUDENT_NAME}

SPECIFIC CONTENT THAT MUST BE THOROUGHLY TAUGHT IN THIS LESSON:
{coverage}

TEXTBOOK ARTIFACTS APPROVED FOR THIS LESSON (use these exact artifact_id values when visual_mode is artifact):
{art_line}

FULL CHAPTER ARTIFACT CATALOG (reference only):
{artifact_catalog[:6000]}

MANDATES:
1. Narration Script ("narration_text"):
   - MUST be between {NARRATION_WORDS_MIN} and {NARRATION_WORDS_MAX} words total.
   - Address student {STUDENT_NAME} warmly and conversationally.
   - Cover EVERY point in the specific content. Do not skip facts.
   - Prefer clear sentences under ~100 characters where natural.

2. Panels Array ("panels"):
   - Exactly 5 to 7 panels.
   - Panel 1: type "intro", phase "Intro", mascot_pose "talking", with bg_prompt.
   - Middle: type "concept_card", phase "Concept".
     - For panels using a listed artifact: visual_mode "artifact", artifact_id exact id, NO bg_prompt.
     - Otherwise: visual_mode "generated" with vivid bg_prompt ending "8k --no text --no people".
   - Last panel: type "summary_badge", phase "Summary", mascot_pose "happy".
   - Every title <= {MAX_TITLE_CHARS} chars; every item <= {MAX_ITEM_CHARS} chars; 3–5 items per panel.
   - Prefer including ALL approved artifacts for this lesson across concept panels when possible.

3. Exit-Gate Quiz ("initial_quiz"):
   - EXACTLY 5 questions, all strictly from THIS lesson's content.
   - Mix rigor: at least 2 should be multi-concept reasoning (not trivial recall).
   - Each: 4 options; "answer" must exactly match one option string.
   - No math puzzles; no off-topic items.

OUTPUT: ONLY a valid JSON object with keys lesson_title, narration_text, panels, initial_quiz.
"""

    res = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": f"PDF TEXT CONTENT:\n{pdf_text}\n\nPROMPT:\n{prompt}\n\nRETURN ONLY VALID UNWRAPPED JSON OBJECT.",
            }
        ],
    )
    raw = res.content[0].text
    lesson_obj = clean_and_parse_json(raw)
    if isinstance(lesson_obj, list):
        lesson_obj = lesson_obj[0]
    if not isinstance(lesson_obj, dict):
        raise RuntimeError(f"Lesson {num}: parsed storyboard is not an object")
    lesson_obj["lesson_title"] = title
    return lesson_obj


def prepare_lesson_assets(
    lesson: dict,
    lesson_num: int,
    *,
    chapter_output_dir: Path,
    pdf_text: str,
    chapter_id: str,
    manifest: dict | None,
    force_audio: bool = False,
) -> None:
    lesson_dir = chapter_output_dir / f"Micro_Lesson_{lesson_num}"
    lesson_dir.mkdir(parents=True, exist_ok=True)

    aligned = align_storyboard_panels(dict(lesson), split_narration_sentences)
    title, _bg, narration_text, panels, initial_quiz = normalize_storyboard(aligned)
    title = title or f"Micro-Lesson {lesson_num}"

    with open(lesson_dir / "storyboard.json", "w", encoding="utf-8") as f:
        json.dump(aligned, f, indent=2)
    with open(lesson_dir / "narration.txt", "w", encoding="utf-8") as f:
        f.write(narration_text)

    print(f"   📝 Expanding rigorous quiz pool for: {title}")
    full_quiz = expand_quiz_item_pool(
        lesson_title=title,
        pdf_text=pdf_text,
        initial_quiz=initial_quiz,
        provider=PROVIDER,
        subject_name=SUBJECT_NAME,
        narration_text=narration_text,
        target_count=6,
    )
    with open(lesson_dir / "quiz.json", "w", encoding="utf-8") as f:
        json.dump(full_quiz, f, indent=2)
    print(f"   ✅ Quiz items: {len(full_quiz.get('item_pool', []))}")

    voice = MASCOT_VOICES.get(MASCOT_NAME.lower(), "en-US-AndrewMultilingualNeural")
    audio_file = lesson_dir / "narration.mp3"
    timeline_file = lesson_dir / "narration_timeline.json"

    if (
        not force_audio
        and audio_file.exists()
        and audio_file.stat().st_size > 1000
        and timeline_file.exists()
    ):
        narration_timeline = json.loads(timeline_file.read_text(encoding="utf-8"))
        print("   ♻️ Reusing narration audio & timeline")
    else:
        print(f"   🎙️ Synthesizing narration via Edge-TTS ({voice})...")
        _path, raw_timeline, used_voice = synthesize_narration_timeline(
            narration_text, voice, lesson_dir
        )
        cues = split_timeline_cues(raw_timeline)
        narration_timeline = merge_short_bubble_cues(cues)
        timeline_file.write_text(json.dumps(narration_timeline, indent=2), encoding="utf-8")
        print(
            f"   ⏱️ Timeline: {len(narration_timeline)} cues, "
            f"{narration_timeline[-1]['end_time']:.1f}s ({used_voice})"
        )

    visual_events = panels_to_visual_events_precise(
        panels,
        narration_timeline,
        lesson_dir,
        artifacts_enabled=True,
        chapter_manifest=manifest,
    )

    mascot_dir = resolve_mascot_pose_dir(MASCOT_NAME)
    _ = resolve_lip_sync_mode(mascot_dir)
    mascot_clips = []
    full_audio = lesson_dir / "narration.mp3"
    for b_idx, event in enumerate(visual_events):
        pose = _normalize_mascot_pose(event.get("mascot_pose"), "talking")
        beat_audio_name = f"beat_{b_idx}_{pose}.mp3"
        beat_audio = lesson_dir / beat_audio_name
        extract_audio_segment(full_audio, beat_audio, event["start_time"], event["end_time"])
        mascot_clips.append(
            {
                "audio_url": beat_audio_name,
                "lip_sync_mode": "cartoon_svg",
                "start_time": event["start_time"],
                "end_time": event["end_time"],
                "pose": pose,
            }
        )

    props = assemble_remotion_props(
        lesson_title=title,
        student_name=STUDENT_NAME,
        narration_timeline=narration_timeline,
        visual_events=visual_events,
        mascot_clips=mascot_clips,
        mascot_id=MASCOT_NAME,
        lip_sync_mode="cartoon_svg",
        narration_audio_url=None,
        subject=resolve_subject_key(SUBJECT_NAME),
        chapter_id=chapter_id,
        artifacts_enabled=True,
    )
    (lesson_dir / "props.json").write_text(json.dumps(props, indent=2), encoding="utf-8")
    print(f"   ✨ Props ready ({len(visual_events)} visual events)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", type=int, help="Prepare only this lesson number (1-6)")
    parser.add_argument("--from", dest="from_lesson", type=int, default=1)
    parser.add_argument("--force-audio", action="store_true")
    parser.add_argument("--skip-generate", action="store_true", help="Reuse generated_response.json")
    args = parser.parse_args()

    chapter_output_dir = RENDERED_OUTPUT_DIR / CLASS_NAME / SUBJECT_NAME / CHAPTER_NAME
    chapter_output_dir.mkdir(parents=True, exist_ok=True)
    cache_file = chapter_output_dir / "generated_response.json"
    chapter_id = build_chapter_id(CLASS_NAME, SUBJECT_NAME, CHAPTER_NAME)

    print(f"📦 Preparing Chapter-10 Constitution of India for {STUDENT_NAME}...")
    pdf_text = extract_pdf_text(PDF_PATH)
    manifest = load_chapter_manifest(chapter_id, chapter_output_dir=chapter_output_dir)
    artifact_catalog = format_manifest_for_prompt(manifest) if manifest else ""
    print(f"   🖼️ Artifacts in manifest: {len((manifest or {}).get('artifacts', []))}")

    if args.skip_generate and cache_file.exists():
        lessons = json.loads(cache_file.read_text(encoding="utf-8"))
        print(f"   ♻️ Loaded {len(lessons)} cached storyboards")
    else:
        lessons = []
        if cache_file.exists():
            try:
                lessons = json.loads(cache_file.read_text(encoding="utf-8"))
                if not isinstance(lessons, list):
                    lessons = []
            except Exception:
                lessons = []
        # pad/truncate to 6 slots
        while len(lessons) < 6:
            lessons.append(None)

        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        for spec in LESSON_SPECS:
            n = spec["lesson_num"]
            if args.only and n != args.only:
                continue
            if n < args.from_lesson:
                continue
            print(f"\n==================================================")
            print(f"🎬 Generating storyboard Lesson {n}/6: {spec['title']}")
            print(f"==================================================")
            lesson_obj = generate_one_storyboard(client, pdf_text, spec, artifact_catalog)
            lessons[n - 1] = lesson_obj
            cache_file.write_text(
                json.dumps([x for x in lessons if x is not None], indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            words = len((lesson_obj.get("narration_text") or "").split())
            print(f"   ✅ Storyboard saved ({words} words, {len(lesson_obj.get('panels') or [])} panels)")

        lessons = [x for x in lessons if x is not None]
        cache_file.write_text(json.dumps(lessons, indent=2, ensure_ascii=False), encoding="utf-8")

    # Ensure list length aligns with specs when only partial generate
    if args.only:
        # reload full cache for prepare of that one if available
        if cache_file.exists():
            lessons = json.loads(cache_file.read_text(encoding="utf-8"))

    for spec in LESSON_SPECS:
        n = spec["lesson_num"]
        if args.only and n != args.only:
            continue
        if n < args.from_lesson:
            continue
        if n - 1 >= len(lessons) or not lessons[n - 1]:
            print(f"   ⚠️ Missing storyboard for lesson {n}; skip prepare")
            continue
        print(f"\n==================================================")
        print(f"🛠️ Preparing assets Lesson {n}/6: {spec['title']}")
        print(f"==================================================")
        prepare_lesson_assets(
            lessons[n - 1],
            n,
            chapter_output_dir=chapter_output_dir,
            pdf_text=pdf_text,
            chapter_id=chapter_id,
            manifest=manifest,
            force_audio=args.force_audio,
        )

    print("\n🎉 Chapter-10 micro-lesson prepare pass complete.")
    print(f"   Output: {chapter_output_dir}")


if __name__ == "__main__":
    main()
