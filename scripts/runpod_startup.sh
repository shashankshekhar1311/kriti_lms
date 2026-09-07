#!/usr/bin/env bash
# =============================================================================
# Kriti LMS — RunPod container startup wrapper
#
# Intended for RunPod's "Container start command" so the worker automatically
# rejoins Tailscale after every Pod start. The script preserves the base image's
# /start.sh services when present, then bootstraps Kriti Tailscale from /workspace.
# =============================================================================

set -euo pipefail

REPO_PATH="${KRITI_WORKER_REPO_PATH:-/workspace/kriti_lms}"
WAIT_SECONDS="${KRITI_STARTUP_REPO_WAIT_SECONDS:-60}"
BASE_START="${KRITI_RUNPOD_BASE_START_SCRIPT:-/start.sh}"

log() { printf '[KRITI-STARTUP] %s\n' "$*"; }

base_pid=""
if [[ -x "$BASE_START" ]]; then
    log "Starting base image services: ${BASE_START}"
    "$BASE_START" &
    base_pid=$!
else
    log "Base start script not present/executable; continuing without it: ${BASE_START}"
fi

deadline=$((SECONDS + WAIT_SECONDS))
until [[ -f "$REPO_PATH/scripts/bootstrap_tailscale.sh" ]]; do
    if (( SECONDS >= deadline )); then
        log "ERROR: bootstrap script not found at ${REPO_PATH}/scripts/bootstrap_tailscale.sh"
        exit 1
    fi
    sleep 1
done

log "Bootstrapping Tailscale from ${REPO_PATH}"
bash "$REPO_PATH/scripts/bootstrap_tailscale.sh"
log "Worker networking is ready"

# Keep the container alive after bootstrap. If the base image provides /start.sh,
# wait for that long-running service process. Otherwise use an idle sleep loop.
if [[ -n "$base_pid" ]]; then
    wait "$base_pid"
else
    exec sleep infinity
fi
