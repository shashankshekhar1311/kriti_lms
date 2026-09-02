"""Unit tests for pdf_artifact_extractor helpers."""

from pdf_artifact_extractor import (
    _build_artifact_id,
    _heuristic_caption,
    _infer_artifact_type,
    _is_decorative,
    _slugify,
)


def test_slugify():
    assert _slugify("Maurya Empire — Map") == "maurya_empire_map"


def test_build_artifact_id_pattern():
    artifact_id = _build_artifact_id(6, 2, "India kingdoms map")
    assert artifact_id.startswith("p06_02_")
    assert all(ch.islower() or ch == "_" or ch.isdigit() for ch in artifact_id)


def test_is_decorative_filters_small_images():
    assert _is_decorative(80, 80, 20_000) is True
    assert _is_decorative(400, 300, 20_000) is False


def test_heuristic_caption_finds_figure_label():
    text = "The empire expanded. Figure 3: Kingdoms after Ashoka ruled large areas."
    caption = _heuristic_caption(text, 12, "embedded")
    assert "Figure 3" in caption


def test_infer_artifact_type_map():
    assert _infer_artifact_type("Political map of ancient India") == "map"
