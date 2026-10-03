"""
Prepare Social Science Chapter-11 (From Barter to Money):
1) Generate storyboard JSON per lesson (Anthropic)
2) Write storyboard / narration / quiz
3) TTS narration + timeline + beat audio + Remotion props (cartoon_svg)

Usage (from repo root):
  python scripts/prepare_ss_ch11_lessons.py
  python scripts/prepare_ss_ch11_lessons.py --only 1
  python scripts/prepare_ss_ch11_lessons.py --from 3
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
CHAPTER_NAME = "Chapter-11"
PDF_PATH = Path("Source_Books/Class-7/SocialScience-Part1-Class-7/Chapter-11.pdf")
STUDENT_NAME = "Saanvi"
MASCOT_NAME = "gyanu"
PROVIDER = os.getenv("KRITI_PREPARE_PROVIDER", "gemini")

LESSON_SPECS = [
    {
        "lesson_num": 1,
        "title": "The Barter System",
        "artifacts": [
            "p01_01_chapter_11_intro_from_barter",
            "p01_05_chapter_11_opening_page_intr",
        ],
        "coverage": """
- Chapter theme: From Barter to Money; big questions — how exchange happened before money, why money arose, how money's forms changed.
- Define barter system: exchanging goods or services for other goods or services WITHOUT using money.
- Classroom example: student with extra eraser swaps with classmate who has an extra pencil.
- Commodities historically used in exchange: cowrie shells, salt, tea, tobacco, cloth, cattle (cows, goats, horses, sheep), seeds, etc.
- Define transaction and commodities in Class-7 language.
- World examples of early 'money-like' commodities: Rai stones (Yap Island), Aztec copper Tajadero, Tevau red-feather coils (Solomon Islands).
- Today we use coins, notes, and digital devices — but barter was the earliest form of exchange.
""",
    },
    {
        "lesson_num": 2,
        "title": "Why Do We Need Money?",
        "artifacts": [
            "p03_12_farmer_with_an_ox_trying_to",
            "p03_16_farmer_needing_multiple_good",
            "p04_10_farmer_carrying_bags_of_whea",
            "p06_14_wheat_stored_after_barter_tr",
        ],
        "coverage": """
- Farmer story: needs shoes, sweater, medicines but only has an ox to spare — shows barter pain points.
- Double coincidence of wants: both parties must want what the other has at the same time.
- Divisibility: an ox cannot be fairly split to buy small items like shoes.
- Portability: hard to carry bulky goods (bags of wheat) across many places for many trades.
- Durability / storage of value: wheat can rot or be eaten by rats — poor way to store value for later.
- Series of exchanges needed: ox → wheat → shoes/sweater/medicines, with negotiation each time.
- Conclusion: these limitations created the need for a common medium of exchange — money.
""",
    },
    {
        "lesson_num": 3,
        "title": "Barter Still Exists Around Us",
        "artifacts": [
            "p07_06_junbeel_mela_barter_fair_whe",
            "p06_15_junbeel_mela_a_traditional_b",
            "p07_09_tribal_goods_and_forest_prod",
            "p08_07_vendor_exchanging_household",
            "p08_11_barter_exchange_households_s",
        ],
        "coverage": """
- Barter has not vanished; it still appears in many communities and everyday practices.
- Junbeel Mela (Assam): traditional barter fair where hill communities (e.g. Tiwa, Karbi, Khasi) and plains people exchange goods.
- Hill/forest products (roots, vegetables, fruit, herbs, spices, handmade forest crafts) traded for rice cakes and plains foods that hills cannot grow.
- Book exchange / swap clubs: trade finished books for new stories without spending money.
- Clothes-for-utensils vendors: households give used clothes/fabrics; vendors give new utensils — both benefit (declutter vs resale/recycle).
- Encourage noticing similar local practices; barter still solves some needs alongside modern money.
""",
    },
    {
        "lesson_num": 4,
        "title": "Basic Functions of Money",
        "artifacts": [
            "p04_18_leftover_wheat_bags_after_ba",
            "p16_04_summary_of_key_points_barter",
        ],
        "coverage": """
- Necessity is the mother of invention: as goods and distances grew, barter became harder → money as common medium of exchange.
- Medium of exchange: widely accepted for buying and selling goods and services.
- Store of value: unlike wheat that spoils, money can be kept and used later for purchases.
- Measure of value / common denomination: prices let us compare goods and services.
- Standard of deferred payment: money allows paying later (e.g. ₹50 now for a ₹100 book — rest later / credit idea from the textbook).
- Money circulates: parents pay shopkeepers → shopkeepers pay workers → workers buy essentials and pay school fees.
- Keep definitions crisp and Class-7 friendly with everyday examples.
""",
    },
    {
        "lesson_num": 5,
        "title": "Coinage: The Journey of Money",
        "artifacts": [
            "p10_02_timeline_showing_how_money_e",
            "p11_20_ancient_indian_coins_made_of",
            "p12_19_old_indian_anna_coins_showin",
            "p13_03_indian_coin_marking_75_years",
        ],
        "coverage": """
- Timeline idea: money evolved from early commodity forms to coins, then paper, then digital.
- Coinage: rulers issued coins for their kingdoms; minting/issue controlled by rulers; powerful rulers' coins accepted across kingdoms.
- Ancient India: punch-marked coins / paṇas with symbols (rūpas); silver-copper alloys used.
- Linguistic link: paṇa → panam (Tamil/etc.), haṇa (Kannada) for money.
- Chalukyas of Kalyana: coins with Varaha (boar) image among other motifs.
- Modern India: coins for smaller denominations; special commemorative coins (e.g. 75 years of Independence, 2021); older anna coins as fractions of a rupee before decimalisation context.
- Mint: place where coins are manufactured under authority.
""",
    },
    {
        "lesson_num": 6,
        "title": "Paper Money & Digital Payments",
        "artifacts": [
            "p15_08_illustration_showing_new_for",
            "p16_04_summary_of_key_points_barter",
            "p13_03_indian_coin_marking_75_years",
        ],
        "coverage": """
- Paper money / currency developed as trade grew; notes used for higher denominations while coins cover smaller ones.
- In India, Reserve Bank of India (RBI) is the only legal authority that prints and issues paper currency; others cannot legally issue currency.
- Historical note: older bank notes (e.g. Bank of Bombay ten-rupee style examples in textbook) show evolution toward a single central authority.
- New intangible forms: debit/credit cards, net banking, UPI (Unified Payments Interface), QR codes.
- QR code: pattern readable by phones/scanners encoding receiver bank details for payments (vegetable seller example).
- Evolution continues: shells → coins → paper → digital; easier ways to pay and receive.
- Closing summary: barter limitations → money; forms keep changing but the functions remain.
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
Generate ONE complete micro-lesson storyboard for Grade 7 Social Science Chapter 11: "From Barter to Money".

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

    user_msg = (
        f"PDF TEXT CONTENT:\n{pdf_text}\n\nPROMPT:\n{prompt}\n\n"
        "RETURN ONLY VALID UNWRAPPED JSON OBJECT."
    )
    if PROVIDER == "gemini":
        import time
        from google import genai

        gclient = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        models = [
            os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
            "gemini-3.6-flash",
            "gemini-2.5-flash",
        ]
        raw = ""
        last_err: Exception | None = None
        for model in models:
            for attempt in range(1, 4):
                try:
                    print(f"   🤖 Gemini model={model} attempt={attempt}")
                    res = gclient.models.generate_content(model=model, contents=user_msg)
                    raw = res.text or ""
                    if raw.strip():
                        last_err = None
                        break
                except Exception as e:
                    last_err = e
                    print(f"   ⚠️ Gemini error ({model}): {e}")
                    time.sleep(5 * attempt)
            if raw.strip():
                break
        if last_err and not raw.strip():
            raise last_err
    else:
        res = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            messages=[{"role": "user", "content": user_msg}],
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

    print(f"📦 Preparing Chapter-11 From Barter to Money for {STUDENT_NAME}...")
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
        while len(lessons) < 6:
            lessons.append(None)

        client = None
        if PROVIDER != "gemini":
            client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        print(f"   🤖 Storyboard provider: {PROVIDER}")
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

    if args.only:
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

    print("\n🎉 Chapter-11 micro-lesson prepare pass complete.")
    print(f"   Output: {chapter_output_dir}")


if __name__ == "__main__":
    main()
