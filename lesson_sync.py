"""Narration ↔ on-screen card alignment and speech-bubble subtitle helpers."""

from __future__ import annotations

import re
from typing import Any

MAX_BUBBLE_CHARS = 100
MIN_ITEMS_BY_TYPE: dict[str, int] = {
    "intro": 2,
    "concept_card": 3,
    "math_step": 3,
    "summary_badge": 4,
}
MAX_ITEMS_PER_PANEL = 6
MAX_ITEM_CHARS = 30

_TERM_STOPWORDS = {
    "the", "this", "that", "these", "those", "after", "before", "during", "while",
    "when", "where", "what", "which", "who", "how", "why", "now", "well", "yes",
    "but", "and", "for", "with", "from", "into", "over", "under", "about", "just",
    "imagine", "welcome", "let", "hey", "hello", "so", "can", "you", "your", "they",
    "their", "them", "then", "than", "also", "even", "very", "quite", "here",
    "there", "some", "many", "most", "each", "every", "other", "another", "such",
    "like", "because", "although", "without", "within", "across", "through", "into",
    "india", "indian", "empire", "kingdom", "dynasty", "period", "chapter", "lesson",
    "students", "student", "scholars", "groups", "parts", "time", "years", "year",
}


def panel_sentence_ranges(n_sentences: int, n_panels: int) -> list[tuple[int, int]]:
    """Mirror panels_to_visual_events_precise sentence chunking."""
    if n_sentences <= 0 or n_panels <= 0:
        return []
    chunk_size = max(1, n_sentences // max(1, n_panels))
    ranges: list[tuple[int, int]] = []
    for idx in range(n_panels):
        start = min(idx * chunk_size, n_sentences - 1)
        end = (
            min((idx + 1) * chunk_size - 1, n_sentences - 1)
            if idx < n_panels - 1
            else n_sentences - 1
        )
        ranges.append((start, end))
    return ranges


def _round_cue(text: str, start: float, end: float) -> dict[str, Any]:
    return {
        "text": str(text).strip(),
        "start_time": round(max(0.0, float(start)), 3),
        "end_time": round(max(float(start) + 0.05, float(end)), 3),
    }


def _split_text_chunks(text: str, max_chars: int) -> list[str]:
    text = re.sub(r"\s+", " ", text.strip())
    if len(text) <= max_chars:
        return [text]

    # Prefer breaks at punctuation / em-dash / semicolon / comma.
    parts: list[str] = []
    for segment in re.split(r"(?<=[.;!?])\s+|(?:\s+—\s+)|(?:\s*;\s+)", text):
        segment = segment.strip()
        if not segment:
            continue
        if len(segment) <= max_chars:
            parts.append(segment)
            continue
        words = segment.split()
        buf: list[str] = []
        length = 0
        for word in words:
            add = len(word) + (1 if buf else 0)
            if buf and length + add > max_chars:
                parts.append(" ".join(buf))
                buf = [word]
                length = len(word)
            else:
                buf.append(word)
                length += add
        if buf:
            parts.append(" ".join(buf))
    return [p for p in parts if p]


def split_timeline_cues(
    timeline: list[dict[str, Any]],
    *,
    max_chars: int = MAX_BUBBLE_CHARS,
) -> list[dict[str, Any]]:
    """Split long TTS cues so the speech bubble can show the full line."""
    result: list[dict[str, Any]] = []
    for cue in timeline:
        text = str(cue.get("text", "")).strip()
        if not text:
            continue
        start = float(cue["start_time"])
        end = float(cue["end_time"])
        duration = max(0.05, end - start)
        if len(text) <= max_chars:
            result.append(cue)
            continue

        parts = _split_text_chunks(text, max_chars)
        if len(parts) <= 1:
            result.append(cue)
            continue

        total_len = sum(len(p) for p in parts)
        cursor = start
        for index, part in enumerate(parts):
            if index == len(parts) - 1:
                part_end = end
            else:
                part_end = cursor + duration * (len(part) / total_len)
            result.append(_round_cue(part, cursor, part_end))
            cursor = part_end
    return result


def _shorten_chip(text: str, max_len: int = MAX_ITEM_CHARS) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if len(cleaned) <= max_len:
        return cleaned
    for sep in (",", " — ", " - ", ":"):
        if sep in cleaned:
            head = cleaned.split(sep, 1)[0].strip()
            if 4 <= len(head) <= max_len:
                return head
    return cleaned[: max_len - 1].rstrip() + "…"


def _list_phrases(chunk: str) -> list[str]:
    """Pull comma/and-separated lists from narration (e.g. kingdom names)."""
    found: list[str] = []
    list_patterns = [
        r"(?:like|such as|including|e\.g\.)\s+([^.;!?]+)",
        r"—\s+([^.;!?]+)",
    ]
    for pattern in list_patterns:
        for match in re.finditer(pattern, chunk, flags=re.IGNORECASE):
            segment = match.group(1)
            for piece in re.split(r",|\band\b", segment):
                piece = piece.strip(" \"'")
                if len(piece) >= 3:
                    found.append(piece)
    return found


def _proper_noun_terms(chunk: str) -> list[str]:
    tokens = re.findall(
        r"\b[A-Z][a-z]+(?:['’][A-Za-z]+)?(?:\s+[A-Z][a-z]+){0,2}\b",
        chunk,
    )
    result: list[str] = []
    for token in tokens:
        key = token.lower()
        if key in _TERM_STOPWORDS or len(token) < 4:
            continue
        if token not in result:
            result.append(token)
    return result


def extract_display_terms(chunk: str) -> list[str]:
    terms: list[str] = []
    for source in (_list_phrases(chunk), _proper_noun_terms(chunk)):
        for term in source:
            chip = _shorten_chip(term)
            if chip and chip.lower() not in {t.lower() for t in terms}:
                terms.append(chip)
    return terms


def _term_covered(term: str, blob: str) -> bool:
    lowered = term.lower()
    if lowered in blob:
        return True
    words = [w for w in re.findall(r"[a-z]{4,}", lowered)]
    return bool(words) and all(word in blob for word in words)


def enrich_panel_items(
    items: list[Any],
    narration_chunk: str,
    panel_type: str,
) -> list[str]:
    """Add missing key terms from narration so cards match what is spoken."""
    cleaned = [_shorten_chip(str(item)) for item in (items or []) if str(item).strip()]
    cleaned = [c for c in cleaned if c]
    blob = " ".join(cleaned).lower()

    for term in extract_display_terms(narration_chunk):
        if _term_covered(term, blob):
            continue
        if any(term.lower() in existing.lower() for existing in cleaned):
            continue
        cleaned.append(term)
        blob = f"{blob} {term.lower()}"
        if len(cleaned) >= MAX_ITEMS_PER_PANEL:
            break

    min_items = MIN_ITEMS_BY_TYPE.get(panel_type, 2)
    if len(cleaned) < min_items:
        for term in extract_display_terms(narration_chunk):
            if _term_covered(term, blob):
                continue
            cleaned.append(term)
            blob = f"{blob} {term.lower()}"
            if len(cleaned) >= min_items:
                break

    return cleaned[:MAX_ITEMS_PER_PANEL]


def align_storyboard_panels(lesson: dict[str, Any], split_sentences) -> dict[str, Any]:
    """Enrich each panel's items from its narration sentence chunk."""
    if not isinstance(lesson, dict):
        return lesson

    narration = lesson.get("narration_text", "")
    panels = lesson.get("panels")
    if not isinstance(narration, str) or not narration.strip():
        return lesson
    if not isinstance(panels, list) or not panels:
        return lesson

    sentences = split_sentences(narration)
    ranges = panel_sentence_ranges(len(sentences), len(panels))
    for panel, (start, end) in zip(panels, ranges):
        if not isinstance(panel, dict):
            continue
        chunk = " ".join(sentences[start : end + 1])
        panel_type = str(panel.get("type") or panel.get("card_type") or "concept_card")
        panel["items"] = enrich_panel_items(panel.get("items", []), chunk, panel_type)
    return lesson


def is_storyboard_complete(lesson: dict[str, Any], *, min_panels: int = 2) -> bool:
    if not isinstance(lesson, dict):
        return False
    narration = str(lesson.get("narration_text", "")).strip()
    if len(narration) < 80:
        return False
    if not narration.rstrip().endswith((".", "!", "?", '"', "'", "”", "’")):
        return False
    panels = lesson.get("panels")
    if not isinstance(panels, list) or len(panels) < min_panels:
        return False
    for panel in panels:
        if not isinstance(panel, dict):
            return False
        if not str(panel.get("title", "")).strip():
            return False
        items = panel.get("items")
        if not isinstance(items, list) or len(items) < 1:
            return False
    return True


def audit_panel_coverage(
    lesson: dict[str, Any],
    split_sentences,
) -> list[str]:
    """Return human-readable warnings when narration terms are missing from cards."""
    warnings: list[str] = []
    narration = lesson.get("narration_text", "")
    panels = lesson.get("panels", [])
    if not narration or not panels:
        return warnings

    title = lesson.get("lesson_title") or lesson.get("title") or "Lesson"
    sentences = split_sentences(narration)
    ranges = panel_sentence_ranges(len(sentences), len(panels))

    for index, (panel, (start, end)) in enumerate(zip(panels, ranges)):
        if not isinstance(panel, dict):
            continue
        chunk = " ".join(sentences[start : end + 1])
        items = panel.get("items", [])
        blob = " ".join(str(i) for i in items).lower()
        missing = [
            t for t in extract_display_terms(chunk)
            if t.lower() not in blob and not any(t.lower() in str(i).lower() for i in items)
        ]
        if missing:
            preview = ", ".join(missing[:5])
            warnings.append(
                f"{title} panel {index + 1} ({panel.get('title', '')}): "
                f"terms still missing from items after enrich — {preview}"
            )
        if len(items) < MIN_ITEMS_BY_TYPE.get(str(panel.get("type", "")), 2):
            warnings.append(
                f"{title} panel {index + 1}: only {len(items)} items "
                f"(target {MIN_ITEMS_BY_TYPE.get(str(panel.get('type', '')), 2)}+)"
            )
    return warnings
