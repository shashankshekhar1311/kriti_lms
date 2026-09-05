#!/usr/bin/env bash
# Create the recommended RunPod persistent directory layout.
# Non-destructive: mkdir -p only. Does not move or delete existing data.
set -euo pipefail

ROOT="${KRITI_WORKSPACE_ROOT:-/workspace}"

echo "==> Preparing RunPod directories under: $ROOT"
mkdir -p \
  "$ROOT/caches/huggingface" \
  "$ROOT/caches/torch" \
  "$ROOT/caches/rembg" \
  "$ROOT/models/lipsync" \
  "$ROOT/data/Source_Books" \
  "$ROOT/data/Rendered_Output" \
  "$ROOT/temp"

echo "    caches/huggingface"
echo "    caches/torch"
echo "    caches/rembg"
echo "    models/lipsync"
echo "    data/Source_Books"
echo "    data/Rendered_Output"
echo "    temp"
echo ""
echo "✅ Done. Point .env at these paths (see docs/RUNPOD.md)."
echo "   Existing repo Source_Books were not moved."
