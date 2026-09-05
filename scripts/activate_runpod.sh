#!/usr/bin/env bash
# Activate Kriti RunPod venv + persistent cache/path env (no API keys).
# Usage: source /workspace/kriti_lms/scripts/activate_runpod.sh

_KRITI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_VENV="${_KRITI_ROOT}/.venv"

if [[ ! -d "${_VENV}" ]]; then
  echo "ERROR: venv not found at ${_VENV}. Create it per docs/RUNPOD_ENV.md" >&2
  return 1 2>/dev/null || exit 1
fi

# shellcheck disable=SC1091
source "${_VENV}/bin/activate"

export HF_HOME="${HF_HOME:-/workspace/caches/huggingface}"
export TORCH_HOME="${TORCH_HOME:-/workspace/caches/torch}"
export U2NET_HOME="${U2NET_HOME:-/workspace/caches/rembg}"
export LIP_SYNC_MODELS_DIR="${LIP_SYNC_MODELS_DIR:-/workspace/models/lipsync}"
export KRITI_SOURCE_BOOKS="${KRITI_SOURCE_BOOKS:-/workspace/kriti_lms/Source_Books}"
export KRITI_OUTPUT_DIR="${KRITI_OUTPUT_DIR:-/workspace/data/Rendered_Output}"
export KRITI_TEMP_DIR="${KRITI_TEMP_DIR:-/workspace/temp}"

# Remotion / Chromium (prefer google-chrome-stable linked as /usr/bin/chromium on this host)
if [[ -z "${PUPPETEER_EXECUTABLE_PATH:-}" ]]; then
  for candidate in /usr/bin/chromium /usr/bin/google-chrome-stable /usr/bin/google-chrome; do
    if [[ -x "$candidate" ]] && "$candidate" --version >/dev/null 2>&1; then
      export PUPPETEER_EXECUTABLE_PATH="$candidate"
      break
    fi
  done
fi
export CHROME_PATH="${CHROME_PATH:-${PUPPETEER_EXECUTABLE_PATH:-}}"
export PUPPETEER_SKIP_DOWNLOAD="${PUPPETEER_SKIP_DOWNLOAD:-true}"

# Avoid broken HF fast-transfer when hf_transfer is not installed
if [[ "${HF_HUB_ENABLE_HF_TRANSFER:-}" == "1" ]] && ! python -c "import hf_transfer" >/dev/null 2>&1; then
  export HF_HUB_ENABLE_HF_TRANSFER=0
fi

mkdir -p "$HF_HOME" "$TORCH_HOME" "$U2NET_HOME" "$LIP_SYNC_MODELS_DIR" \
  "$KRITI_SOURCE_BOOKS" "$KRITI_OUTPUT_DIR" "$KRITI_TEMP_DIR"

echo "Kriti venv: ${VIRTUAL_ENV}"
echo "Python: $(command -v python) ($(python --version 2>&1))"
echo "HF_HOME=$HF_HOME"
echo "TORCH_HOME=$TORCH_HOME"
echo "U2NET_HOME=$U2NET_HOME"
echo "LIP_SYNC_MODELS_DIR=$LIP_SYNC_MODELS_DIR"
echo "KRITI_SOURCE_BOOKS=$KRITI_SOURCE_BOOKS"
echo "KRITI_OUTPUT_DIR=$KRITI_OUTPUT_DIR"
echo "KRITI_TEMP_DIR=$KRITI_TEMP_DIR"
echo "PUPPETEER_EXECUTABLE_PATH=${PUPPETEER_EXECUTABLE_PATH:-}"
echo "CHROME_PATH=${CHROME_PATH:-}"
