#!/usr/bin/env bash
# =============================================================================
# Kriti LMS — RunPod read-only preflight / readiness check
#
# Purpose:
#   Verify that this RunPod machine has the directories, tools, Python packages,
#   GPU access, and caches needed to run the Kriti chapter pipeline.
#
# Safety (this script MUST remain read-only):
#   - Does NOT install packages
#   - Does NOT download models
#   - Does NOT modify files, .env, GPU config, or services
#   - Does NOT run Chapter_Agent.py or Remotion renders
#   - Does NOT generate TTS audio
#   - Does NOT commit or push
#
# Usage (typical after pod start):
#   cd /workspace/kriti_lms
#   source .venv/bin/activate
#   source scripts/activate_runpod.sh
#   ./scripts/runpod_preflight.sh
# =============================================================================

set -uo pipefail

PASS=0
WARN=0
FAIL=0
CRITICAL_FAIL=0

pass() { echo "[PASS] $*"; PASS=$((PASS + 1)); }
warn() { echo "[WARN] $*"; WARN=$((WARN + 1)); }
fail() { echo "[FAIL] $*"; FAIL=$((FAIL + 1)); CRITICAL_FAIL=$((CRITICAL_FAIL + 1)); }
info() { echo "       $*"; }

# Import helper using the venv interpreter
py_check_import() {
  local mod="$1"
  local label="${2:-$1}"
  if [[ -z "${PYTHON}" ]]; then
    fail "Cannot import ${label} (no python)"
    return
  fi
  if "${PYTHON}" -c "import ${mod}" >/dev/null 2>&1; then
    local ver
    ver="$("${PYTHON}" -c "import ${mod}; print(getattr(${mod}, '__version__', 'ok'))" 2>/dev/null || echo ok)"
    pass "${label} import (${ver})"
  else
    fail "${label} import failed"
  fi
}

echo "=============================================="
echo "  KRITI RUNPOD PREFLIGHT"
echo "=============================================="
echo ""

# -----------------------------------------------------------------------------
# Locate repository root (script lives in <repo>/scripts/)
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${REPO_ROOT}/Chapter_Agent.py" ]]; then
  fail "Cannot locate Kriti repo (Chapter_Agent.py missing near ${REPO_ROOT})"
  echo ""
  echo "KRITI RUNPOD IS NOT READY"
  exit 1
fi
pass "Repository root: ${REPO_ROOT}"

if [[ -d /workspace/kriti_lms ]]; then
  pass "/workspace/kriti_lms exists"
else
  fail "/workspace/kriti_lms does not exist"
fi

# -----------------------------------------------------------------------------
# Python venv
# -----------------------------------------------------------------------------
VENV="${REPO_ROOT}/.venv"
PYTHON="${VENV}/bin/python"
if [[ -d "${VENV}" ]]; then
  pass "Virtualenv exists: ${VENV}"
else
  fail "Virtualenv missing: ${VENV}"
fi

if [[ -x "${PYTHON}" ]]; then
  pass "Python executable: ${PYTHON}"
  PY_VER="$("${PYTHON}" --version 2>&1 || true)"
  pass "Python version: ${PY_VER}"
else
  fail "Python executable missing or not executable: ${PYTHON}"
  PYTHON=""
fi

# Load non-secret path vars from .env if unset in the shell (never touch API key values here)
if [[ -n "${PYTHON}" ]]; then
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    name="${line%%=*}"
    val="${line#*=}"
    if [[ -z "${!name:-}" ]]; then
      export "${name}=${val}"
    fi
  done < <("${PYTHON}" - <<PY
from pathlib import Path
import os
try:
    from dotenv import load_dotenv
    load_dotenv(Path(r"${REPO_ROOT}") / ".env")
except Exception:
    pass
PATH_KEYS = (
    "KRITI_SOURCE_BOOKS", "KRITI_OUTPUT_DIR", "KRITI_TEMP_DIR",
    "HF_HOME", "TORCH_HOME", "U2NET_HOME", "LIP_SYNC_MODELS_DIR",
    "PUPPETEER_EXECUTABLE_PATH", "CHROME_PATH",
)
for k in PATH_KEYS:
    v = os.getenv(k)
    if v:
        print(f"{k}={v.replace(chr(10), '').replace(chr(13), '')}")
PY
)
fi

# -----------------------------------------------------------------------------
# Core Python / ML imports
# -----------------------------------------------------------------------------
echo ""
echo "--- Python packages ---"

if [[ -n "${PYTHON}" ]]; then
  if "${PYTHON}" -c "from dotenv import load_dotenv" >/dev/null 2>&1; then
    pass "python-dotenv import"
  else
    fail "python-dotenv import failed"
  fi
fi

py_check_import "torch" "PyTorch"
py_check_import "torchvision" "torchvision"
py_check_import "diffusers" "diffusers"
py_check_import "transformers" "transformers"
py_check_import "accelerate" "accelerate"
py_check_import "rembg" "rembg"

# onnxruntime-gpu installs as import name onnxruntime
if [[ -n "${PYTHON}" ]]; then
  if "${PYTHON}" -c "import onnxruntime as ort" >/dev/null 2>&1; then
    ORT_VER="$("${PYTHON}" -c "import onnxruntime as ort; print(ort.__version__)")"
    ORT_PROV="$("${PYTHON}" -c "import onnxruntime as ort; print(','.join(ort.get_available_providers()))")"
    if echo "${ORT_PROV}" | grep -q CUDAExecutionProvider; then
      pass "onnxruntime-gpu ${ORT_VER} (CUDAExecutionProvider present)"
    else
      warn "onnxruntime ${ORT_VER} imported but CUDAExecutionProvider missing (${ORT_PROV})"
    fi
  else
    fail "onnxruntime-gpu / onnxruntime import failed"
  fi
fi

py_check_import "anthropic" "anthropic"
if [[ -n "${PYTHON}" ]]; then
  if "${PYTHON}" -c "from google import genai" >/dev/null 2>&1; then
    pass "google-genai import"
  else
    fail "google-genai import failed"
  fi
fi
# Prefer pymupdf import name when available; suppress deprecation noise on fitz
if [[ -n "${PYTHON}" ]]; then
  if "${PYTHON}" -c "import pymupdf; print(pymupdf.__version__)" >/dev/null 2>&1; then
    PM_VER="$("${PYTHON}" -c "import pymupdf; print(pymupdf.__version__)" 2>/dev/null)"
    pass "pymupdf import (${PM_VER})"
  elif "${PYTHON}" -c "import fitz" >/dev/null 2>&1; then
    PM_VER="$("${PYTHON}" -c "import fitz; print(getattr(fitz, '__version__', 'ok'))" 2>/dev/null | tail -1)"
    pass "pymupdf (fitz) import (${PM_VER})"
  else
    fail "pymupdf / fitz import failed"
  fi
fi
py_check_import "pypdf" "pypdf"
py_check_import "moviepy" "moviepy"
py_check_import "librosa" "librosa"
py_check_import "batch_face" "batch-face"

# -----------------------------------------------------------------------------
# GPU: torch.cuda + tiny tensor (no SDXL, no large alloc)
# -----------------------------------------------------------------------------
echo ""
echo "--- GPU ---"

if [[ -n "${PYTHON}" ]]; then
  GPU_OUT="$("${PYTHON}" - <<'PY' 2>&1
import torch
print("cuda_available", torch.cuda.is_available())
print("torch_version", torch.__version__)
print("cuda_version", torch.version.cuda)
if torch.cuda.is_available():
    print("device_name", torch.cuda.get_device_name(0))
    props = torch.cuda.get_device_properties(0)
    print("mem_gib", round(props.total_memory / (1024**3), 2))
    t = torch.zeros((8, 8), device="cuda")
    s = float(t.sum())
    del t
    torch.cuda.empty_cache()
    print("tensor_ok", s == 0.0)
else:
    print("device_name", "none")
    print("mem_gib", 0)
    print("tensor_ok", False)
PY
)" || true

  while IFS= read -r line; do
    [[ -n "${line}" ]] && info "${line}"
  done <<< "${GPU_OUT}"

  if echo "${GPU_OUT}" | grep -q 'cuda_available True'; then
    pass "torch.cuda.is_available() == True"
  else
    fail "torch.cuda.is_available() is False"
  fi

  DEV="$(echo "${GPU_OUT}" | awk '/^device_name /{sub(/^device_name /,""); print}')"
  if [[ -n "${DEV}" && "${DEV}" != "none" ]]; then
    pass "GPU name: ${DEV}"
  else
    fail "GPU name unavailable"
  fi

  CUDA_V="$(echo "${GPU_OUT}" | awk '/^cuda_version /{print $2}')"
  if [[ -n "${CUDA_V}" && "${CUDA_V}" != "None" ]]; then
    pass "PyTorch CUDA version: ${CUDA_V}"
  else
    warn "PyTorch CUDA version not reported"
  fi

  MEM="$(echo "${GPU_OUT}" | awk '/^mem_gib /{print $2}')"
  if [[ -n "${MEM}" && "${MEM}" != "0" ]]; then
    pass "Visible GPU memory: ${MEM} GiB"
  else
    fail "Visible GPU memory not reported"
  fi

  if echo "${GPU_OUT}" | grep -q 'tensor_ok True'; then
    pass "Small CUDA tensor test"
  else
    fail "Small CUDA tensor test"
  fi
fi

# -----------------------------------------------------------------------------
# Environment variables (paths only — never print secrets)
# -----------------------------------------------------------------------------
echo ""
echo "--- Environment variables ---"

check_env_path() {
  local name="$1"
  local val="${!name-}"
  if [[ -n "${val}" ]]; then
    pass "${name}=${val}"
  else
    warn "${name} is UNSET (app may use repo defaults)"
  fi
}

check_env_path KRITI_SOURCE_BOOKS
check_env_path KRITI_OUTPUT_DIR
check_env_path KRITI_TEMP_DIR
check_env_path HF_HOME
check_env_path TORCH_HOME
check_env_path U2NET_HOME
check_env_path LIP_SYNC_MODELS_DIR
check_env_path PUPPETEER_EXECUTABLE_PATH
check_env_path CHROME_PATH

# -----------------------------------------------------------------------------
# API keys — SET / MISSING only (values never printed)
# -----------------------------------------------------------------------------
echo ""
echo "--- API keys ---"

# Presence probe via Python so .env is considered without echoing secrets
if [[ -n "${PYTHON}" ]]; then
  KEY_STATUS="$("${PYTHON}" - <<PY
from pathlib import Path
import os
try:
    from dotenv import load_dotenv
    load_dotenv(Path(r"${REPO_ROOT}") / ".env")
except Exception:
    pass
# Also honor already-exported shell env (e.g. after activate_runpod.sh)
def status(name):
    v = os.getenv(name)
    return "SET" if v and v.strip() else "MISSING"
print("ANTHROPIC", status("ANTHROPIC_API_KEY"))
print("GEMINI", status("GEMINI_API_KEY"))
PY
)"
  ANTHROPIC_STATUS="$(echo "${KEY_STATUS}" | awk '/^ANTHROPIC /{print $2}')"
  GEMINI_STATUS="$(echo "${KEY_STATUS}" | awk '/^GEMINI /{print $2}')"
else
  ANTHROPIC_STATUS="MISSING"
  GEMINI_STATUS="MISSING"
fi

if [[ "${ANTHROPIC_STATUS}" == "SET" ]]; then
  pass "ANTHROPIC_API_KEY: SET"
else
  warn "ANTHROPIC_API_KEY: MISSING"
fi
if [[ "${GEMINI_STATUS}" == "SET" ]]; then
  pass "GEMINI_API_KEY: SET"
else
  warn "GEMINI_API_KEY: MISSING"
fi
# Only fail readiness when *both* providers are missing
if [[ "${ANTHROPIC_STATUS}" == "MISSING" && "${GEMINI_STATUS}" == "MISSING" ]]; then
  fail "No LLM provider API key set (need ANTHROPIC_API_KEY and/or GEMINI_API_KEY)"
fi

# -----------------------------------------------------------------------------
# Source books / PDFs
# -----------------------------------------------------------------------------
echo ""
echo "--- Source data ---"

SRC="${KRITI_SOURCE_BOOKS:-${REPO_ROOT}/Source_Books}"
if [[ -d "${SRC}" ]]; then
  pass "Source_Books directory: ${SRC}"
  PDF_COUNT="$(find "${SRC}" -type f -name '*.pdf' 2>/dev/null | wc -l | tr -d ' ')"
  PDF_BYTES="$(find "${SRC}" -type f -name '*.pdf' -printf '%s\n' 2>/dev/null | awk '{s+=$1} END {print s+0}')"
  PDF_MIB="$(awk -v b="${PDF_BYTES}" 'BEGIN {printf "%.1f", b/1024/1024}')"
  if [[ "${PDF_COUNT}" -gt 0 ]]; then
    pass "PDF count: ${PDF_COUNT} (~${PDF_MIB} MiB total)"
  else
    fail "No PDF files found under ${SRC}"
  fi
else
  fail "Source_Books directory missing: ${SRC}"
fi

# -----------------------------------------------------------------------------
# Runtime / cache directories
# -----------------------------------------------------------------------------
echo ""
echo "--- Directories ---"

OUT_DIR="${KRITI_OUTPUT_DIR:-${REPO_ROOT}/Rendered_Output}"
TEMP_DIR="${KRITI_TEMP_DIR:-${REPO_ROOT}/temp}"
HF_DIR="${HF_HOME:-/workspace/caches/huggingface}"
REMBG_DIR="${U2NET_HOME:-/workspace/caches/rembg}"
LIP_DIR="${LIP_SYNC_MODELS_DIR:-/workspace/models/lipsync}"

for label_path in \
  "Rendered_Output:${OUT_DIR}" \
  "temp:${TEMP_DIR}" \
  "HF cache:${HF_DIR}" \
  "rembg cache:${REMBG_DIR}" \
  "lip-sync models:${LIP_DIR}"
do
  label="${label_path%%:*}"
  path="${label_path#*:}"
  if [[ -d "${path}" ]]; then
    pass "${label} directory exists: ${path}"
  else
    fail "${label} directory missing: ${path}"
  fi
done

# -----------------------------------------------------------------------------
# Model caches (existence only — no downloads)
# -----------------------------------------------------------------------------
echo ""
echo "--- Model caches ---"

SDXL_CACHE="${HF_DIR}/hub/models--stabilityai--sdxl-turbo"
SDXL_CANONICAL="/workspace/caches/huggingface/hub/models--stabilityai--sdxl-turbo"
if [[ -d "${SDXL_CACHE}" ]]; then
  pass "SDXL-Turbo cache present: ${SDXL_CACHE}"
elif [[ -d "${SDXL_CANONICAL}" ]]; then
  # Models exist on the volume, but HF_HOME points elsewhere — still runnable if HF_HOME is fixed
  warn "SDXL-Turbo found at ${SDXL_CANONICAL} but not under HF_HOME=${HF_DIR} (align HF_HOME)"
else
  fail "SDXL-Turbo cache missing (checked ${SDXL_CACHE})"
fi

U2NET="${REMBG_DIR}/u2net.onnx"
if [[ -f "${U2NET}" ]]; then
  U2_MIB="$(awk -v b="$(stat -c%s "${U2NET}" 2>/dev/null || echo 0)" 'BEGIN {printf "%.1f", b/1024/1024}')"
  pass "U2Net present: ${U2NET} (~${U2_MIB} MiB)"
else
  fail "U2Net missing: ${U2NET}"
fi

# Wav2Lip optional for default cartoon_svg path
if [[ -d "${LIP_DIR}/Wav2Lip" ]]; then
  pass "Wav2Lip directory present: ${LIP_DIR}/Wav2Lip"
elif [[ -d "${LIP_DIR}" ]]; then
  warn "Lip-sync models dir exists but Wav2Lip checkout not found (OK for cartoon_svg): ${LIP_DIR}"
else
  warn "Wav2Lip directory not present under ${LIP_DIR} (OK for cartoon_svg default path)"
fi

# -----------------------------------------------------------------------------
# Node / npm / npx
# -----------------------------------------------------------------------------
echo ""
echo "--- Node ---"

if command -v node >/dev/null 2>&1; then
  pass "node $(node --version 2>/dev/null)"
else
  fail "node not found"
fi
if command -v npm >/dev/null 2>&1; then
  pass "npm $(npm --version 2>/dev/null)"
else
  fail "npm not found"
fi
if command -v npx >/dev/null 2>&1; then
  pass "npx $(npx --version 2>/dev/null)"
else
  fail "npx not found"
fi

# -----------------------------------------------------------------------------
# Remotion (package version only — no render)
# -----------------------------------------------------------------------------
echo ""
echo "--- Remotion ---"

REMOTION_PKG="${REPO_ROOT}/remotion/node_modules/remotion/package.json"
if [[ -f "${REMOTION_PKG}" ]]; then
  REM_VER="$("${PYTHON:-python3}" -c "import json; print(json.load(open('${REMOTION_PKG}'))['version'])" 2>/dev/null || true)"
  if [[ -n "${REM_VER}" ]]; then
    pass "Remotion installed: ${REM_VER}"
  else
    pass "Remotion package.json present under node_modules"
  fi
elif [[ -f "${REPO_ROOT}/remotion/package.json" ]]; then
  warn "remotion/package.json present but node_modules/remotion missing (run npm ci in remotion/)"
else
  fail "Remotion project missing under ${REPO_ROOT}/remotion"
fi
if [[ -f "${REPO_ROOT}/remotion/package-lock.json" ]]; then
  pass "Remotion package-lock.json present"
else
  warn "Remotion package-lock.json missing"
fi

# -----------------------------------------------------------------------------
# Chromium / Chrome
# -----------------------------------------------------------------------------
echo ""
echo "--- Chromium ---"

CHROME_BIN="${PUPPETEER_EXECUTABLE_PATH:-${CHROME_PATH:-/usr/bin/chromium}}"
if [[ -x "${CHROME_BIN}" ]]; then
  if CHROME_VER="$("${CHROME_BIN}" --version 2>/dev/null)"; then
    pass "Chromium executable: ${CHROME_BIN} (${CHROME_VER})"
  else
    fail "Chromium exists but --version failed: ${CHROME_BIN} (possible snap stub)"
  fi
else
  fail "Chromium executable missing: ${CHROME_BIN}"
fi

# -----------------------------------------------------------------------------
# FFmpeg / ffprobe / codecs
# -----------------------------------------------------------------------------
echo ""
echo "--- FFmpeg ---"

if command -v ffmpeg >/dev/null 2>&1; then
  pass "ffmpeg: $(ffmpeg -version 2>/dev/null | head -1)"
else
  fail "ffmpeg not found"
fi
if command -v ffprobe >/dev/null 2>&1; then
  pass "ffprobe: $(ffprobe -version 2>/dev/null | head -1)"
else
  fail "ffprobe not found"
fi

if command -v ffmpeg >/dev/null 2>&1; then
  ENC="$(ffmpeg -encoders 2>/dev/null || true)"
  echo "${ENC}" | grep -q 'libx264' && pass "ffmpeg encoder libx264" || fail "ffmpeg encoder libx264 missing"
  echo "${ENC}" | grep -q 'libvpx-vp9' && pass "ffmpeg encoder libvpx-vp9" || fail "ffmpeg encoder libvpx-vp9 missing"
  echo "${ENC}" | grep -q 'libopus' && pass "ffmpeg encoder libopus" || fail "ffmpeg encoder libopus missing"
fi

# -----------------------------------------------------------------------------
# Edge TTS (CLI presence only — no synthesis)
# -----------------------------------------------------------------------------
echo ""
echo "--- Edge TTS ---"

EDGE_BIN="${VENV}/bin/edge-tts"
if [[ -x "${EDGE_BIN}" ]]; then
  EDGE_VER="$("${EDGE_BIN}" --version 2>/dev/null || true)"
  if [[ -n "${EDGE_VER}" ]]; then
    pass "edge-tts: ${EDGE_BIN} (${EDGE_VER})"
  else
    pass "edge-tts executable present: ${EDGE_BIN}"
  fi
elif command -v edge-tts >/dev/null 2>&1; then
  pass "edge-tts on PATH: $(command -v edge-tts)"
else
  fail "edge-tts not found in venv or PATH"
fi

# -----------------------------------------------------------------------------
# Git (status only)
# -----------------------------------------------------------------------------
echo ""
echo "--- Git ---"

if command -v git >/dev/null 2>&1 && [[ -d "${REPO_ROOT}/.git" ]]; then
  BRANCH="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  pass "Git branch: ${BRANCH}"
  if git -C "${REPO_ROOT}" status --porcelain 2>/dev/null | grep -q .; then
    warn "Git working tree: dirty (uncommitted changes present)"
  else
    pass "Git working tree: clean"
  fi
else
  warn "Git repository metadata unavailable"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
echo "  PASS: ${PASS}   WARN: ${WARN}   FAIL: ${FAIL}"
echo "=============================================="

if [[ "${CRITICAL_FAIL}" -eq 0 ]]; then
  echo "KRITI RUNPOD IS READY"
  exit 0
fi

echo "KRITI RUNPOD IS NOT READY"
exit 1
