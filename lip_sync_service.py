"""Local GPU lip-sync for talking mascots (Colab-friendly, $0 API cost).

Primary engine (CUDA)
    Wav2Lip (default) or LivePortrait on ``cuda:0`` via PyTorch.
    Repos and checkpoints are auto-cloned / downloaded under ``models/``.

Fallback (CPU / no GPU)
    MoviePy (preferred) or FFmpeg: static mascot with a subtle sine-wave
    scale bounce timed to the audio, exported as H.264 MP4.

No Hedra / Replicate / paid SaaS keys are used.

# CHANGED (transparency + GPU-honesty pass):
# 1. Every stage that used to bake a solid slate background (#0F172A) into
#    the mascot frame now bakes a pure chroma-key green instead. A new final
#    step, `_finalize_alpha_video`, keys that green out and encodes a real
#    alpha-channel WebM (VP9). This is the actual fix for the mascot showing
#    up inside a visible hard-edged box: H.264 MP4 has no alpha channel, so
#    no amount of CSS `background: transparent` around it could ever have
#    worked. Every code path (Wav2Lip, LivePortrait, CPU bounce fallback)
#    now goes through the same finalize step, so all of them end up
#    genuinely transparent, not just the "happy path".
# 2. New `LIP_SYNC_REQUIRE_GPU` env flag. When set truthy, a missing/failed
#    GPU now raises loudly instead of silently producing a frozen CPU-bounce
#    clip that *looks* finished but has zero lip movement. This is what
#    actually happened in the sample renders you shared — CUDA wasn't
#    available, so it fell back invisibly.
# 3. Every successful/failed generation writes a small `<clip>.status.json`
#    sidecar (engine used, cuda_available, whether it hit the fallback) so a
#    silently-degraded render is auditable after the fact, not just visible
#    in scrollback logs you may not have kept.
# 4. Renamed `_is_valid_mp4` -> `_is_valid_video` since the deliverable is
#    now WebM, not MP4 (ffprobe codec check works on either container).
"""

from __future__ import annotations

import json
import logging
import math
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Optional, Sequence
from urllib.error import URLError

# ------------------------------------------------------------------------------
# Environment
# ------------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

MODELS_DIR = Path(os.getenv("LIP_SYNC_MODELS_DIR", str(BASE_DIR / "models"))).resolve()
WAV2LIP_DIR = Path(os.getenv("WAV2LIP_ROOT", str(MODELS_DIR / "Wav2Lip"))).resolve()
LIVEPORTRAIT_DIR = Path(os.getenv("LIVEPORTRAIT_ROOT", str(MODELS_DIR / "LivePortrait"))).resolve()

WAV2LIP_REPO = os.getenv("WAV2LIP_REPO", "https://github.com/Rudrabha/Wav2Lip.git")
LIVEPORTRAIT_REPO = os.getenv(
    "LIVEPORTRAIT_REPO", "https://github.com/KwaiVGI/LivePortrait.git"
)

# Public mirrors commonly used in Colab notebooks (no API key).
WAV2LIP_CKPT_URLS = [
    "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/wav2lip_gan.pth",
    "https://huggingface.co/numz/wav2lip_studio/resolve/main/Wav2lip/wav2lip_gan.pth",
]
S3FD_URLS = [
    "https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth",
    "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/s3fd.pth",
]

logger = logging.getLogger("lip_sync_service")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] lip_sync: %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

FALLBACK_FPS = 25
FALLBACK_SIZE = 720
BOUNCE_HZ = 2.2
BOUNCE_AMP = 0.04

# CHANGED: this used to be CANVAS_BG = (15, 23, 42) (slate) baked directly
# into every rasterized/fallback frame. Slate is close-but-not-identical to
# the real gradient background behind it in Remotion, which is exactly what
# produced the visible seam/box. It's now a pure chroma-key green, keyed out
# in `_finalize_alpha_video` before the clip ever reaches Remotion.
CHROMA_KEY_RGB = (0, 255, 0)
CHROMA_KEY_HEX = "#00FF00"

RASTER_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
PHOTO_AVATAR_NAMES = ("real_avatar.jpg", "real_avatar.png", "real_avatar.jpeg")
LIP_SYNC_MODES = ("cartoon_svg", "wav2lip")
POSE_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".svg")
VALID_POSES = ("neutral", "talking", "pointing", "happy")
POSE_FALLBACK_CHAIN = {
    "neutral": ("neutral", "talking"),
    "talking": ("talking", "neutral"),
    "pointing": ("pointing", "talking", "neutral"),
    "happy": ("happy", "talking", "neutral"),
}
MASCOT_ASSETS_DIR = BASE_DIR / "assets" / "mascots"
GPU_INFERENCE_TIMEOUT_S = int(os.getenv("LIP_SYNC_GPU_TIMEOUT", "900"))
PREFERRED_ENGINE = (os.getenv("LIP_SYNC_ENGINE") or "wav2lip").strip().lower()

# CHANGED: new flag. Set LIP_SYNC_REQUIRE_GPU=1 to make a missing/failed GPU
# a hard error instead of a silent, motionless CPU-bounce render.
REQUIRE_GPU = (os.getenv("LIP_SYNC_REQUIRE_GPU", "") or "").strip().lower() in {"1", "true", "yes"}


# ------------------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------------------
def has_photographic_real_avatar(mascot_dir: Path) -> bool:
    """Return True when a ``real_avatar.*`` file exists in the mascot folder."""
    mascot_dir = Path(mascot_dir)
    return any((mascot_dir / name).is_file() for name in PHOTO_AVATAR_NAMES)


def resolve_lip_sync_mode(
    mascot_dir: Path,
    *,
    force_presenter: bool = False,
) -> str:
    """Choose lip-sync engine for a mascot lesson.

    Default is ``cartoon_svg`` (Remotion SVG mouth-swap). ``wav2lip`` is only
    returned when a photographic ``real_avatar.*`` exists **and** presenter
    mode is explicitly requested (``force_presenter=True`` or
    ``LIP_SYNC_PRESENTER_MODE=1``).
    """
    if force_presenter and has_photographic_real_avatar(mascot_dir):
        return "wav2lip"
    return "cartoon_svg"


def resolve_mascot_dir(
    mascot_name: Optional[str] = None,
    hint: Optional[Path] = None,
) -> Path:
    """Locate ``assets/mascots/{mascot_name}/`` (or a caller-supplied folder)."""
    candidates: list[Path] = []
    if hint is not None:
        hint_path = Path(hint)
        candidates.append(hint_path if hint_path.is_dir() else hint_path.parent)
    if mascot_name:
        candidates.append(MASCOT_ASSETS_DIR / str(mascot_name).strip().lower())
    candidates.append(MASCOT_ASSETS_DIR / "gyanu")
    for folder in candidates:
        if folder.is_dir():
            return folder
    raise FileNotFoundError(
        f"Mascot pose directory not found. Looked in: {', '.join(str(c) for c in candidates)}"
    )


def resolve_pose_image(
    mascot_image_path: Optional[Path] = None,
    pose_type: str = "talking",
    mascot_name: Optional[str] = None,
    *,
    prefer_photographic_avatar: bool = False,
) -> Path:
    """Pick the best face source from the mascot asset directory.

    Priority when ``prefer_photographic_avatar`` is True (Wav2Lip presenter mode):
        1. ``real_avatar.jpg`` / ``real_avatar.png`` (photographic avatar)
        2. Pose stills: ``{pose}.png``, ``.jpg``, ``.jpeg``, ``.webp``, then ``.svg``
        3. Explicit ``mascot_image_path`` file hint

    Cartoon mode (default) skips ``real_avatar.*`` and uses pose SVGs only.
    Missing poses fall back (pointing/happy -> talking -> neutral).
    """
    pose = str(pose_type or "talking").strip().lower()
    if pose not in VALID_POSES:
        logger.warning("Unknown pose_type %r; using 'talking'", pose_type)
        pose = "talking"

    hint = Path(mascot_image_path) if mascot_image_path else None
    if hint is not None and not mascot_name and hint.exists():
        mascot_name = hint.name if hint.is_dir() else hint.parent.name

    mascot_dir = resolve_mascot_dir(mascot_name=mascot_name, hint=hint)

    if prefer_photographic_avatar:
        for avatar_name in PHOTO_AVATAR_NAMES:
            photo = mascot_dir / avatar_name
            if photo.is_file():
                logger.info("Photographic real avatar -> %s (pose=%s skipped)", photo.name, pose)
                return photo

    chain: Sequence[str] = POSE_FALLBACK_CHAIN.get(pose, ("talking", "neutral"))
    for name in chain:
        for ext in POSE_IMAGE_EXTS:
            candidate = mascot_dir / f"{name}{ext}"
            if candidate.is_file():
                if name != pose:
                    logger.info("Pose '%s' missing in %s; using %s", pose, mascot_dir, candidate.name)
                else:
                    logger.info("Pose '%s' -> %s", pose, candidate)
                return candidate

    if hint is not None and hint.is_file():
        logger.info("No pose file for '%s'; using provided image %s", pose, hint.name)
        return hint

    raise FileNotFoundError(
        f"No pose image for '{pose}' in {mascot_dir} "
        f"(expected real_avatar.jpg/png or one of {', '.join(f'{p}.png' for p in VALID_POSES)})"
    )


def generate_talking_mascot(
    mascot_image_path: Path,
    audio_mp3_path: Path,
    output_video_path: Path,
    pose_type: str = "talking",
    mascot_name: Optional[str] = None,
) -> Path:
    """Build a talking-mascot clip from a pose still and TTS audio.

    ``output_video_path`` should end in ``.webm`` — the deliverable now
    carries a real alpha channel (VP9). Passing a ``.mp4`` path still works
    mechanically but you will get an opaque chroma-green rectangle instead
    of transparency, since MP4/H.264 cannot hold alpha.

    On CUDA, runs local Wav2Lip (or LivePortrait) against a chroma-keyed
    source frame, then keys the flat background back out into real alpha.
    Without a GPU, falls back to a MoviePy/FFmpeg sine-wave bounce of the
    same chroma-keyed still — unless ``LIP_SYNC_REQUIRE_GPU`` is set, in
    which case a missing/failing GPU raises instead of silently degrading.
    """
    mascot_image_path = Path(mascot_image_path)
    audio_mp3_path = Path(audio_mp3_path)
    output_video_path = Path(output_video_path)
    status: dict = {"engine": None, "cuda_available": False, "used_fallback": False}

    pose_image = resolve_pose_image(
        mascot_image_path=mascot_image_path,
        pose_type=pose_type,
        mascot_name=mascot_name,
        prefer_photographic_avatar=True,
    )
    if not audio_mp3_path.is_file():
        raise FileNotFoundError(f"TTS audio not found: {audio_mp3_path}")

    output_video_path.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Lip-sync pose=%s image=%s", pose_type, pose_image.name)
    # `bounce_path` is now rasterized against CHROMA_KEY, not slate.
    bounce_path = _ensure_raster_image(pose_image)

    cuda_ok = _cuda_available()
    status["cuda_available"] = cuda_ok

    if not cuda_ok and REQUIRE_GPU:
        _write_status_sidecar(output_video_path, status | {"error": "CUDA unavailable and LIP_SYNC_REQUIRE_GPU is set"})
        raise RuntimeError(
            "LIP_SYNC_REQUIRE_GPU is set but no CUDA device is available. "
            "Refusing to silently fall back to the motionless CPU bounce. "
            "Enable a GPU accelerator for this session, or unset LIP_SYNC_REQUIRE_GPU."
        )

    raw_opaque_path: Optional[Path] = None
    try:
        if cuda_ok:
            engines = _gpu_engine_order()
            for name in engines:
                try:
                    logger.info("GPU engine: %s on cuda:0", name)
                    face_source = _prepare_face_frame(pose_image, engine=name)
                    tmp_raw = Path(tempfile.mktemp(suffix=".mp4", dir=str(TEMP_DIR)))
                    if name == "wav2lip":
                        result = _generate_via_wav2lip(face_source, audio_mp3_path, tmp_raw)
                    elif name == "liveportrait":
                        result = _generate_via_liveportrait(face_source, audio_mp3_path, tmp_raw)
                    else:
                        continue
                    if _is_valid_video(result):
                        logger.info("%s succeeded -> %s", name, result)
                        raw_opaque_path = result
                        status["engine"] = name
                        break
                    logger.warning("%s produced an invalid clip; trying next engine", name)
                except Exception as exc:
                    logger.warning("%s failed: %s", name, exc)
            if raw_opaque_path is None:
                if REQUIRE_GPU:
                    _write_status_sidecar(output_video_path, status | {"error": "all GPU engines failed"})
                    raise RuntimeError(
                        "LIP_SYNC_REQUIRE_GPU is set and every GPU engine failed. "
                        "Refusing to fall back to the CPU bounce. Check the engine logs above."
                    )
                logger.warning("All GPU engines failed; falling back to CPU bounce")

        if raw_opaque_path is None:
            if not cuda_ok:
                logger.info("CUDA unavailable (torch.cuda.is_available()=False); using CPU bounce")
            raw_opaque_path = Path(tempfile.mktemp(suffix=".mp4", dir=str(TEMP_DIR)))
            _generate_local_fallback(bounce_path, audio_mp3_path, raw_opaque_path)
            status["engine"] = "cpu_bounce"
            status["used_fallback"] = True

        # CHANGED: unconditional final step for every engine — key the flat
        # chroma background out and encode real alpha, so transparency is
        # never engine-dependent.
        _finalize_alpha_video(raw_opaque_path, output_video_path)
        if not _is_valid_video(output_video_path):
            raise RuntimeError(f"Alpha finalize step did not produce a valid clip at {output_video_path}")

        _write_status_sidecar(output_video_path, status)
        return output_video_path
    finally:
        if raw_opaque_path is not None and raw_opaque_path.exists() and raw_opaque_path != output_video_path:
            try:
                raw_opaque_path.unlink()
            except OSError:
                pass


def _write_status_sidecar(video_path: Path, status: dict) -> None:
    sidecar = video_path.with_suffix(video_path.suffix + ".status.json")
    try:
        sidecar.write_text(json.dumps(status, indent=2), encoding="utf-8")
    except OSError:
        pass


# ------------------------------------------------------------------------------
# CUDA / device
# ------------------------------------------------------------------------------
def _cuda_available() -> bool:
    try:
        import torch
    except ImportError:
        logger.info("PyTorch not installed; GPU lip-sync disabled")
        return False

    ok = bool(torch.cuda.is_available())
    if ok:
        try:
            name = torch.cuda.get_device_name(0)
            logger.info("CUDA ready: device=cuda:0 name=%s", name)
        except Exception:
            logger.info("CUDA ready: device=cuda:0")
    return ok


def _gpu_engine_order() -> list[str]:
    if PREFERRED_ENGINE == "liveportrait":
        return ["liveportrait", "wav2lip"]
    if PREFERRED_ENGINE == "wav2lip":
        return ["wav2lip", "liveportrait"]
    return ["wav2lip", "liveportrait"]


# ------------------------------------------------------------------------------
# Wav2Lip (primary GPU)
# ------------------------------------------------------------------------------
def _generate_via_wav2lip(image_path: Path, audio_path: Path, output_path: Path) -> Path:
    root = _ensure_wav2lip_repo()
    ckpt = _ensure_wav2lip_checkpoint(root)
    _ensure_s3fd_weights(root)
    _ensure_mobilenet_weights(root)

    work = Path(tempfile.mkdtemp(prefix="wav2lip_", dir=str(TEMP_DIR)))
    try:
        raw_out = work / "result_raw.mp4"
        cmd = [
            sys.executable,
            str(root / "inference.py"),
            "--checkpoint_path", str(ckpt),
            "--face", str(image_path.resolve()),
            "--audio", str(audio_path.resolve()),
            "--outfile", str(raw_out),
            "--fps", str(FALLBACK_FPS),
            "--pads", "0", "20", "0", "0",
            "--resize_factor", "1",
            "--wav2lip_batch_size", "64"
        ]
        logger.info("Wav2Lip inference: %s", " ".join(cmd[:6]) + " ...")
        env = os.environ.copy()
        env["CUDA_VISIBLE_DEVICES"] = env.get("CUDA_VISIBLE_DEVICES", "0")
        env["PYTORCH_CUDA_ALLOC_CONF"] = env.get("PYTORCH_CUDA_ALLOC_CONF", "max_split_size_mb:128")

        proc = subprocess.run(
            cmd,
            cwd=str(root),
            env=env,
            capture_output=True,
            text=True,
            timeout=GPU_INFERENCE_TIMEOUT_S,
        )
        if proc.returncode != 0 or not raw_out.is_file():
            tail = ((proc.stderr or "") + "\n" + (proc.stdout or ""))[-1200:]
            raise RuntimeError(f"Wav2Lip inference failed (code={proc.returncode}):\n{tail}")

        return _remux_h264(raw_out, audio_path, output_path)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _ensure_wav2lip_repo() -> Path:
    inference = WAV2LIP_DIR / "inference.py"
    if inference.is_file():
        logger.info("Using Wav2Lip at %s", WAV2LIP_DIR)
        return WAV2LIP_DIR

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if WAV2LIP_DIR.exists():
        shutil.rmtree(WAV2LIP_DIR, ignore_errors=True)

    logger.info("Cloning Wav2Lip -> %s", WAV2LIP_DIR)
    proc = subprocess.run(
        ["git", "clone", "--depth", "1", WAV2LIP_REPO, str(WAV2LIP_DIR)],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if proc.returncode != 0 or not inference.is_file():
        raise RuntimeError(
            f"Failed to clone Wav2Lip: {(proc.stderr or proc.stdout or '')[-500:]}"
        )
    return WAV2LIP_DIR


def _ensure_wav2lip_checkpoint(root: Path) -> Path:
    ckpt_dir = root / "checkpoints"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    for name in ("wav2lip_gan.pth", "wav2lip.pth"):
        candidate = ckpt_dir / name
        if candidate.is_file() and candidate.stat().st_size > 1_000_000:
            return candidate

    dest = ckpt_dir / "wav2lip_gan.pth"
    logger.info("Downloading Wav2Lip checkpoint -> %s", dest)
    _download_first_ok(WAV2LIP_CKPT_URLS, dest, min_bytes=1_000_000)
    return dest

MOBILENET_CKPT_URLS = [
    "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/mobilenet.pth",
]

def _ensure_mobilenet_weights(root: Path) -> Path:
    dest = root / "checkpoints" / "mobilenet.pth"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size > 100_000:
        return dest
    logger.info("Downloading batch_face RetinaFace mobilenet checkpoint -> %s", dest)
    _download_first_ok(MOBILENET_CKPT_URLS, dest, min_bytes=100_000)
    return dest

def _ensure_s3fd_weights(root: Path) -> Path:
    dest = root / "face_detection" / "detection" / "sfd" / "s3fd.pth"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size > 1_000_000:
        return dest
    logger.info("Downloading S3FD face detector -> %s", dest)
    _download_first_ok(S3FD_URLS, dest, min_bytes=1_000_000)
    return dest


# ------------------------------------------------------------------------------
# LivePortrait (optional GPU)
# ------------------------------------------------------------------------------
def _generate_via_liveportrait(image_path: Path, audio_path: Path, output_path: Path) -> Path:
    """Best-effort LivePortrait path for Colab installs.

    Official LivePortrait is driving-video based. This adapter looks for a
    Colab-friendly audio entrypoint (``inference_audio.py`` / ``app_audio.py``)
    or an installed ``liveportrait`` CLI. If none exist, raises so Wav2Lip /
    bounce can take over. Expects a normalized JPG/PNG face frame (see
    ``_prepare_face_frame``).
    """
    root = _ensure_liveportrait_repo()
    work = Path(tempfile.mkdtemp(prefix="liveportrait_", dir=str(TEMP_DIR)))
    try:
        raw_out = work / "result_raw.mp4"
        script = _find_liveportrait_audio_script(root)
        if script is None:
            raise RuntimeError(
                "LivePortrait audio entrypoint not found. "
                "Install a fork with inference_audio.py, or set LIP_SYNC_ENGINE=wav2lip."
            )

        source_str = str(image_path.resolve())
        cmd = [
            sys.executable,
            str(script),
            "--source", source_str,
            "--audio", str(audio_path.resolve()),
            "--output", str(raw_out),
            "--device", "cuda:0",
        ]
        alt_cmds = [
            cmd,
            [
                sys.executable, str(script),
                "--source_image", source_str,
                "--driving_audio", str(audio_path.resolve()),
                "--output", str(raw_out),
                "--device", "cuda:0",
                "--device_id", "0",
            ],
        ]

        last_err = ""
        for attempt in alt_cmds:
            logger.info("LivePortrait inference: %s", " ".join(attempt[:5]) + " ...")
            env = os.environ.copy()
            env["CUDA_VISIBLE_DEVICES"] = env.get("CUDA_VISIBLE_DEVICES", "0")
            proc = subprocess.run(
                attempt,
                cwd=str(root),
                env=env,
                capture_output=True,
                text=True,
                timeout=GPU_INFERENCE_TIMEOUT_S,
            )
            if proc.returncode == 0 and raw_out.is_file():
                return _remux_h264(raw_out, audio_path, output_path)
            last_err = ((proc.stderr or "") + "\n" + (proc.stdout or ""))[-1000:]

        raise RuntimeError(f"LivePortrait inference failed:\n{last_err}")
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _ensure_liveportrait_repo() -> Path:
    markers = [
        LIVEPORTRAIT_DIR / "inference.py",
        LIVEPORTRAIT_DIR / "src" / "live_portrait_pipeline.py",
        LIVEPORTRAIT_DIR / "readme.md",
        LIVEPORTRAIT_DIR / "README.md",
    ]
    if any(p.is_file() for p in markers):
        logger.info("Using LivePortrait at %s", LIVEPORTRAIT_DIR)
        return LIVEPORTRAIT_DIR

    if os.getenv("LIP_SYNC_AUTO_CLONE_LIVEPORTRAIT", "").strip() not in {"1", "true", "yes"}:
        raise RuntimeError(
            f"LivePortrait not found at {LIVEPORTRAIT_DIR}. "
            "Clone it manually or set LIP_SYNC_AUTO_CLONE_LIVEPORTRAIT=1."
        )

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if LIVEPORTRAIT_DIR.exists():
        shutil.rmtree(LIVEPORTRAIT_DIR, ignore_errors=True)
    logger.info("Cloning LivePortrait -> %s", LIVEPORTRAIT_DIR)
    proc = subprocess.run(
        ["git", "clone", "--depth", "1", LIVEPORTRAIT_REPO, str(LIVEPORTRAIT_DIR)],
        capture_output=True,
        text=True,
        timeout=600,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to clone LivePortrait: {(proc.stderr or '')[-500:]}")
    return LIVEPORTRAIT_DIR


def _find_liveportrait_audio_script(root: Path) -> Optional[Path]:
    candidates = [
        root / "inference_audio.py",
        root / "app_audio.py",
        root / "scripts" / "inference_audio.py",
        root / "src" / "inference_audio.py",
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


# ------------------------------------------------------------------------------
# Local MoviePy / FFmpeg fallback (CPU)
# ------------------------------------------------------------------------------
def _generate_local_fallback(image_path: Path, audio_path: Path, output_path: Path) -> Path:
    duration = _media_duration(audio_path)
    if duration <= 0:
        duration = 1.0
    logger.info("CPU bounce fallback: duration=%.2fs image=%s", duration, image_path.name)

    try:
        _render_bounce_moviepy(image_path, audio_path, output_path, duration)
        if _is_valid_video(output_path):
            logger.info("MoviePy fallback wrote %s", output_path)
            return output_path
        logger.warning("MoviePy produced an invalid file; trying FFmpeg")
    except Exception as exc:
        logger.warning("MoviePy fallback unavailable (%s); trying FFmpeg", exc)

    _render_bounce_ffmpeg(image_path, audio_path, output_path, duration)
    if not _is_valid_video(output_path):
        raise RuntimeError(f"Local fallback failed to write a valid clip at {output_path}")
    logger.info("FFmpeg fallback wrote %s", output_path)
    return output_path


def _render_bounce_moviepy(image_path: Path, audio_path: Path, output_path: Path, duration: float) -> None:
    try:
        from moviepy import AudioFileClip, ColorClip, CompositeVideoClip, ImageClip

        is_v2 = True
    except ImportError:
        from moviepy.editor import AudioFileClip, ColorClip, CompositeVideoClip, ImageClip

        is_v2 = False

    def with_duration(clip, seconds):
        return clip.with_duration(seconds) if is_v2 else clip.set_duration(seconds)

    def with_position(clip, pos):
        return clip.with_position(pos) if is_v2 else clip.set_position(pos)

    def with_audio(clip, audio):
        return clip.with_audio(audio) if is_v2 else clip.set_audio(audio)

    def resized(clip, **kwargs):
        return clip.resized(**kwargs) if is_v2 else clip.resize(**kwargs)

    audio_clip = AudioFileClip(str(audio_path))
    # CHANGED: chroma-key green instead of slate, so this path is also
    # keyable by _finalize_alpha_video downstream.
    bg = with_duration(ColorClip(size=(FALLBACK_SIZE, FALLBACK_SIZE), color=list(CHROMA_KEY_RGB)), duration)
    mascot = ImageClip(str(image_path))
    target_h = int(FALLBACK_SIZE * 0.82)
    if getattr(mascot, "h", 0) and mascot.h > 0:
        mascot = resized(mascot, height=target_h)

    def zoom_at(t: float) -> float:
        return 1.0 + BOUNCE_AMP * math.sin(2.0 * math.pi * BOUNCE_HZ * t)

    if is_v2:
        bouncing = mascot.resized(lambda t: zoom_at(t))
    else:
        bouncing = mascot.resize(lambda t: zoom_at(t))
    bouncing = with_duration(with_position(bouncing, "center"), duration)
    final = with_audio(CompositeVideoClip([bg, bouncing], size=(FALLBACK_SIZE, FALLBACK_SIZE)), audio_clip)
    final = with_duration(final, duration)
    try:
        final.write_videofile(
            str(output_path),
            fps=FALLBACK_FPS,
            codec="libx264",
            audio_codec="aac",
            preset="veryfast",
            threads=2,
            logger=None,
        )
    finally:
        for clip in (final, bouncing, mascot, bg, audio_clip):
            try:
                clip.close()
            except Exception:
                pass


def _render_bounce_ffmpeg(image_path: Path, audio_path: Path, output_path: Path, duration: float) -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is not on PATH; cannot encode fallback video")

    frames = max(int(math.ceil(duration * FALLBACK_FPS)), FALLBACK_FPS)
    padded = FALLBACK_SIZE + 80
    # CHANGED: chroma-key green padding instead of slate hex.
    bg_hex = "0x{:02X}{:02X}{:02X}".format(*CHROMA_KEY_RGB)
    zoom_expr = f"1+{BOUNCE_AMP}*sin(2*PI*{BOUNCE_HZ}*on/{FALLBACK_FPS})"
    vf = (
        f"[0:v]scale={padded}:{padded}:force_original_aspect_ratio=decrease,"
        f"pad={padded}:{padded}:(ow-iw)/2:(oh-ih)/2:color={bg_hex},"
        f"zoompan=z='{zoom_expr}':d={frames}:"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"s={FALLBACK_SIZE}x{FALLBACK_SIZE}:fps={FALLBACK_FPS},"
        f"format=yuv420p[v]"
    )
    cmd = [
        "ffmpeg", "-y",
        "-i", str(image_path),
        "-i", str(audio_path),
        "-filter_complex", vf,
        "-map", "[v]",
        "-map", "1:a",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        "-movflags", "+faststart",
        str(output_path),
    ]
    logger.info("FFmpeg fallback: %s", " ".join(cmd[:6]) + " ...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=max(120, int(duration * 8)))
    if result.returncode != 0:
        tail = (result.stderr or "")[-800:]
        raise RuntimeError(f"ffmpeg bounce render failed:\n{tail}")


# ------------------------------------------------------------------------------
# CHANGED — new: chroma-key -> real alpha finalize step (used by every path)
# ------------------------------------------------------------------------------
def _finalize_alpha_video(raw_path: Path, output_path: Path) -> Path:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required to key out the chroma background")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # CHANGED: timeout now scales with clip length instead of a flat 180s
    # that failed on an 84s CPU-bounce fallback clip. Also switched VP9 to
    # "realtime" deadline + row-based multithreading, which is dramatically
    # faster than the default settings on Kaggle's shared CPU.
    duration = _media_duration(raw_path)
    dynamic_timeout = max(180, int(duration * 6) + 60)

    def _run(filter_chain: str) -> subprocess.CompletedProcess:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(raw_path),
            "-vf", filter_chain,
            "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuva420p",
            "-auto-alt-ref", "0",
            "-b:v", "0",
            "-crf", "32",
            "-deadline", "realtime",
            "-cpu-used", "8",
            "-row-mt", "1",
            "-threads", "4",
            "-c:a", "libopus",
            "-b:a", "128k",
            str(output_path),
        ]
        return subprocess.run(cmd, capture_output=True, text=True, timeout=dynamic_timeout)

    chroma_hex = "0x{:02X}{:02X}{:02X}".format(*CHROMA_KEY_RGB)
    result = _run(f"colorkey={chroma_hex}:0.30:0.12,despill=type=green,format=yuva420p")
    if result.returncode != 0:
        logger.warning("despill filter unavailable, retrying colorkey-only")
        result = _run(f"colorkey={chroma_hex}:0.30:0.12,format=yuva420p")

    if result.returncode != 0 or not output_path.is_file():
        raise RuntimeError(f"Alpha keying failed:\n{(result.stderr or '')[-800:]}")
    return output_path


# ------------------------------------------------------------------------------
# Face frame preparation (photographic vs SVG)
# ------------------------------------------------------------------------------
def _is_photographic_avatar(path: Path) -> bool:
    return path.suffix.lower() in {".jpg", ".jpeg", ".png"} or path.name.lower() in PHOTO_AVATAR_NAMES


def _prepare_face_frame(image_path: Path, engine: str = "wav2lip") -> Path:
    """Return a GPU-ready face frame.

    Photographic JPG/PNG (including ``real_avatar.*``) are passed through without
    SVG rasterization. LivePortrait additionally normalizes EXIF orientation and
    RGB layout for reliable ``cuda:0`` inference.
    """
    suffix = image_path.suffix.lower()
    if suffix == ".svg":
        logger.info("%s: rasterizing SVG pose for GPU", engine)
        return _ensure_raster_image(image_path)
    if suffix not in RASTER_EXTS:
        logger.warning("%s: unexpected format %s; attempting raster pass", engine, suffix)
        return _ensure_raster_image(image_path)
    if engine == "liveportrait":
        return _normalize_photo_for_liveportrait(image_path)
    if _is_photographic_avatar(image_path):
        logger.info("%s: using photographic source directly -> %s", engine, image_path.name)
    return image_path.resolve()


def _normalize_photo_for_liveportrait(image_path: Path) -> Path:
    """Strip EXIF rotation and emit a clean RGB JPEG for LivePortrait on cuda:0."""
    suffix = image_path.suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png"}:
        return image_path.resolve()

    try:
        from PIL import Image, ImageOps
    except ImportError:
        logger.warning("Pillow missing; passing %s as-is to LivePortrait", image_path.name)
        return image_path.resolve()

    out = TEMP_DIR / f"{image_path.stem}_lp_{os.getpid()}.jpg"
    with Image.open(image_path) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        max_edge = int(os.getenv("LIP_SYNC_MAX_FACE_EDGE", "1024"))
        width, height = img.size
        if max(width, height) > max_edge:
            scale = max_edge / max(width, height)
            img = img.resize(
                (max(1, int(width * scale)), max(1, int(height * scale))),
                Image.Resampling.LANCZOS,
            )
        img.save(out, format="JPEG", quality=95, optimize=True)

    logger.info("LivePortrait: normalized %s -> %s (cuda:0)", image_path.name, out.name)
    return out


# ------------------------------------------------------------------------------
# Image rasterization (SVG -> PNG)
# ------------------------------------------------------------------------------
def _ensure_raster_image(path: Path) -> Path:
    suffix = path.suffix.lower()
    if suffix in RASTER_EXTS:
        return path
    if suffix != ".svg":
        logger.warning("Unusual mascot format %s - attempting to use as-is", suffix)
        return path

    png_path = TEMP_DIR / f"{path.stem}_raster_{os.getpid()}.png"
    logger.info("Rasterizing SVG -> %s (chroma-key background)", png_path.name)

    errors: list[str] = []
    for converter in (_svg_via_cairosvg, _svg_via_browser, _svg_via_magick, _svg_via_ffmpeg):
        try:
            if converter(path, png_path) and png_path.is_file() and png_path.stat().st_size > 0:
                return png_path
        except Exception as exc:
            errors.append(f"{converter.__name__}: {exc}")

    raise RuntimeError(
        "Could not rasterize SVG mascot. Tried: " + ("; ".join(errors) or "no converters")
    )


def _svg_via_cairosvg(svg_path: Path, png_path: Path) -> bool:
    import cairosvg

    # CHANGED: chroma-key background instead of slate hex.
    cairosvg.svg2png(
        url=str(svg_path),
        write_to=str(png_path),
        output_width=FALLBACK_SIZE,
        output_height=FALLBACK_SIZE,
        background_color=CHROMA_KEY_HEX,
    )
    return True


def _svg_via_browser(svg_path: Path, png_path: Path) -> bool:
    browser = _find_browser()
    if not browser:
        return False

    work = Path(tempfile.mkdtemp(prefix="mascot_svg_", dir=str(TEMP_DIR)))
    try:
        local_svg = work / "mascot.svg"
        shutil.copy2(svg_path, local_svg)
        html_path = work / "mascot.html"
        # CHANGED: chroma-key background instead of #0F172A.
        html_path.write_text(
            f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  html,body{{margin:0;padding:0;width:{FALLBACK_SIZE}px;height:{FALLBACK_SIZE}px;
    background:{CHROMA_KEY_HEX};display:flex;align-items:center;justify-content:center;overflow:hidden}}
  img{{max-width:88%;max-height:88%}}
</style></head>
<body><img src="mascot.svg" alt="mascot"></body></html>
""",
            encoding="utf-8",
        )
        screenshot = work / "screenshot.png"
        cmd = [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--allow-file-access-from-files",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            f"--window-size={FALLBACK_SIZE},{FALLBACK_SIZE}",
            f"--screenshot={_path_for_cli(screenshot)}",
            html_path.resolve().as_uri(),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
        candidate = screenshot if screenshot.is_file() else work / "screenshot.png"
        if not candidate.is_file():
            cwd_shot = Path.cwd() / "screenshot.png"
            if cwd_shot.is_file():
                candidate = cwd_shot
        if proc.returncode != 0 and not candidate.is_file():
            raise RuntimeError(proc.stderr[-400:] if proc.stderr else "browser screenshot failed")
        if not candidate.is_file():
            return False
        shutil.copy2(candidate, png_path)
        if candidate == Path.cwd() / "screenshot.png":
            try:
                candidate.unlink()
            except OSError:
                pass
        return True
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _svg_via_magick(svg_path: Path, png_path: Path) -> bool:
    magick = shutil.which("magick") or shutil.which("convert")
    if not magick:
        return False
    cmd = [
        magick,
        "-background", CHROMA_KEY_HEX,  # CHANGED: was #0F172A
        "-density", "192",
        str(svg_path),
        "-resize", f"{FALLBACK_SIZE}x{FALLBACK_SIZE}",
        str(png_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
    return proc.returncode == 0 and png_path.is_file()


def _svg_via_ffmpeg(svg_path: Path, png_path: Path) -> bool:
    if shutil.which("ffmpeg") is None:
        return False
    chroma_hex = "0x{:02X}{:02X}{:02X}".format(*CHROMA_KEY_RGB)  # CHANGED
    cmd = [
        "ffmpeg", "-y",
        "-i", str(svg_path),
        "-vf", f"scale={FALLBACK_SIZE}:{FALLBACK_SIZE}:force_original_aspect_ratio=decrease,"
               f"pad={FALLBACK_SIZE}:{FALLBACK_SIZE}:(ow-iw)/2:(oh-ih)/2:color={chroma_hex}",
        str(png_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
    return proc.returncode == 0 and png_path.is_file()


def _find_browser() -> Optional[str]:
    env_browser = os.getenv("PUPPETEER_EXECUTABLE_PATH") or os.getenv("CHROME_PATH")
    candidates = [
        env_browser,
        shutil.which("msedge"),
        shutil.which("chrome"),
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
    ]
    for path in candidates:
        if path and Path(path).is_file():
            return path
    return None


# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------
def _remux_h264(video_path: Path, audio_path: Path, output_path: Path) -> Path:
    """Normalize a raw engine output into a clean opaque H.264 + AAC MP4.

    This is an *intermediate* artifact only — `_finalize_alpha_video` runs on
    top of this afterward to produce the real transparent deliverable. Kept
    as H.264 here deliberately: it's the most robust/compatible container
    for this normalization step, and alpha is added in the step after.
    """
    if shutil.which("ffmpeg") is None:
        shutil.copy2(video_path, output_path)
        return output_path

    has_audio = _stream_has_audio(video_path)
    if has_audio:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            "-movflags", "+faststart",
            str(output_path),
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-i", str(audio_path),
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            "-movflags", "+faststart",
            str(output_path),
        ]

    logger.info("Normalizing engine output -> H.264 intermediate -> %s", output_path.name)
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0 or not _is_valid_video(output_path):
        if _is_valid_video(video_path):
            shutil.copy2(video_path, output_path)
            return output_path
        raise RuntimeError(f"H.264 normalize failed:\n{(proc.stderr or '')[-600:]}")
    return output_path


def _stream_has_audio(path: Path) -> bool:
    if shutil.which("ffprobe") is None:
        return True
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=codec_type",
        "-of", "csv=p=0",
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    return "audio" in (proc.stdout or "").lower()


def _download_first_ok(urls: list[str], dest: Path, min_bytes: int = 1024) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    last_error: Optional[Exception] = None
    for url in urls:
        tmp = dest.with_suffix(dest.suffix + ".part")
        try:
            logger.info("Downloading %s", url)
            urllib.request.urlretrieve(url, str(tmp))
            if tmp.is_file() and tmp.stat().st_size >= min_bytes:
                tmp.replace(dest)
                return dest
            last_error = RuntimeError(f"Downloaded file too small from {url}")
        except (URLError, OSError, RuntimeError) as exc:
            last_error = exc
            logger.warning("Download failed (%s): %s", url, exc)
        finally:
            if tmp.is_file() and not dest.is_file():
                try:
                    tmp.unlink()
                except OSError:
                    pass
    raise RuntimeError(f"Could not download {dest.name}: {last_error}")


def _media_duration(path: Path) -> float:
    if shutil.which("ffprobe") is None:
        logger.warning("ffprobe missing; defaulting duration to 3s")
        return 3.0
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    try:
        return max(float((proc.stdout or "").strip()), 0.1)
    except ValueError:
        logger.warning("Could not parse duration for %s", path.name)
        return 3.0


def _is_valid_video(path: Optional[Path]) -> bool:
    """Renamed from `_is_valid_mp4` — works for any container ffprobe reads."""
    if not path or not Path(path).is_file() or Path(path).stat().st_size < 1024:
        return False
    if shutil.which("ffprobe") is None:
        return True
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name",
        "-of", "csv=p=0",
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    codec = (proc.stdout or "").strip().lower()
    return proc.returncode == 0 and bool(codec)


def _path_for_cli(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/")


__all__ = [
    "generate_talking_mascot",
    "has_photographic_real_avatar",
    "resolve_lip_sync_mode",
    "resolve_pose_image",
    "resolve_mascot_dir",
    "VALID_POSES",
    "LIP_SYNC_MODES",
    "PHOTO_AVATAR_NAMES",
    "CHROMA_KEY_RGB",
    "CHROMA_KEY_HEX",
]
