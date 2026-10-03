"""
Prepare Social Science Chapter-12 (Understanding Markets):
1) Generate storyboard JSON per lesson (Anthropic)
2) Write storyboard / narration / quiz
3) TTS narration + timeline + beat audio + Remotion props (cartoon_svg)

Usage (from repo root):
  python scripts/prepare_ss_ch12_lessons.py
  python scripts/prepare_ss_ch12_lessons.py --only 1
  python scripts/prepare_ss_ch12_lessons.py --from 3
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
CHAPTER_NAME = "Chapter-12"
PDF_PATH = Path("Source_Books/Class-7/SocialScience-Part1-Class-7/Chapter-12.pdf")
STUDENT_NAME = "Saanvi"
MASCOT_NAME = "gyanu"
PROVIDER = os.getenv("KRITI_PREPARE_PROVIDER", "gemini")

LESSON_SPECS = [
    {
        "lesson_num": 1,
        "title": "What Is a Market? Hampi Bazaar",
        "artifacts": [
            "p01_01_247_economic_life_around_us",
            "p01_02_247_economic_life_around_us",
            "p04_05_textbook_illustration_page_4",
            "p05_06_textbook_illustration_page_5",
        ],
        "coverage": """
- Chapter big questions: What are markets and how do they function? Role in people's lives? Government's role? How consumers assess quality?
- Adam Smith idea (age-appropriate): prosperity grows when people trade for goods/services they cannot make themselves.
- Define market: place where people buy and sell goods (also bazaar, haat, mārukatté); can be physical or online.
- Markets make goods and services available to individuals, households, and businesses; connect people, traditions, and ideas.
- Needs vs wants (economics): need = required to survive (food, water, clothing, shelter); want = desired but not essential.
- Trade: buying/selling or exchange of goods and services between people or countries.
- Glorious Hampi Bazaar (Vijayanagara): opposite Virupaksha temple; Domingos Paes — 'best-provided city'; grains, silk, animals, birds; Fernao Nuniz — craftsmen, jewels, cloths, abundance despite barren land.
""",
    },
    {
        "lesson_num": 2,
        "title": "How Prices Are Settled",
        "artifacts": [
            "p06_07_252_exploring_society_india",
            "p07_08_textbook_illustration_page_7",
            "p07_09_textbook_illustration_page_7",
            "p08_10_textbook_illustration_page_8",
        ],
        "coverage": """
- Buyers and sellers interact; price emerges from negotiation / bargaining when both find a deal acceptable.
- Scenario idea with guavas (textbook figures): if price too high, buyers walk away; if too low, seller may refuse / make a loss.
- Fair middle price (e.g. ₹40 in the guava scenarios) can work for both buyer and seller.
- Demand: quantity consumers are willing and able to buy at a price at a given time.
- Supply: quantity sellers are willing and able to sell at a price at a given time.
- Prices are generally determined by interaction of demand and supply (keep Class-7 simple).
- Not only price: packaging, convenience, trust, and location also affect buying decisions.
""",
    },
    {
        "lesson_num": 3,
        "title": "Physical, Online & Trade Markets",
        "artifacts": [
            "p09_11_textbook_illustration_page_9",
            "p10_12_textbook_page_page_10",
        ],
        "coverage": """
- Physical markets: buyers and sellers meet in a place (haat, shop, mall).
- Online markets: buyers and sellers meet virtually; can transact anytime; compare pros/cons (convenience, delivery, cannot always touch product, etc.).
- Domestic market: buying/selling within a country's boundaries (e.g. paper for a book from mills across India).
- International market: trade across borders — export (sell abroad) and import (buy from abroad).
- Don't Miss Out: India was world's largest importer of vegetable oils (palm, sunflower, soybean) in 2024; much palm oil from Malaysia, Indonesia, Thailand.
- Map idea: India's key imports/exports link regions (aircraft, software services, pharma, chemicals, etc. — pick a few accurate textbook examples).
""",
    },
    {
        "lesson_num": 4,
        "title": "Wholesale, Retail & How Goods Move",
        "artifacts": [
            "p11_13_257_economic_life_around_us",
            "p12_14_textbook_illustration_page_1",
            "p13_18_textbook_illustration_page_1",
            "p14_21_260_exploring_society_india",
            "p16_24_fig_12_11_and_share_it_in_cl",
        ],
        "coverage": """
- Flow of goods: manufacturer/producer → wholesaler → (distributor) → retailer → consumer.
- Wholesalers: buy in bulk, store in warehouses; may use cold storage for perishables; supply shops.
- Mandīs: wholesale markets for farm produce (grains, vegetables) after storage.
- Retailers: sell smaller quantities to final consumers (grocery stores, malls, salons, theatres, restaurants).
- Distributors: bridge wholesalers and distant/hard-to-reach retailers (link to AMUL middlemen idea from Grade 6).
- Online channel difference: manufacturer → aggregator warehouse → pack & deliver to buyer; aggregators combine many sellers on one app/site.
- Examples: Khari Baoli spices, Bengaluru flower market, garment shops — retail/wholesale variety.
""",
    },
    {
        "lesson_num": 5,
        "title": "Markets in People's Lives",
        "artifacts": [
            "p14_22_260_exploring_society_india",
            "p15_23_261_economic_life_around_us",
            "p17_25_textbook_page_page_17",
            "p18_26_textbook_illustration_page_1",
            "p18_27_textbook_illustration_page_1",
        ],
        "coverage": """
- Surat textile market: major hub supplying cotton and synthetic fabrics; wholesalers distribute finished textiles to retailers — markets connect producers and consumers far away.
- How markets benefit society: consumer preferences (e.g. energy-efficient refrigerators) signal producers what to make — society gains better products.
- Non-economic roles: long trusted relationships with tailor/jeweller/doctor; monthly accounts with local grocer; markets as community spaces.
- Ima Keithal (Mother's Market), Imphal, Manipur: about 3000 women own/run shops; employment + melting pot of cultures and traditions.
- South India tradition: haldi-kumkum sellers gift a little turmeric and vermilion as good wishes — markets carry cultural practices beyond price.
- Some goods (e.g. paintings) may lack a ready local market — harder for sellers; online/wider networks can help artists find buyers.
MUST COVER EVERY bullet above. Do NOT pad with repeated filler sentences.
""",
    },
    {
        "lesson_num": 6,
        "title": "Government's Role in Markets",
        "artifacts": [
            "p19_28_textbook_illustration_page_1",
        ],
        "coverage": """
Teach ALL of these textbook points — none may be skipped:
- Markets usually set prices via demand and supply, but government steps in when that alone does not work well.
- Controlling prices: MAXIMUM price (ceiling) on essentials such as lifesaving drugs to protect buyers.
- MINIMUM support prices for crops like wheat, paddy, and maize so farmers do not incur losses.
- Minimum wages so employers pay workers fairly.
- Caution: price too low → producers lose motivation; price too high → consumers disadvantaged. Onion-supply example when supply falls.
- Ensuring quality and safety: government sets procedures for medicine approvals and sample testing so drugs meet quality standards.
- Mitigating external effects: factories may pollute; single-use plastics harm health/environment — government regulates such negative effects.
- Weights and measures: government monitors packaged products so net quantity on the pack is correct.
- Historical note: Kauṭilya's Arthaśhāstra instructed traders of ghee to give 1/50 part more (mānasrāva) to compensate for ghee sticking to the measuring can — rulers protected consumers long ago.
- Too many rules can make markets hard to function — balance is needed.
- Public goods: parks, roads, policing — producers may not profit, so government provides them; link to citizens' welfare rights.
MUST name: maximum price, MSP/minimum crop price, minimum wages, pharmaceutical quality testing, pollution/external effects, weights & measures, Arthaśhāstra ghee rule, public goods.
Do NOT discuss FSSAI/ISI/BEE here — those are Lesson 7. Do NOT repeat filler sentences.
""",
    },
    {
        "lesson_num": 7,
        "title": "Certification Marks & Smart Consumers",
        "artifacts": [
            "p22_29_textbook_illustration_page_2",
            "p22_30_textbook_illustration_page_2",
            "p23_31_textbook_illustration_page_2",
            "p24_32_textbook_illustration_page_2",
        ],
        "coverage": """
Teach ALL of these textbook points — none may be skipped:
- Consumers must assess quality when choosing among many goods (marble competition analogy: price, size, strength, colour).
- Reading a food packet label: Net quantity, Best before date, Date of manufacture, MRP, Name & address of manufacturer, Nutrition facts panel, Batch number, Allergen declaration, Ingredients list, and FSSAI mark & license number.
- FSSAI = Food Safety and Standards Authority of India. Logo on food packets/cartons means food has been tested by the government and is safe to consume.
- ISI Mark issued by the Bureau of Indian Standards (BIS). Found on electrical appliances, construction materials, automotive tyres, paper, etc. Ensures quality and safety.
- AGMARK (Ag for agriculture): certification for agricultural products — vegetables, fruits, cereals, pulses, spices, honey, etc.
- BEE Star rating = Bureau of Energy Efficiency. On TVs, laptops, ACs, etc. Higher stars = less electricity use → lower bills and better for the environment.
- Word of mouth / reputation also influences purchase decisions.
- Online reviews and feedback help decide whether to buy when shopping online — use carefully.
MUST explicitly teach and name: FSSAI, ISI, BIS, AGMARK, BEE (Bureau of Energy Efficiency), plus at least five label fields listed above.
Do NOT pad with repeated filler sentences. Every sentence must add a new fact.
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
Generate ONE complete micro-lesson storyboard for Grade 7 Social Science Chapter 12: "Understanding Markets".

TARGET LESSON: Lesson {num} of {len(LESSON_SPECS)}
LESSON TITLE: "{title}"
STUDENT NAME: {STUDENT_NAME}

SPECIFIC CONTENT THAT MUST BE THOROUGHLY TAUGHT IN THIS LESSON:
{coverage}

TEXTBOOK ARTIFACTS APPROVED FOR THIS LESSON (use these exact artifact_id values when visual_mode is artifact):
{art_line}

FULL CHAPTER ARTIFACT CATALOG (reference only):
{artifact_catalog[:8000]}

MANDATES:
1. Narration Script ("narration_text"):
   - MUST be between {NARRATION_WORDS_MIN} and {NARRATION_WORDS_MAX} words total.
   - Address student {STUDENT_NAME} warmly and conversationally.
   - Cover EVERY point in the specific content. Do not skip facts.
   - Prefer clear sentences under ~100 characters where natural.
   - CRITICAL: Do NOT repeat the same sentence or filler phrase. Every sentence must teach a new fact.
   - Prefer teaching density over padding. If near the word limit, add another real textbook fact — never loop old lines.

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
   - For certification lessons: include questions that name FSSAI, ISI/BIS, AGMARK, and/or BEE when those appear in coverage.
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
            "gemini-3.8-flash",
            "gemini-3.6-flash",
        ]
        # de-dupe while preserving order
        seen_m: set[str] = set()
        models = [m for m in models if not (m in seen_m or seen_m.add(m))]
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
    parser.add_argument("--only", type=int, help="Prepare only this lesson number")
    parser.add_argument("--from", dest="from_lesson", type=int, default=1)
    parser.add_argument("--force-audio", action="store_true")
    parser.add_argument("--skip-generate", action="store_true", help="Reuse generated_response.json")
    args = parser.parse_args()

    total = len(LESSON_SPECS)
    chapter_output_dir = RENDERED_OUTPUT_DIR / CLASS_NAME / SUBJECT_NAME / CHAPTER_NAME
    chapter_output_dir.mkdir(parents=True, exist_ok=True)
    cache_file = chapter_output_dir / "generated_response.json"
    chapter_id = build_chapter_id(CLASS_NAME, SUBJECT_NAME, CHAPTER_NAME)

    print(f"📦 Preparing Chapter-12 Understanding Markets for {STUDENT_NAME}...")
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
        while len(lessons) < total:
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
            print(f"🎬 Generating storyboard Lesson {n}/{total}: {spec['title']}")
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
        print(f"🛠️ Preparing assets Lesson {n}/{total}: {spec['title']}")
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

    print("\n🎉 Chapter-12 micro-lesson prepare pass complete.")
    print(f"   Output: {chapter_output_dir}")


if __name__ == "__main__":
    main()
