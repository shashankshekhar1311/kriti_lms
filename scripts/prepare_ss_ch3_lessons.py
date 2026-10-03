"""
Prepare Social Science Chapter-3 (Climates of India) micro-lessons one-by-one:
1) Generate storyboard JSON per lesson (Anthropic)
2) Write storyboard / narration / quiz
3) TTS narration + timeline + beat audio + Remotion props (cartoon_svg)

Usage (from repo root):
  python scripts/prepare_ss_ch3_lessons.py
  python scripts/prepare_ss_ch3_lessons.py --only 1
  python scripts/prepare_ss_ch3_lessons.py --from 3
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
    MAX_CHIP_CHARS,
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
CHAPTER_NAME = "Chapter-3"
PDF_PATH = Path("Source_Books/Class-7/SocialScience-Part1-Class-7/Chapter-3.pdf")
STUDENT_NAME = "Saanvi"
MASCOT_NAME = "gyanu"
PROVIDER = "anthropic"

LESSON_SPECS = [
    {
        "lesson_num": 1,
        "title": "Weather, Seasons & Climate",
        "artifacts": ["p01_01_chapter_3_climates_of_india"],
        "coverage": """
- Distinguish weather (hour-to-day atmospheric condition) from climate (long-term weather pattern over decades).
- Explain seasons: Earth revolving around the Sun; seasons recur yearly and last a few months.
- Four world seasons (spring, summer, autumn, winter) PLUS India's rainy monsoon season.
- Six traditional Indian ṛitus: vasanta (spring), grīshma (summer), varshā (rainy), sharad (autumn), hemanta (pre-winter), shishir (winter).
- Rituals/festivals linked to ritus (e.g. Vasanta Panchami, Sharad Purnima).
- Life in rhythm with seasons: crops, food, clothes, blooming/shedding trees, animals growing thick fur in winter.
- Recap triad: weather = day-to-day; seasons = yearly cycle; climate = long-term regional pattern.
- Note that climates are usually stable but recent decades show human-caused climate shifts (preview only).
""",
    },
    {
        "lesson_num": 2,
        "title": "Types of Climates Across India",
        "artifacts": [],
        "coverage": """
- Himalayan high mountains: alpine climate — cold snowy winters, cool summers; thickest clothing.
- Lower Himalayas & hill stations: temperate — moderately cold winters, not-too-hot summers; people visit for relief from plains heat.
- Northern plains: subtropical — very hot summers, cold winters; major wheat-growing region.
- Thar Desert (west): arid — extremely hot days, cool nights, very little rainfall; unique water-saving traditions.
- Western coastal strip: tropical wet — heavy monsoon rainfall; favourable for rice and spices.
- Central Deccan Plateau: semi-arid — hot summers, mild winters, moderate rainy-season rainfall.
- Eastern India & southern peninsula: tropical — mild winter; distinct wet/dry periods controlled by monsoon winds.
- Mention that 'tropical' and 'subtropical' relate to special latitude parallels called the tropics (preview).
""",
    },
    {
        "lesson_num": 3,
        "title": "Factors That Shape Climate",
        "artifacts": [
            "p05_17_latitude_is_a_key_climate_fa",
            "p07_02_ooty_vs_coimbatore_same_lati",
            "p08_03_hot_desert_winds_cause_heat",
        ],
        "coverage": """
- Latitude: low latitudes near Equator warmer because sun's rays hit nearly perpendicular (energy concentrated); high latitudes colder because rays strike at a slant and spread over larger area.
- Altitude: temperature falls with height; air farther from heated surface is cooler. Example: Ooty (Udhagamandalam) vs Coimbatore — same latitude, very different temperatures due to altitude.
- Distance from the sea / continentality: coastal places have milder temperatures; inland places have more extreme summers and winters because land heats and cools faster than water.
- Winds: hot desert winds cause heat waves in northwest India in summer; cold Himalayan winds cause cold waves in foothills in winter.
- Topography: Himalayas block cold Central Asian winds and force monsoon winds to rise and rain; flat Thar Desert allows hot winds to sweep far.
- Local effects: urban heat islands — cities warmer than surrounding countryside.
- Stress that climate of any region is determined by ALL these factors acting together.
""",
    },
    {
        "lesson_num": 4,
        "title": "The Indian Monsoon Explained",
        "artifacts": [
            "p10_04_the_monsoon_season_fills_riv",
            "p11_15_monsoon_advances_from_southe",
            "p22_07_activity_draw_monsoon_wind_d",
        ],
        "coverage": """
- Why monsoons matter: rivers fill, soil soaks, farming and life depend on monsoon rains.
- Summer mechanism: land heats faster than ocean → low pressure over land pulls moist ocean air inland → heavy monsoon rains (southwest monsoon).
- Winter reversal: land cools → winds reverse (northeast monsoon / retreating monsoon) with rainfall especially in parts of south/east.
- Advance of southwest monsoon: arrives at southern tip of India in early June, moves northward, covers subcontinent by mid-July.
- Uneven rainfall: western coast & windward slopes get heavy rain; some Deccan/interior areas get less, often delayed.
- Connection to water cycle: evaporation from oceans/land → clouds → precipitation → rivers/groundwater.
- Monsoon timing is culturally celebrated and economically vital for agriculture.
""",
    },
    {
        "lesson_num": 5,
        "title": "Climate, Culture, Economy & Festivals",
        "artifacts": [
            "p13_11_map_of_india_showing_festiva",
            "p13_12_india_s_seasonal_festivals_b",
            "p13_19_festival_map_fig_3_11_india",
            "p21_06_summary_climate_shapes_cultu",
        ],
        "coverage": """
- Climate shapes clothes, houses, food habits, and daily routines across regions.
- Economy: crop choices depend on climate (wheat in subtropical plains; rice/spices on wet western coast; water-saving strategies in arid Thar).
- Seasonal festivals linked to climate/agriculture across India — examples from the textbook map such as Pongal, Baisakhi, Onam, Bihu, Lohri, Losoong.
- Culture and society celebrate ritus and harvests; festivals mark seasonal change and farming cycles.
- Understanding climate helps communities plan farming, travel, and celebrations.
- Tie back: India's climate diversity creates rich cultural diversity.
""",
    },
    {
        "lesson_num": 6,
        "title": "Disasters, Preparedness & Climate Change",
        "artifacts": [
            "p15_09_low_pressure_systems_over_th",
            "p16_08_floods_occur_when_heavy_rain",
            "p18_05_landslides_in_hilly_regions",
            "p17_14_2013_uttarakhand_glacial_bur",
            "p17_16_a_glacial_burst_occurs_when",
            "p19_10_climate_change_long_term_shi",
            "p19_13_human_activities_since_the_1",
        ],
        "coverage": """
- Cyclones: low-pressure systems over the sea pull moist air; can intensify into powerful cyclones. Example reference: Cyclone Fani; eye of the storm.
- Floods: heavy rainfall makes rivers overflow or breach banks (e.g. Bihar & Assam); Himalayan floods also from glacial bursts when an ice dam breaks (2013 Uttarakhand / Kedarnath devastation).
- Landslides in hilly regions (e.g. Uttarakhand) triggered by heavy monsoon rains.
- Drought when rains fail — water scarcity and crop stress.
- How climate understanding helps preparedness: early warnings, safer locations, community readiness.
- Climate change: long-term shifts in temperature and weather patterns; accelerated since the 19th century largely by human activities.
- Consequences: more extreme weather, stress on farming, water, and disaster frequency — need awareness and action.
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
Generate ONE complete micro-lesson storyboard for Grade 7 Social Science Chapter 3: "Climates of India".

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

    print(f"📦 Preparing Chapter-3 Climates of India for {STUDENT_NAME}...")
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

    print("\n🎉 Chapter-3 micro-lesson prepare pass complete.")
    print(f"   Output: {chapter_output_dir}")


if __name__ == "__main__":
    main()
