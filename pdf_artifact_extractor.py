"""Phase 2: Auto-extract textbook images from chapter PDFs and build artifact manifests."""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from artifact_config import (
    ASSETS_CHAPTERS_DIR,
    resolve_subject_key,
)

try:
    import fitz  # pymupdf
except ImportError:
    fitz = None

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import json_repair
except ImportError:
    json_repair = None

try:
    import anthropic
except ImportError:
    anthropic = None

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    genai = None
    genai_types = None

MIN_IMAGE_WIDTH = 120
MIN_IMAGE_HEIGHT = 120
MIN_IMAGE_BYTES = 8_000
MAX_ARTIFACTS = 20
MAX_IMAGE_DIMENSION = 1600
PAGE_RENDER_DPI = 144
FIGURE_HINT = re.compile(r"\b(fig\.?|figure|map|diagram|chart|illustration|picture)\b", re.I)
TOPIC_PATTERN = re.compile(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b")


@dataclass
class ExtractedImage:
    page_num: int
    image_bytes: bytes
    width: int
    height: int
    ext: str
    source: str  # "embedded" | "page_render"


def _slugify(value: str) -> str:
    text = value.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


def curated_manifest_path(chapter_id: str) -> Path:
    return ASSETS_CHAPTERS_DIR / chapter_id / "artifacts" / "manifest.json"


def auto_manifest_path(chapter_output_dir: Path) -> Path:
    return Path(chapter_output_dir) / "artifacts" / "manifest.json"


def _parse_json_array(raw_text: str) -> list[Any]:
    text = (raw_text or "").strip()
    if not text:
        return []
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        if json_repair is None:
            raise
        parsed = json_repair.loads(text)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("artifacts", "captions", "items", "results"):
            value = parsed.get(key)
            if isinstance(value, list):
                return value
    return []


def _image_dimensions(image_bytes: bytes) -> tuple[int, int]:
    if Image is None:
        return 0, 0
    with Image.open(io.BytesIO(image_bytes)) as img:
        return img.size


def _is_decorative(width: int, height: int, byte_len: int) -> bool:
    if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
        return True
    if byte_len < MIN_IMAGE_BYTES:
        return True
    if width == 0 or height == 0:
        return True
    ratio = width / height
    if ratio > 12 or ratio < 1 / 12:
        return True
    return False


def _optimize_image_bytes(image_bytes: bytes, ext: str) -> tuple[bytes, str]:
    if Image is None:
        return image_bytes, ext if ext in {"png", "jpg", "jpeg", "webp"} else "png"

    with Image.open(io.BytesIO(image_bytes)) as img:
        img = img.convert("RGB")
        width, height = img.size
        longest = max(width, height)
        if longest > MAX_IMAGE_DIMENSION:
            scale = MAX_IMAGE_DIMENSION / longest
            img = img.resize(
                (max(1, int(width * scale)), max(1, int(height * scale))),
                Image.Resampling.LANCZOS,
            )

        out = io.BytesIO()
        img.save(out, format="WEBP", quality=82, method=4)
        return out.getvalue(), "webp"


def _page_text_snippet(doc: Any, page_num: int, max_chars: int = 600) -> str:
    if fitz is None:
        return ""
    page = doc[page_num - 1]
    text = page.get_text("text") or ""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def _extract_embedded_pymupdf(pdf_path: Path) -> list[ExtractedImage]:
    if fitz is None:
        return []

    results: list[ExtractedImage] = []
    seen_hashes: set[str] = set()

    with fitz.open(pdf_path) as doc:
        for page_index in range(len(doc)):
            page_num = page_index + 1
            page = doc[page_index]
            for img in page.get_images(full=True):
                xref = img[0]
                try:
                    extracted = doc.extract_image(xref)
                except Exception:
                    continue
                data = extracted.get("image")
                if not data:
                    continue
                digest = hashlib.md5(data).hexdigest()
                if digest in seen_hashes:
                    continue
                seen_hashes.add(digest)

                width = int(extracted.get("width") or 0)
                height = int(extracted.get("height") or 0)
                if width <= 0 or height <= 0:
                    width, height = _image_dimensions(data)
                if _is_decorative(width, height, len(data)):
                    continue

                ext = str(extracted.get("ext") or "png").lower()
                results.append(
                    ExtractedImage(
                        page_num=page_num,
                        image_bytes=data,
                        width=width,
                        height=height,
                        ext=ext,
                        source="embedded",
                    )
                )
    return results


def _extract_embedded_pypdf(pdf_path: Path) -> list[ExtractedImage]:
    if PdfReader is None:
        return []

    results: list[ExtractedImage] = []
    seen_hashes: set[str] = set()
    reader = PdfReader(str(pdf_path))

    for page_index, page in enumerate(reader.pages, start=1):
        for image in page.images:
            data = image.data
            digest = hashlib.md5(data).hexdigest()
            if digest in seen_hashes:
                continue
            seen_hashes.add(digest)

            width, height = _image_dimensions(data)
            if _is_decorative(width, height, len(data)):
                continue

            name = str(getattr(image, "name", "image.png"))
            ext = Path(name).suffix.lstrip(".").lower() or "png"
            results.append(
                ExtractedImage(
                    page_num=page_index,
                    image_bytes=data,
                    width=width,
                    height=height,
                    ext=ext,
                    source="embedded",
                )
            )
    return results


def _render_figure_pages_pymupdf(pdf_path: Path, existing_pages: set[int]) -> list[ExtractedImage]:
    if fitz is None:
        return []

    rendered: list[ExtractedImage] = []
    with fitz.open(pdf_path) as doc:
        for page_index in range(len(doc)):
            page_num = page_index + 1
            if page_num in existing_pages:
                continue
            page = doc[page_index]
            page_text = page.get_text("text") or ""
            if not FIGURE_HINT.search(page_text):
                continue

            matrix = fitz.Matrix(PAGE_RENDER_DPI / 72, PAGE_RENDER_DPI / 72)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            data = pix.tobytes("png")
            if _is_decorative(pix.width, pix.height, len(data)):
                continue

            rendered.append(
                ExtractedImage(
                    page_num=page_num,
                    image_bytes=data,
                    width=pix.width,
                    height=pix.height,
                    ext="png",
                    source="page_render",
                )
            )
    return rendered


def extract_images_from_pdf(pdf_path: Path) -> list[ExtractedImage]:
    pdf_path = Path(pdf_path)
    embedded = _extract_embedded_pymupdf(pdf_path)
    if not embedded:
        embedded = _extract_embedded_pypdf(pdf_path)

    pages_with_images = {img.page_num for img in embedded}
    rendered = _render_figure_pages_pymupdf(pdf_path, pages_with_images)

    combined = embedded + rendered
    combined.sort(key=lambda item: (-item.width * item.height, item.page_num))
    return combined[:MAX_ARTIFACTS]


def _infer_artifact_type(caption: str) -> str:
    lower = caption.lower()
    if "map" in lower:
        return "map"
    if any(token in lower for token in ("chart", "graph", "table")):
        return "chart"
    if any(token in lower for token in ("photo", "photograph", "portrait")):
        return "photo"
    if "inscription" in lower:
        return "inscription"
    if any(token in lower for token in ("diagram", "figure", "illustration")):
        return "diagram"
    return "other"


def _topics_from_text(text: str, max_topics: int = 6) -> list[str]:
    candidates = TOPIC_PATTERN.findall(text or "")
    seen: set[str] = set()
    topics: list[str] = []
    for candidate in candidates:
        token = candidate.strip()
        if len(token) < 4 or token.lower() in {"chapter", "figure", "textbook"}:
            continue
        key = token.lower()
        if key in seen:
            continue
        seen.add(key)
        topics.append(token)
        if len(topics) >= max_topics:
            break
    return topics


def _heuristic_caption(page_text: str, page_num: int, source: str) -> str:
    text = re.sub(r"\s+", " ", page_text or "").strip()
    fig_match = re.search(
        r"(Fig(?:ure)?\.?\s*\d+[:\.]?\s*[^.!?]{8,120})",
        text,
        flags=re.IGNORECASE,
    )
    if fig_match:
        return fig_match.group(1).strip()[:120]

    if FIGURE_HINT.search(text):
        snippet = text[:160].strip()
        if snippet:
            return snippet

    label = "Textbook page" if source == "page_render" else "Textbook illustration"
    return f"{label} (page {page_num})"


def _build_artifact_id(page_num: int, index: int, caption: str) -> str:
    slug = _slugify(caption)[:28] or "figure"
    artifact_id = f"p{page_num:02d}_{index:02d}_{slug}"
    artifact_id = re.sub(r"_+", "_", artifact_id).strip("_")
    return artifact_id[:48]


def _caption_with_llm(
    entries: list[dict[str, Any]],
    provider: str,
) -> dict[str, str]:
    if not entries:
        return {}

    provider = (provider or "anthropic").lower()
    prompt = (
        "You are labeling textbook images for an educational video pipeline.\n"
        "For each item, write a short student-friendly caption (max 100 chars).\n"
        "Return ONLY a JSON array of objects: "
        '[{"key":"<key>","caption":"<caption>"}]\n\n'
        f"ITEMS:\n{json.dumps(entries, ensure_ascii=False)}"
    )

    raw = ""
    try:
        if provider == "anthropic" and anthropic is not None:
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                return {}
            client = anthropic.Anthropic(api_key=api_key)
            res = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = res.content[0].text
        elif provider == "gemini" and genai is not None:
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                return {}
            client = genai.Client(api_key=api_key)
            res = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[prompt],
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                    max_output_tokens=2048,
                ),
            )
            raw = res.text
    except Exception as exc:
        print(f"   ⚠️ Artifact caption LLM failed: {exc}")
        return {}

    captions: dict[str, str] = {}
    for item in _parse_json_array(raw):
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip()
        caption = str(item.get("caption", "")).strip()
        if key and caption:
            captions[key] = caption[:120]
    return captions


def build_manifest_from_images(
    images: list[ExtractedImage],
    *,
    chapter_id: str,
    subject_key: str,
    class_name: str,
    chapter_title: str,
    page_texts: dict[int, str],
    provider: str = "anthropic",
    use_llm_captions: bool = True,
) -> dict[str, Any]:
    llm_batch: list[dict[str, Any]] = []
    staged: list[dict[str, Any]] = []

    for index, image in enumerate(images, start=1):
        page_text = page_texts.get(image.page_num, "")
        caption = _heuristic_caption(page_text, image.page_num, image.source)
        artifact_id = _build_artifact_id(image.page_num, index, caption)
        key = f"{image.page_num}:{index}"
        staged.append(
            {
                "key": key,
                "artifact_id": artifact_id,
                "image": image,
                "caption": caption,
                "page_text": page_text,
            }
        )
        if use_llm_captions:
            llm_batch.append(
                {
                    "key": key,
                    "page": image.page_num,
                    "page_text": page_text[:500],
                    "heuristic_caption": caption,
                }
            )

    llm_captions = _caption_with_llm(llm_batch, provider) if use_llm_captions else {}
    artifacts: list[dict[str, Any]] = []

    for index, item in enumerate(staged, start=1):
        image: ExtractedImage = item["image"]
        caption = llm_captions.get(item["key"], item["caption"])
        artifact_id = _build_artifact_id(image.page_num, index, caption)
        optimized_bytes, ext = _optimize_image_bytes(image.image_bytes, image.ext)
        file_name = f"{artifact_id}.{ext}"
        page_text = item["page_text"]
        topics = _topics_from_text(page_text)

        artifacts.append(
            {
                "id": artifact_id,
                "file": file_name,
                "_bytes": optimized_bytes,
                "type": _infer_artifact_type(caption),
                "caption": caption,
                "page_ref": image.page_num,
                "topics": topics,
                "panel_hint": (
                    f"Use when narration covers content on textbook page {image.page_num}"
                ),
                "approved": True,
            }
        )

    return {
        "chapter_id": chapter_id,
        "subject": subject_key,
        "class_name": class_name,
        "chapter_title": chapter_title,
        "artifacts": artifacts,
    }


def _collect_page_texts(pdf_path: Path) -> dict[int, str]:
    texts: dict[int, str] = {}
    if fitz is not None:
        with fitz.open(pdf_path) as doc:
            for page_index in range(len(doc)):
                page_num = page_index + 1
                texts[page_num] = _page_text_snippet(doc, page_num)
        return texts

    if PdfReader is None:
        return texts

    reader = PdfReader(str(pdf_path))
    for page_index, page in enumerate(reader.pages, start=1):
        extracted = page.extract_text() or ""
        texts[page_index] = re.sub(r"\s+", " ", extracted).strip()[:600]
    return texts


def write_manifest(manifest: dict[str, Any], artifacts_dir: Path) -> Path:
    artifacts_dir = Path(artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    serializable = dict(manifest)
    artifact_rows = []
    for entry in serializable.get("artifacts", []):
        if not isinstance(entry, dict):
            continue
        row = {key: value for key, value in entry.items() if not key.startswith("_")}
        bytes_payload = entry.get("_bytes")
        if bytes_payload:
            dest = artifacts_dir / row["file"]
            dest.write_bytes(bytes_payload)
        artifact_rows.append(row)

    serializable["artifacts"] = artifact_rows
    manifest_path = artifacts_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(serializable, handle, indent=2, ensure_ascii=False)
    return manifest_path


def ensure_chapter_artifacts_from_pdf(
    pdf_path: Path,
    chapter_id: str,
    *,
    class_name: str,
    subject_name: str,
    chapter_name: str,
    chapter_output_dir: Path,
    force: bool = False,
    provider: str = "anthropic",
    use_llm_captions: bool = True,
) -> Path | None:
    """Extract PDF images into chapter_output_dir/artifacts when no curated manifest exists."""
    pdf_path = Path(pdf_path)
    chapter_output_dir = Path(chapter_output_dir)

    if curated_manifest_path(chapter_id).is_file():
        print(f"   🖼️ Curated artifact manifest found in assets/ — skipping auto-extract.")
        return curated_manifest_path(chapter_id)

    out_manifest = auto_manifest_path(chapter_output_dir)
    if out_manifest.is_file() and not force:
        print(f"   🖼️ Using cached auto-extracted manifest: {out_manifest}")
        return out_manifest

    if force and out_manifest.parent.is_dir():
        shutil.rmtree(out_manifest.parent)
        out_manifest.parent.mkdir(parents=True, exist_ok=True)

    if fitz is None and PdfReader is None:
        print("   ⚠️ Auto-extract skipped: install pymupdf or pypdf to read PDF images.")
        return None

    print(f"   📷 Phase 2: Extracting textbook images from {pdf_path.name}...")
    images = extract_images_from_pdf(pdf_path)
    if not images:
        print("   ℹ️ No suitable images found in PDF — continuing with SDXL backgrounds only.")
        return None

    subject_key = resolve_subject_key(subject_name) or "other"
    page_texts = _collect_page_texts(pdf_path)
    manifest = build_manifest_from_images(
        images,
        chapter_id=chapter_id,
        subject_key=subject_key,
        class_name=class_name,
        chapter_title=chapter_name,
        page_texts=page_texts,
        provider=provider,
        use_llm_captions=use_llm_captions,
    )

    manifest_path = write_manifest(manifest, out_manifest.parent)
    print(
        f"   ✅ Auto-extracted {len(manifest.get('artifacts', []))} textbook image(s) → "
        f"{manifest_path}"
    )
    return manifest_path
