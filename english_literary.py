"""
English (Poorvi) literary pipeline helpers.

Subject-specific cleaning, piece segmentation, movie-like prompts,
narration QA, and literary fallback (never pastes raw PDF chrome into TTS).
"""
from __future__ import annotations

import re
from typing import Any

# Shared with Chapter_Agent via callers
NARRATION_WORDS_MIN_DEFAULT = 450
NARRATION_WORDS_MAX_DEFAULT = 600
MAX_TITLE_CHARS_DEFAULT = 42
MAX_ITEM_CHARS_DEFAULT = 48

_CHROME_PATTERNS = [
    re.compile(r"Unit\s*\d+\.indd\s*\d*", re.I),
    re.compile(r"\d{1,2}-[A-Za-z]{3}-\d{2}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)", re.I),
    re.compile(r"\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)", re.I),
    re.compile(r"Reprint\s+20\d{2}\s*[-–]\s*\d{2}", re.I),
    re.compile(r"\bPoorvi\b(?=\s+\d|\s*$)", re.I),
    re.compile(r"(?:^|\s)\d{1,3}(?=\s+Unit\b)", re.I),
]

# Glossary crumbs: "behold: see panorama: scene"
_GLOSSARY_RUN = re.compile(
    r"(?:\b[A-Za-z][A-Za-z'’-]{2,24}\s*:\s*[A-Za-z][A-Za-z'’\s-]{1,40}\s*){2,}"
)


def clean_english_pdf_text(text: str) -> str:
    """Strip InDesign chrome, reprints, clocks, and glossary dumps; keep prose."""
    if not text:
        return ""
    out = text.replace("\u00a0", " ")
    out = out.replace("\r\n", "\n").replace("\r", "\n")
    for pat in _CHROME_PATTERNS:
        out = pat.sub(" ", out)
    out = _GLOSSARY_RUN.sub(" ", out)
    # Lone page numbers on their own lines
    out = re.sub(r"(?m)^\s*\d{1,3}\s*$", " ", out)
    # Collapse whitespace but keep paragraph breaks lightly
    out = re.sub(r"[ \t]+", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    out = re.sub(r" +", " ", out)
    return out.strip()


def segment_english_piece(pdf_text: str, title: str, *, next_titles: list[str] | None = None) -> str:
    """Return cleaned text for one literary piece, cut before the next title when possible."""
    cleaned = clean_english_pdf_text(pdf_text)
    if not cleaned:
        return ""
    needle = re.sub(r"\s+", " ", title.strip())
    lower = cleaned.lower()
    idx = lower.find(needle.lower())
    if idx < 0:
        parts = [w for w in re.findall(r"[A-Za-z']+", needle) if len(w) > 3]
        for i in range(len(parts)):
            frag = " ".join(parts[i : i + 3])
            if len(frag) < 8:
                continue
            idx = lower.find(frag.lower())
            if idx >= 0:
                break
    if idx < 0:
        idx = 0
    end = len(cleaned)
    for nxt in next_titles or []:
        n2 = re.sub(r"\s+", " ", (nxt or "").strip())
        if not n2 or n2.lower() == needle.lower():
            continue
        j = lower.find(n2.lower(), idx + max(20, len(needle)))
        if j > idx:
            end = min(end, j)
    chunk = cleaned[idx:end].strip()
    chunk = clean_english_pdf_text(chunk)
    # Soft cap so prompts stay focused
    if len(chunk) > 6500:
        chunk = chunk[:6500].rsplit(" ", 1)[0]
    return chunk


def narration_has_chrome(narration: str) -> bool:
    if not narration:
        return True
    if ".indd" in narration.lower():
        return True
    if re.search(r"Reprint\s+20\d{2}", narration, re.I):
        return True
    if re.search(r"\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)", narration, re.I):
        return True
    if re.search(r"Unit\s*\d+\.indd", narration, re.I):
        return True
    if _GLOSSARY_RUN.search(narration):
        return True
    return False


def english_narration_qa_gate(
    lesson: dict,
    spec: dict,
    *,
    min_words: int = 400,
    min_panels: int = 5,
) -> tuple[bool, list[str]]:
    """Return (ok, reasons). Reject chrome, missing must_name, short scripts."""
    reasons: list[str] = []
    narr = (lesson.get("narration_text") or "").strip()
    panels = lesson.get("panels") if isinstance(lesson.get("panels"), list) else []
    words = len(narr.split())
    if words < min_words:
        reasons.append(f"word_count={words} < {min_words}")
    if len(panels) < min_panels:
        reasons.append(f"panels={len(panels)} < {min_panels}")
    if narration_has_chrome(narr):
        reasons.append("pdf_chrome_or_glossary_in_narration")
    must = spec.get("must_name") or []
    if isinstance(must, str):
        must = [must]
    head = " ".join(narr.split()[:50]).lower()
    for name in must:
        if name and name.lower() not in narr.lower():
            reasons.append(f"missing_must_name:{name}")
        elif name and name.lower() not in head:
            # Soft: prefer early mention; still fail hard if totally missing (above)
            # If present later only, warn but allow when early check fails:
            if name.lower() in narr.lower() and name.lower() not in head:
                reasons.append(f"must_name_not_early:{name}")
    # Treat "not early" as soft — only hard-fail if completely missing
    hard = [r for r in reasons if not r.startswith("must_name_not_early:")]
    return (len(hard) == 0, reasons)


def _piece_shape(piece_type: str) -> str:
    t = (piece_type or "story").lower()
    if t == "poem":
        return (
            "POEM SHAPE: Recite or closely paraphrase key lines → name imagery/device → "
            "explain meaning → connect to student life → one exercise answer with evidence."
        )
    if t in {"non-fiction", "nonfiction", "essay"}:
        return (
            "NON-FICTION SHAPE: Name the writer and purpose immediately → walk each major "
            "section (e.g. Day 1 / Day 2 / Day 3) with feeling → takeaway theme → one "
            "exercise answer with textual evidence."
        )
    if t == "play":
        return (
            "PLAY SHAPE: Set the scene → paraphrase key dialogue beats → comic or tense "
            "turning point → message about speech/manners → exercise answer with evidence."
        )
    if t == "graphic":
        return (
            "GRAPHIC NARRATIVE SHAPE: Introduce the hero and stakes → beat-by-beat story "
            "from the panels → why they are remembered → exercise answer with evidence."
        )
    return (
        "STORY SHAPE: Hook → character want/fear → turning points → climax/change → "
        "theme → one exercise answer with textual evidence."
    )


def build_english_literary_prompt(
    *,
    chapter_num: int,
    unit: str,
    spec: dict,
    piece_text: str,
    artifact_ids: list[str],
    artifact_catalog: str,
    student_name: str,
    total_lessons: int,
    narration_words_min: int = NARRATION_WORDS_MIN_DEFAULT,
    narration_words_max: int = NARRATION_WORDS_MAX_DEFAULT,
    max_title_chars: int = MAX_TITLE_CHARS_DEFAULT,
    max_item_chars: int = MAX_ITEM_CHARS_DEFAULT,
) -> str:
    """Subject-specific English literary short-film prompt (not SS/history)."""
    num = spec["lesson_num"]
    title = spec["title"]
    piece_type = spec.get("piece_type", "story")
    author = (spec.get("author") or "").strip()
    must = spec.get("must_name") or ([] if not author else [author])
    if isinstance(must, str):
        must = [must]
    arc = (spec.get("arc") or "").strip()
    coverage = spec.get("coverage") or ""
    art_line = ", ".join(artifact_ids) if artifact_ids else "(none — use generated backgrounds)"
    must_line = ", ".join(must) if must else "(none)"
    author_line = author or "(unknown — infer only if clearly in the piece text)"

    return f"""
You are the Senior Literary Film Director for Kriti School's English (Poorvi) Drona Engine.
Your job is NOT to read the textbook aloud. Weave a 3–4 minute literary SHORT FILM script
that a Class-7 student watches and feels — with context, craft, and heart.

UNIT: {chapter_num}. {unit}
LESSON: {num} of {total_lessons}
TITLE: "{title}"
PIECE TYPE: {piece_type}
AUTHOR: {author_line}
MUST NAME IN NARRATION (exact spelling): {must_line}
ARC / STRUCTURE TO HONOUR:
{arc or "(follow the natural structure of the piece)"}
STUDENT: {student_name}

{_piece_shape(piece_type)}

CONTENT THAT MUST BE TAUGHT:
{coverage}

CLEANED PIECE TEXT (source of truth — do not invent facts; do NOT copy print chrome):
\"\"\"
{piece_text[:6000]}
\"\"\"

APPROVED ARTIFACT IDs for this lesson (use exact ids when visual_mode is artifact):
{art_line}

ARTIFACT CATALOG (reference):
{artifact_catalog[:7000]}

HARD RULES:
1. narration_text: {narration_words_min}-{narration_words_max} words.
   - Warm Gyanu voice speaking to {student_name}; movie pacing; short clear sentences.
   - If MUST NAME list is non-empty: mention each name in the FIRST 40 words, including
     that they are the writer/poet/speaker when that is true.
   - NEVER include: .indd filenames, page numbers, timestamps, "Reprint 20xx", glossary
     dumps like "behold: see", or raw OCR garbage.
   - NEVER paste long verbatim textbook paragraphs; paraphrase and dramatize.
   - End with theme + how to answer ONE Let us discuss/learn question with evidence.
2. panels: 5–7 objects with TOP-LEVEL phase, type, title, items, mascot_pose, visual_mode,
   artifact_id (when used), bg_prompt (when generated). No nesting title/items only under visual_data.
   - Panel 1: intro. Middle: concept_card. Last: summary_badge.
   - Prefer ALL approved artifacts across concept panels; never invent artifact_id.
   - title <= {max_title_chars} chars; each item <= {max_item_chars} chars; 3–5 items.
3. initial_quiz: EXACTLY 5 items from THIS piece's exercises/comprehension.
   - Each: question, options[4], answer, explanation, solution_step.
   - At least 2 inference/reasoning items.

OUTPUT: ONLY a valid JSON object with keys lesson_title, narration_text, panels, initial_quiz.
""".strip()


def build_literary_fallback_storyboard(
    *,
    piece_text: str,
    chapter_num: int,
    unit: str,
    spec: dict,
    artifact_ids: list[str],
    student_name: str = "Saanvi",
    max_title_chars: int = MAX_TITLE_CHARS_DEFAULT,
    max_item_chars: int = MAX_ITEM_CHARS_DEFAULT,
) -> dict[str, Any]:
    """Structured teacher script from metadata + clean sentences — never raw PDF paste."""
    title = spec["title"]
    piece_type = spec.get("piece_type", "story")
    author = (spec.get("author") or "").strip()
    must = spec.get("must_name") or ([] if not author else [author])
    if isinstance(must, str):
        must = [must]
    arc = (spec.get("arc") or "").strip()
    clean = clean_english_pdf_text(piece_text or "")

    # Keep only clean-looking sentences (reject chrome leftovers)
    raw_sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean) if len(s.strip()) > 30]
    sents: list[str] = []
    for s in raw_sents:
        if narration_has_chrome(s):
            continue
        if re.search(r"\b\w+:\s*\w+\s+\w+:\s*\w+", s):
            continue
        sents.append(s)

    # Paraphrase-friendly beat summaries instead of dumping OCR
    beat_bits: list[str] = []
    for s in sents[:12]:
        # Light trim; do not dump glossary
        clipped = s
        if len(clipped.split()) > 35:
            clipped = " ".join(clipped.split()[:35]) + "."
        beat_bits.append(clipped)
        if len(" ".join(beat_bits).split()) > 180:
            break

    name_open = ""
    if must:
        who = must[0]
        role = "wrote" if piece_type in {"non-fiction", "nonfiction", "essay", "story"} else "gives us"
        if piece_type == "poem":
            role = "wrote"
        if piece_type == "play":
            role = "brings us"
        name_open = (
            f"Hi {student_name}! Today we meet \"{title}\" — and first, remember the name "
            f"{who}, who {role} this {piece_type}. "
        )
    else:
        name_open = (
            f"Hi {student_name}! Today we step into \"{title}\" from Poorvi unit {chapter_num}, "
            f"{unit}. "
        )

    arc_line = f"Watch the arc: {arc}. " if arc else ""
    middle = (
        f"This is a literary short film, not a page being read aloud. {arc_line}"
        f"In this {piece_type}, we follow feelings, turning points, and craft. "
    )
    if beat_bits:
        middle += (
            "Here are the heartbeats of the text, told in our own words as clues from the book: "
            + " ".join(beat_bits[:6])
            + " "
        )
    else:
        middle += (
            f"We stay faithful to the textbook scenes of \"{title}\" — noticing what the writer "
            f"wants us to feel and why those moments matter for a Class-7 reader. "
        )

    craft = (
        f"Notice how language paints pictures: a careful word, an image, a choice. "
        f"When a Let us discuss question asks why, answer with a claim, because, and evidence "
        f"from \"{title}\". Theme time: say the big idea in your own words — gratitude, courage, "
        f"humour, wonder, or homage — then prove it with one concrete detail. "
    )
    outro = (
        f"Carry this piece with you, {student_name}: read like a film director, feel the scene, "
        f"and explain answers with evidence. That is how we learn English at Kriti."
    )
    narration = name_open + middle + craft + outro

    pad = (
        f" Pause with me on one more frame from \"{title}\": what would you show on screen "
        f"if you directed this moment — faces, light, motion, or silence — and why does that "
        f"choice match the writer's purpose?"
    )
    while len(narration.split()) < 450:
        narration += " " + pad
        if len(narration.split()) > 560:
            break
    if len(narration.split()) > 600:
        narration = " ".join(narration.split()[:590])

    # Ensure must_name appears early even after padding edits
    for name in must:
        if name and name.lower() not in " ".join(narration.split()[:40]).lower():
            narration = f"Remember: {name}. " + narration

    arts = list(artifact_ids or [])
    author_item = (author or (must[0] if must else piece_type))[:max_item_chars]
    panels: list[dict] = [
        {
            "phase": "Intro",
            "type": "intro",
            "title": title[:max_title_chars],
            "items": [
                author_item,
                f"{piece_type.title()} · Unit {chapter_num}"[:max_item_chars],
                "Literary short film walkthrough"[:max_item_chars],
            ],
            "mascot_pose": "talking",
            "visual_mode": "generated",
            "bg_prompt": (
                f"Warm storybook cinema mood for {title}, soft golden light, "
                f"8k --no text --no people"
            ),
        }
    ]
    mid_titles = ["Opening Hook", "Turning Beats", "Craft & Feeling", "Theme & Evidence"]
    if piece_type in {"non-fiction", "nonfiction"} and "day" in (arc or "").lower():
        mid_titles = ["Day One", "Day Two", "Day Three", "Theme & Evidence"]
    elif piece_type == "poem":
        mid_titles = ["Key Lines", "Images & Sound", "Meaning", "Theme & Evidence"]

    for i, mt in enumerate(mid_titles):
        panel: dict[str, Any] = {
            "phase": "Concept",
            "type": "concept_card",
            "title": mt[:max_title_chars],
            "items": [
                f"From \"{title}\""[:max_item_chars],
                "Feel the scene, not the page stamp"[:max_item_chars],
                "Evidence before guessing"[:max_item_chars],
            ],
            "mascot_pose": "pointing" if i % 2 else "talking",
        }
        if i < len(arts):
            panel["visual_mode"] = "artifact"
            panel["artifact_id"] = arts[i]
        else:
            panel["visual_mode"] = "generated"
            panel["bg_prompt"] = (
                f"Cinematic illustration inspired by {title}, gentle colors, "
                f"8k --no text --no people"
            )
        panels.append(panel)

    for j, aid in enumerate(arts[len(mid_titles) :]):
        if len(panels) >= 6:
            break
        panels.append(
            {
                "phase": "Concept",
                "type": "concept_card",
                "title": f"Textbook Scene {j + 1}"[:max_title_chars],
                "items": [
                    "Match image to meaning"[:max_item_chars],
                    "Use art as story evidence"[:max_item_chars],
                    f"Stay with \"{title}\""[:max_item_chars],
                ],
                "mascot_pose": "talking",
                "visual_mode": "artifact",
                "artifact_id": aid,
            }
        )

    concept = [p for p in panels if p.get("phase") == "Concept"][:5]
    panels = [panels[0]] + concept
    panels.append(
        {
            "phase": "Summary",
            "type": "summary_badge",
            "title": "What We Carry Forward"[:max_title_chars],
            "items": [
                f"Name the writer of \"{title}\""[:max_item_chars]
                if must
                else f"Retell \"{title}\""[:max_item_chars],
                "State the theme with evidence"[:max_item_chars],
                "Explain one exercise answer"[:max_item_chars],
            ],
            "mascot_pose": "happy",
            "visual_mode": "generated",
            "bg_prompt": (
                f"Hopeful closing frame for {title}, warm light, 8k --no text --no people"
            ),
        }
    )

    who = must[0] if must else "the writer"
    quiz = []
    for qi in range(5):
        if qi == 0 and must:
            opts = [
                who,
                "A random classmate",
                "The printer of the textbook",
                "An unnamed narrator only",
            ]
            quiz.append(
                {
                    "id": 1,
                    "type": "multiple_choice",
                    "question": f"Who wrote or is the voice behind \"{title}\"?",
                    "options": opts,
                    "answer": opts[0],
                    "explanation": f"{who} is central to understanding this piece.",
                    "solution_step": (
                        f"The lesson opens by naming {who}; distractors invent unrelated people."
                    ),
                }
            )
            continue
        opts = [
            "Claim + because + evidence from the text",
            "Only a one-word guess",
            "Copy a random paragraph with page stamps",
            "Ignore the question",
        ]
        quiz.append(
            {
                "id": qi + 1,
                "type": "multiple_choice",
                "question": (
                    f"How should you answer a Let us discuss question about \"{title}\"?"
                ),
                "options": opts,
                "answer": opts[0],
                "explanation": "Strong English answers pair a claim with textual evidence.",
                "solution_step": (
                    "Eliminate guesses and OCR dumps; keep reasoned claim-plus-evidence."
                ),
            }
        )

    print(
        f"   🎬 Literary fallback for '{title}' "
        f"({len(narration.split())} words, {len(panels)} panels, author={author or who})"
    )
    return {
        "lesson_title": title,
        "narration_text": narration,
        "panels": panels,
        "initial_quiz": quiz,
    }
