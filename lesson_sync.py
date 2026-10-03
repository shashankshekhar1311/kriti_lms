"""Narration ↔ on-screen card alignment and speech-bubble subtitle helpers."""

from __future__ import annotations

import re
from typing import Any

MAX_BUBBLE_CHARS = 100
MIN_STANDALONE_BUBBLE_LEN = 16
MIN_ITEMS_BY_TYPE: dict[str, int] = {
    "intro": 2,
    "concept_card": 3,
    "math_step": 3,
    "summary_badge": 4,
}
MAX_ITEMS_PER_PANEL = 10
MAX_ITEM_CHARS = 70

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
    "that's", "it's", "what's", "let's", "we're", "they're", "you're", "i'm",
    "hey", "smart", "right", "trade", "imagine", "welcome", "exactly", "well",
    "saanvi", "rahul", "guess", "next", "together", "find", "explore",
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "last", "lastly",
    "understanding", "almost", "near", "long", "see", "think", "remember", "finally",
    "overall", "meanwhile", "furthermore", "however", "today", "ready", "dive",
    "look", "looking", "notice", "tell", "telling", "says", "said", "one", "two", "three",
    "four", "five", "six", "seven", "eight", "nine", "ten", "french", "novelist", "marcel", "proust"
}

_BUBBLE_MERGE_RE = re.compile(
    r"^(?:"
    r"hey\s+\w+[!?.]*|"
    r"hi\s+\w+[!?.]*|"
    r"hello\s+\w+[!?.]*|"
    r"why\??|"
    r"so,?\s+what\b.*|"
    r"let'?s\b.*|"
    r"can you imagine that\??|"
    r"smart,?\s*right\??|"
    r"and guess what\??|"
    r"now,?\s*$"
    r")$",
    re.IGNORECASE,
)


def clean_tokens_for_alignment(text: str) -> list[str]:
    text = re.sub(r"[^\w\s]", " ", text.lower())
    stopwords = {
        "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "of", "with",
        "is", "are", "was", "were", "it", "its", "that", "this", "these", "those",
        "i", "you", "we", "he", "she", "they", "me", "my", "your", "our", "their",
        "so", "as", "by", "from", "be", "been", "have", "has", "had", "do", "does",
        "did", "not", "but", "what", "which", "who", "whom", "whose", "when", "where",
        "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
        "some", "such", "no", "nor", "too", "very", "can", "will", "just", "should",
        "now", "into", "than", "then", "up", "out", "about", "like", "let"
    }
    return [w for w in text.split() if len(w) > 2 and w not in stopwords]


def get_panel_keywords_for_alignment(panel: dict[str, Any], idx: int, total_panels: int) -> set[str]:
    tokens: set[str] = set()
    tokens.update(clean_tokens_for_alignment(str(panel.get("title", ""))))
    for item in panel.get("items", []):
        tokens.update(clean_tokens_for_alignment(str(item)))
    if panel.get("artifact_id"):
        tokens.update(clean_tokens_for_alignment(str(panel["artifact_id"]).replace("_", " ")))
    if panel.get("artifact_caption"):
        tokens.update(clean_tokens_for_alignment(str(panel["artifact_caption"])))
    if panel.get("narration_cue"):
        tokens.update(clean_tokens_for_alignment(str(panel["narration_cue"])))

    # Positional priors
    if idx == 0:
        tokens.update(["welcome", "first", "start", "begin", "today", "dive", "rahul", "saanvi"])
    elif idx == total_panels - 1:
        tokens.update(["complete", "recap", "summary", "learnt", "learned", "next", "lesson", "solid", "see"])
    return tokens


def align_panels_to_timeline(
    panels: list[dict[str, Any]],
    timeline_or_sentences: list[dict[str, Any]] | list[str],
    min_cues_per_panel: int = 2,
) -> list[int]:
    """Find optimal cue index boundaries [b_0=0, b_1, ..., b_N = total_cues] using Dynamic Programming."""
    total_panels = len(panels)
    total_cues = len(timeline_or_sentences)
    if total_panels <= 1 or total_cues <= total_panels:
        chunk_size = max(1, total_cues // max(1, total_panels))
        return [min(i * chunk_size, total_cues) for i in range(total_panels)] + [total_cues]

    texts: list[str] = []
    for item in timeline_or_sentences:
        if isinstance(item, dict):
            texts.append(str(item.get("text", "")))
        else:
            texts.append(str(item))

    panel_kw_sets = [get_panel_keywords_for_alignment(p, i, total_panels) for i, p in enumerate(panels)]

    scores: list[list[float]] = []
    for p_idx, kw_set in enumerate(panel_kw_sets):
        row = []
        expected_cue_center = (p_idx + 0.5) / total_panels * total_cues
        for c_idx, txt in enumerate(texts):
            cue_tokens = clean_tokens_for_alignment(txt)
            match_count = sum(1 for t in cue_tokens if t in kw_set)
            dist = abs(c_idx - expected_cue_center) / total_cues
            pos_weight = max(0.1, 1.0 - 0.5 * dist)
            row.append(match_count * 2.0 * pos_weight)
        scores.append(row)

    dp: list[dict[int, tuple[float, int]]] = [{} for _ in range(total_panels)]
    current_sum = 0.0
    for c in range(total_cues):
        current_sum += scores[0][c]
        if c >= min_cues_per_panel - 1:
            dp[0][c] = (current_sum, 0)

    for p in range(1, total_panels):
        min_start = p * min_cues_per_panel
        max_end = total_cues - (total_panels - p - 1) * min_cues_per_panel

        for c in range(min_start, max_end):
            best_val = -1e9
            best_prev = -1
            panel_sum = 0.0
            for k in range(c, min_start - 1, -1):
                panel_sum += scores[p][k]
                prev_c = k - 1
                if prev_c in dp[p - 1]:
                    total = dp[p - 1][prev_c][0] + panel_sum
                    if total > best_val:
                        best_val = total
                        best_prev = prev_c
            if best_prev != -1:
                dp[p][c] = (best_val, best_prev)

    if not dp[total_panels - 1] or (total_cues - 1) not in dp[total_panels - 1]:
        chunk_size = max(1, total_cues // max(1, total_panels))
        return [min(i * chunk_size, total_cues) for i in range(total_panels)] + [total_cues]

    boundaries = [total_cues]
    curr = total_cues - 1
    for p in range(total_panels - 1, 0, -1):
        prev = dp[p][curr][1]
        boundaries.append(prev + 1)
        curr = prev
    boundaries.append(0)
    boundaries.reverse()
    return boundaries


def panel_sentence_ranges(
    n_sentences: int,
    n_panels: int,
    *,
    panels: list[dict[str, Any]] | None = None,
    sentences: list[str] | None = None,
) -> list[tuple[int, int]]:
    """Return (start_idx, end_idx) sentence ranges for panels using semantic DP alignment."""
    if n_sentences <= 0 or n_panels <= 0:
        return []
    if panels and sentences and len(panels) == n_panels and len(sentences) == n_sentences:
        bounds = align_panels_to_timeline(panels, sentences)
        return [(bounds[i], bounds[i + 1] - 1) for i in range(n_panels)]

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


def _should_merge_bubble_cue(text: str) -> bool:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if not cleaned:
        return True
    if len(cleaned) < MIN_STANDALONE_BUBBLE_LEN:
        return True
    if _BUBBLE_MERGE_RE.match(cleaned):
        return True
    return False


def merge_short_bubble_cues(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge greetings and filler lines into the next cue for speech-bubble display."""
    if not timeline:
        return []

    merged: list[dict[str, Any]] = []
    index = 0
    while index < len(timeline):
        cue = timeline[index]
        text = str(cue.get("text", "")).strip()
        start = float(cue["start_time"])
        end = float(cue["end_time"])

        if index + 1 < len(timeline) and _should_merge_bubble_cue(text):
            nxt = timeline[index + 1]
            nxt_text = str(nxt.get("text", "")).strip()
            combined = f"{text} {nxt_text}".strip()
            if combined and len(combined) <= MAX_BUBBLE_CHARS:
                text = combined
                end = float(nxt["end_time"])
                index += 1

        if text:
            merged.append(_round_cue(text, start, end))
        index += 1
    return merged


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


def _clean_list_piece(piece: str) -> str:
    cleaned = piece.strip(" \"'“”‘’")
    cleaned = re.sub(r"^(?:like|such as|including)\s+(?:the\s+)?", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^(?:the|a|an)\s+", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _is_junk_term(term: str) -> bool:
    lowered = term.lower().strip()
    if len(lowered) < 2:
        return True
    if "…" in term or "..." in term:
        return True
    words = lowered.split()
    if len(words) > 10:
        return True
    if lowered in _TERM_STOPWORDS:
        return True
    if lowered in {"around", "new", "think", "age", "reorganisation", "maurya", "after"}:
        return True
    if lowered.startswith(("hey ", "hi ", "hello ", "like the ", "like ", "that ", "this ")):
        return True
    if re.fullmatch(r"(why|smart,?\s*right|and guess what)\??", lowered):
        return True
    return False


def _list_phrases(chunk: str) -> list[str]:
    """Pull comma/and-separated lists from narration (e.g. kingdom names)."""
    found: list[str] = []
    list_patterns = [
        r"(?:like|such as|including|e\.g\.)\s+(?:the\s+)?([^.;!?]+)",
        r"—\s+like\s+(?:the\s+)?([^.;!?]+)",
        r"\b(?:groups|kingdoms)\s+like\s+(?:the\s+)?([^.;!?]+)",
    ]
    for pattern in list_patterns:
        for match in re.finditer(pattern, chunk, flags=re.IGNORECASE):
            segment = match.group(1)
            for piece in re.split(r",|\band\b", segment):
                piece = _clean_list_piece(piece)
                if len(piece) >= 3 and not _is_junk_term(piece):
                    found.append(piece)
    return found


def _hyphenated_terms(chunk: str) -> list[str]:
    return re.findall(r"\b[A-Z][A-Za-z]*(?:-[A-Z][A-Za-z]+)+\b", chunk)


def _proper_noun_terms(chunk: str) -> list[str]:
    hyphenated = _hyphenated_terms(chunk)
    hyphen_parts = {
        part.lower()
        for term in hyphenated
        for part in term.split("-")
        if part
    }
    tokens = re.findall(
        r"\b[A-Z][a-z]+(?:['’][A-Za-z]+)?(?:\s+[A-Z][a-z]+){0,2}\b",
        chunk,
    )
    result: list[str] = []
    for token in tokens:
        key = token.lower()
        if _is_junk_term(token) or key in _TERM_STOPWORDS:
            continue
        if key in hyphen_parts and token not in hyphenated:
            continue
        if "'" in token or token.lower().startswith("that"):
            continue
        if token not in result:
            result.append(token)
    return result


def _expand_compressed_items(items: list[str]) -> list[str]:
    """Split 'Inside: Shungas, Chedis' style chips into separate display terms."""
    expanded: list[str] = []
    for item in items:
        label_match = re.match(r"^(Inside|Outside|Within|Beyond)\s*:\s*(.+)$", item, re.IGNORECASE)
        if label_match:
            rest = label_match.group(2)
            parts = [_clean_list_piece(p) for p in re.split(r",|\band\b", rest)]
            parts = [p for p in parts if p and not _is_junk_term(p)]
            if len(parts) >= 2:
                expanded.extend(_shorten_chip(p) for p in parts)
                continue
        if "," in item and not item.lower().startswith(("step ", "result:")):
            parts = [_clean_list_piece(p) for p in re.split(r",|\band\b", item)]
            parts = [p for p in parts if p and not _is_junk_term(p)]
            if len(parts) >= 2:
                expanded.extend(_shorten_chip(p) for p in parts)
                continue
        expanded.append(item)
    return expanded


def extract_display_terms(chunk: str) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()

    def add(term: str) -> None:
        chip = _shorten_chip(term)
        key = chip.lower()
        if not chip or key in seen or _is_junk_term(chip):
            return
        seen.add(key)
        terms.append(chip)

    for term in _hyphenated_terms(chunk):
        add(term)
    for term in _proper_noun_terms(chunk):
        add(term)
    for term in _list_phrases(chunk):
        add(term)
    return terms


def _term_covered(term: str, blob: str) -> bool:
    lowered = term.lower()
    if lowered in blob:
        return True
    words = [w for w in re.findall(r"[a-z]{4,}", lowered)]
    return bool(words) and all(word in blob for word in words)


def _has_grouped_list_items(items: list[str]) -> bool:
    return any(re.match(r"^(Inside|Outside|Within|Beyond)\s*:", item, re.I) for item in items)


def enrich_panel_items(
    items: list[Any],
    narration_chunk: str,
    panel_type: str,
) -> list[str]:
    """Ensure panels display clean 1-10 word pointwise items, preserving high quality items."""
    originals = [_shorten_chip(str(item), max_len=MAX_ITEM_CHARS) for item in (items or []) if str(item).strip()]
    originals = [re.sub(r"^(?:[-*•–—]\s*|\d+[\.\)]\s+)", "", c).strip() for c in originals]
    originals = [c for c in originals if c and not _is_junk_term(c)]

    if _has_grouped_list_items(items or []) and narration_chunk:
        narration_terms = extract_display_terms(narration_chunk)
        kingdom_terms = [
            term
            for term in narration_terms
            if not _is_junk_term(term)
            and ("-" in term or term[:1].isupper())
            and len(term.split()) <= 3
        ]
        if kingdom_terms:
            return kingdom_terms[:MAX_ITEMS_PER_PANEL]

    min_items = MIN_ITEMS_BY_TYPE.get(panel_type, 2)
    # If the panel already has sufficient clean pointwise items (from storyboard), PRESERVE THEM!
    if len(originals) >= min_items:
        return originals[:MAX_ITEMS_PER_PANEL]

    cleaned = list(originals)
    narration_terms = extract_display_terms(narration_chunk)
    blob = " ".join(cleaned).lower()

    for term in narration_terms:
        if _is_junk_term(term) or len(term.split()) > 4:
            continue
        if _term_covered(term, blob) or any(term.lower() == existing.lower() for existing in cleaned):
            continue
        cleaned.append(term)
        blob = f"{blob} {term.lower()}"
        if len(cleaned) >= max(min_items, 4):
            break

    return cleaned[:MAX_ITEMS_PER_PANEL]


def _prioritize_terms(items: list[str], narration_terms: list[str]) -> list[str]:
    """Keep the most narration-relevant chips when trimming to the panel cap."""
    if len(items) <= MAX_ITEMS_PER_PANEL:
        return items
    priority = {term.lower(): index for index, term in enumerate(narration_terms)}
    ranked = sorted(
        items,
        key=lambda term: (priority.get(term.lower(), 10_000), len(term)),
    )
    return ranked[:MAX_ITEMS_PER_PANEL]


def align_storyboard_panels(lesson: dict[str, Any], split_sentences) -> dict[str, Any]:
    """Enrich each panel's items using semantic alignment."""
    if not isinstance(lesson, dict):
        return lesson

    narration = lesson.get("narration_text", "")
    panels = lesson.get("panels")
    if not isinstance(narration, str) or not narration.strip():
        return lesson
    if not isinstance(panels, list) or not panels:
        return lesson

    sentences = split_sentences(narration)
    ranges = panel_sentence_ranges(len(sentences), len(panels), panels=panels, sentences=sentences)
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
