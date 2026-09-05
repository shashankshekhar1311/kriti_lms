"""Centralized runtime path and cache resolution for Kriti LMS.

Backward compatible: when KRITI_* / cache env vars are unset, paths match the
historical layout next to the repository root (``Source_Books``, ``Rendered_Output``,
``temp``, ``models``). Cache homes (HF / Torch / rembg) are left to library
defaults unless explicitly set.

Do not hardcode host-specific roots such as ``/workspace`` here — pass them via
environment variables (see ``.env.example`` and ``docs/RUNPOD.md``).
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional until requirements are installed
    def load_dotenv(*_args, **_kwargs):  # type: ignore[misc]
        return False

# Repository root (parent of config/)
REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / ".env"

_bootstrapped = False


def _env_path(name: str, default: Path) -> Path:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default.resolve()
    return Path(raw).expanduser().resolve()


def _optional_env_path(name: str) -> Path | None:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return None
    return Path(raw).expanduser().resolve()


def bootstrap_runtime_paths(*, create_dirs: bool = True) -> None:
    """Load ``.env``, resolve paths, optionally create directories, apply process env.

    Safe to call multiple times. Idempotent.
    """
    global _bootstrapped
    global SOURCE_BOOKS_DIR, RENDERED_OUTPUT_DIR, TEMP_DIR, MODELS_DIR
    global HF_HOME_DIR, TORCH_HOME_DIR, U2NET_HOME_DIR
    global ASSETS_DIR, REMOTION_DIR, REMOTION_PUBLIC_DIR

    load_dotenv(dotenv_path=ENV_PATH)

    SOURCE_BOOKS_DIR = _env_path("KRITI_SOURCE_BOOKS", REPO_ROOT / "Source_Books")
    RENDERED_OUTPUT_DIR = _env_path("KRITI_OUTPUT_DIR", REPO_ROOT / "Rendered_Output")
    TEMP_DIR = _env_path("KRITI_TEMP_DIR", REPO_ROOT / "temp")
    MODELS_DIR = _env_path("LIP_SYNC_MODELS_DIR", REPO_ROOT / "models")

    HF_HOME_DIR = _optional_env_path("HF_HOME")
    TORCH_HOME_DIR = _optional_env_path("TORCH_HOME")
    U2NET_HOME_DIR = _optional_env_path("U2NET_HOME")

    ASSETS_DIR = REPO_ROOT / "assets" / "mascots"
    REMOTION_DIR = REPO_ROOT / "remotion"
    REMOTION_PUBLIC_DIR = REMOTION_DIR / "public"

    # Process-wide temp for stdlib + child tools
    os.environ["TEMP"] = str(TEMP_DIR)
    os.environ["TMP"] = str(TEMP_DIR)
    tempfile.tempdir = str(TEMP_DIR)

    # Propagate explicit cache homes so Hugging Face / Torch / rembg see them
    if HF_HOME_DIR is not None:
        os.environ["HF_HOME"] = str(HF_HOME_DIR)
    if TORCH_HOME_DIR is not None:
        os.environ["TORCH_HOME"] = str(TORCH_HOME_DIR)
    if U2NET_HOME_DIR is not None:
        os.environ["U2NET_HOME"] = str(U2NET_HOME_DIR)

    # Keep lip-sync model root visible to lip_sync_service and subprocesses
    os.environ["LIP_SYNC_MODELS_DIR"] = str(MODELS_DIR)

    if create_dirs:
        ensure_runtime_directories()

    _bootstrapped = True


def ensure_runtime_directories() -> None:
    """Create required runtime directories if missing. Never deletes data."""
    required = [
        SOURCE_BOOKS_DIR,
        RENDERED_OUTPUT_DIR,
        TEMP_DIR,
        MODELS_DIR,
    ]
    for path in required:
        path.mkdir(parents=True, exist_ok=True)

    for optional in (HF_HOME_DIR, TORCH_HOME_DIR, U2NET_HOME_DIR):
        if optional is not None:
            optional.mkdir(parents=True, exist_ok=True)


def resolved_paths_summary() -> dict[str, str | None]:
    """Return a JSON-serializable snapshot of resolved paths (for diagnostics)."""
    if not _bootstrapped:
        bootstrap_runtime_paths(create_dirs=False)
    return {
        "REPO_ROOT": str(REPO_ROOT),
        "KRITI_SOURCE_BOOKS": str(SOURCE_BOOKS_DIR),
        "KRITI_OUTPUT_DIR": str(RENDERED_OUTPUT_DIR),
        "KRITI_TEMP_DIR": str(TEMP_DIR),
        "LIP_SYNC_MODELS_DIR": str(MODELS_DIR),
        "HF_HOME": str(HF_HOME_DIR) if HF_HOME_DIR else None,
        "TORCH_HOME": str(TORCH_HOME_DIR) if TORCH_HOME_DIR else None,
        "U2NET_HOME": str(U2NET_HOME_DIR) if U2NET_HOME_DIR else None,
        "ASSETS_DIR": str(ASSETS_DIR),
        "REMOTION_DIR": str(REMOTION_DIR),
    }


# Module-level defaults (overwritten by bootstrap_runtime_paths)
SOURCE_BOOKS_DIR = REPO_ROOT / "Source_Books"
RENDERED_OUTPUT_DIR = REPO_ROOT / "Rendered_Output"
TEMP_DIR = REPO_ROOT / "temp"
MODELS_DIR = REPO_ROOT / "models"
HF_HOME_DIR: Path | None = None
TORCH_HOME_DIR: Path | None = None
U2NET_HOME_DIR: Path | None = None
ASSETS_DIR = REPO_ROOT / "assets" / "mascots"
REMOTION_DIR = REPO_ROOT / "remotion"
REMOTION_PUBLIC_DIR = REMOTION_DIR / "public"

# Eager bootstrap so ``from config.paths import SOURCE_BOOKS_DIR`` is correct
# after import, including when lip_sync_service loads before Chapter_Agent wiring.
bootstrap_runtime_paths(create_dirs=True)
