"""Chapter artifact manifest loading and subject gating (Phase 0)."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
CONFIG_DIR = BASE_DIR / "config"
ASSETS_CHAPTERS_DIR = BASE_DIR / "assets" / "chapters"
SUBJECTS_CONFIG_PATH = CONFIG_DIR / "subjects.json"

VALID_VISUAL_MODES = frozenset({"generated", "artifact", "hybrid"})
ARTIFACT_EVENT_KEYS = (
    "visual_mode",
    "artifact_id",
    "artifact_image_url",
    "artifact_caption",
    "artifact_source",
)

_subjects_cache: dict[str, Any] | None = None


def _slugify(value: str) -> str:
    text = value.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


def load_subjects_config() -> dict[str, Any]:
    global _subjects_cache
    if _subjects_cache is not None:
        return _subjects_cache

    if not SUBJECTS_CONFIG_PATH.is_file():
        _subjects_cache = {
            "artifacts_enabled": [],
            "artifacts_disabled": [],
            "subject_aliases": {},
            "policy": {},
        }
        return _subjects_cache

    with open(SUBJECTS_CONFIG_PATH, encoding="utf-8") as handle:
        _subjects_cache = json.load(handle)
    return _subjects_cache


def resolve_subject_key(subject_name: str) -> str | None:
    if not subject_name:
        return None

    config = load_subjects_config()
    aliases: dict[str, str] = config.get("subject_aliases", {})
    normalized = _slugify(subject_name)

    if normalized in aliases:
        return aliases[normalized]

    for alias, canonical in aliases.items():
        alias_slug = _slugify(alias)
        if alias_slug and alias_slug in normalized:
            return canonical

    return None


def artifacts_enabled_for_subject(subject_name: str) -> bool:
    canonical = resolve_subject_key(subject_name)
    if not canonical:
        return False

    config = load_subjects_config()
    enabled = set(config.get("artifacts_enabled", []))
    disabled = set(config.get("artifacts_disabled", []))

    if canonical in disabled:
        return False
    return canonical in enabled


def build_chapter_id(class_name: str, subject_name: str, chapter_name: str) -> str:
    return _slugify(f"{class_name}_{subject_name}_{chapter_name}")


def _manifest_search_paths(chapter_id: str, chapter_output_dir: Path | None) -> list[Path]:
    paths = [ASSETS_CHAPTERS_DIR / chapter_id / "artifacts" / "manifest.json"]
    if chapter_output_dir is not None:
        paths.append(Path(chapter_output_dir) / "artifacts" / "manifest.json")
    return paths


def load_chapter_manifest(
    chapter_id: str,
    *,
    chapter_output_dir: Path | None = None,
) -> dict[str, Any] | None:
    for manifest_path in _manifest_search_paths(chapter_id, chapter_output_dir):
        if not manifest_path.is_file():
            continue
        with open(manifest_path, encoding="utf-8") as handle:
            manifest = json.load(handle)
        if not isinstance(manifest, dict):
            continue
        manifest["_manifest_path"] = str(manifest_path)
        manifest["_artifacts_dir"] = str(manifest_path.parent)
        return manifest
    return None


def _artifact_entry(manifest: dict[str, Any], artifact_id: str) -> dict[str, Any] | None:
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        return None
    for entry in artifacts:
        if isinstance(entry, dict) and entry.get("id") == artifact_id:
            return entry
    return None


def _normalize_visual_mode(raw_mode: Any, *, has_artifact: bool) -> str:
    if isinstance(raw_mode, str):
        mode = raw_mode.strip().lower()
        if mode in VALID_VISUAL_MODES:
            return mode
    return "artifact" if has_artifact else "generated"


def _page_ref_text(page_ref: Any) -> str | None:
    if page_ref is None:
        return None
    if isinstance(page_ref, int):
        return f"p. {page_ref}"
    text = str(page_ref).strip()
    return text or None


def resolve_panel_artifact_fields(
    panel: dict[str, Any],
    *,
    artifacts_enabled: bool,
    manifest: dict[str, Any] | None,
    lesson_dir: Path,
) -> dict[str, Any]:
    """Return optional artifact fields for a visual event (Phase 0 pass-through + manifest resolve)."""
    if not artifacts_enabled or not isinstance(panel, dict):
        return {}

    artifact_id = panel.get("artifact_id")
    if isinstance(artifact_id, str):
        artifact_id = artifact_id.strip() or None
    else:
        artifact_id = None

    visual_mode = panel.get("visual_mode")
    artifact_image_url = panel.get("artifact_image_url")
    artifact_caption = panel.get("artifact_caption")
    artifact_source = panel.get("artifact_source")

    entry = None
    if artifact_id and manifest:
        entry = _artifact_entry(manifest, artifact_id)
        if entry is None:
            print(f"   ⚠️ Unknown artifact_id '{artifact_id}' — skipping artifact for this panel.")
            artifact_id = None
        elif entry.get("approved") is False:
            print(
                f"   ⚠️ Artifact '{artifact_id}' is not curator-approved — skipping for this panel."
            )
            artifact_id = None
            entry = None

    if entry:
        file_name = str(entry.get("file", "")).strip()
        artifacts_root = Path(manifest["_artifacts_dir"])
        src_path = artifacts_root / file_name
        if not src_path.is_file():
            print(f"   ⚠️ Artifact file missing for '{artifact_id}': {src_path}")
            return {}

        dest_dir = lesson_dir / "artifacts"
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / Path(file_name).name
        if not dest_path.is_file() or src_path.stat().st_mtime > dest_path.stat().st_mtime:
            shutil.copy2(src_path, dest_path)

        artifact_image_url = f"artifacts/{dest_path.name}"
        artifact_caption = artifact_caption or entry.get("caption")
        if not artifact_source:
            page_ref = _page_ref_text(entry.get("page_ref"))
            artifact_source = f"Textbook {page_ref}" if page_ref else "Textbook reference"

    has_artifact = bool(artifact_image_url)
    if not has_artifact and not artifact_id:
        return {}

    fields: dict[str, Any] = {
        "visual_mode": _normalize_visual_mode(visual_mode, has_artifact=has_artifact),
    }
    if artifact_id:
        fields["artifact_id"] = artifact_id
    if artifact_image_url:
        fields["artifact_image_url"] = str(artifact_image_url)
    if artifact_caption:
        fields["artifact_caption"] = str(artifact_caption)
    if artifact_source:
        fields["artifact_source"] = str(artifact_source)
    return fields


def should_skip_sdxl_for_beat(visual_mode: str | None, *, has_artifact: bool) -> bool:
    """Pure artifact beats use a neutral scrim — no SDXL generation."""
    if not has_artifact:
        return False
    mode = (visual_mode or "artifact").strip().lower()
    return mode == "artifact"


def format_manifest_for_prompt(manifest: dict[str, Any] | None) -> str:
    """Compact catalog for storyboard LLM when artifacts are enabled."""
    if not manifest:
        return ""

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        return ""

    lines = [
        "TEXTBOOK REFERENCE IMAGES (use when a panel teaches from a diagram, map, chart, or photo):",
        "- Pick artifact_id ONLY from this approved list when visual_mode is \"artifact\" or \"hybrid\".",
        "- Prefer artifact beats on concept_card and math_step panels — NOT intro hooks or summary_badge unless the image is essential.",
        "- When visual_mode is \"artifact\", omit bg_prompt (a neutral background is used).",
        "- When visual_mode is \"hybrid\", include both artifact_id and a soft atmospheric bg_prompt.",
        "",
    ]
    for entry in artifacts:
        if not isinstance(entry, dict):
            continue
        if entry.get("approved") is False:
            continue
        artifact_id = entry.get("id", "")
        caption = entry.get("caption", "")
        hint = entry.get("panel_hint", "")
        topics = entry.get("topics") or []
        topic_text = ", ".join(str(t) for t in topics[:6])
        lines.append(f'  - artifact_id: "{artifact_id}" | caption: "{caption}"')
        if topic_text:
            lines.append(f"    topics: {topic_text}")
        if hint:
            lines.append(f"    when: {hint}")
    lines.append("")
    lines.append('Panel fields: "visual_mode": "artifact"|"hybrid"|"generated", "artifact_id": "<id from list>"')
    return "\n".join(lines)


def copy_artifact_assets_to_public(props: dict[str, Any], lesson_dir: Path, public_dir: Path) -> None:
    """Publish artifact images alongside backgrounds for Remotion staticFile()."""
    lesson_dir = Path(lesson_dir)
    public_dir = Path(public_dir)
    public_dir.mkdir(parents=True, exist_ok=True)

    for event in props.get("visual_events", []) or []:
        if not isinstance(event, dict):
            continue
        artifact_name = event.get("artifact_image_url")
        if not artifact_name:
            continue
        src = lesson_dir / Path(str(artifact_name))
        if not src.is_file():
            print(f"   ⚠️ Artifact asset missing for render: {src}")
            continue
        dest = public_dir / Path(str(artifact_name))
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
