#!/usr/bin/env bash
# =============================================================================
# Kriti LMS — RunPod container startup wrapper
#
# Intended for RunPod's "Container start command". Base image services are
# started first and kept alive even when Tailscale bootstrap fails, so RunPod
# SSH/Jupyter/Web Terminal remain available for diagnosis. Startup diagnostics
# are persisted on /workspace by default and never include secret values.
# =============================================================================

set -uo pipefail

REPO_PATH="${KRITI_WORKER_REPO_PATH:-/workspace/kriti_lms}"
WAIT_SECONDS="${KRITI_STARTUP_REPO_WAIT_SECONDS:-60}"
BASE_START="${KRITI_RUNPOD_BASE_START_SCRIPT:-/start.sh}"
LOG_ROOT="${KRITI_STARTUP_LOG_DIR:-/workspace/data/logs/runpod-startup}"
POD_ID_RAW="${RUNPOD_POD_ID:-unknown-pod}"
POD_ID_SAFE="$(printf '%s' "$POD_ID_RAW" | tr -cs 'A-Za-z0-9._-' '-')"
POD_ID_SAFE="${POD_ID_SAFE%-}"
[[ -n "$POD_ID_SAFE" ]] || POD_ID_SAFE="unknown-pod"

if ! mkdir -p "$LOG_ROOT" 2>/dev/null; then
    LOG_ROOT="/tmp/kriti-runpod-startup"
    mkdir -p "$LOG_ROOT"
fi

LOG_FILE="$LOG_ROOT/${POD_ID_SAFE}.log"
READY_FILE="$LOG_ROOT/${POD_ID_SAFE}.tailscale-ready"
FAILED_FILE="$LOG_ROOT/${POD_ID_SAFE}.tailscale-failed"
rm -f "$READY_FILE" "$FAILED_FILE"

# Tee all wrapper/bootstrap stdout+stderr to persistent storage when possible.
exec > >(tee -a "$LOG_FILE") 2>&1

log() { printf '[KRITI-STARTUP] %s\n' "$*"; }
mark_failed() {
    local reason="$1"
    printf '%s\n' "$reason" > "$FAILED_FILE" 2>/dev/null || true
}

log "Startup begin pod_id=${POD_ID_RAW} repo=${REPO_PATH} log=${LOG_FILE}"
log "Environment present RUNPOD_POD_ID=$([[ -n "${RUNPOD_POD_ID:-}" ]] && echo yes || echo no) TAILSCALE_AUTH_KEY=$([[ -n "${TAILSCALE_AUTH_KEY:-}" ]] && echo yes || echo no)"

base_pid=""
if [[ -x "$BASE_START" ]]; then
    log "Starting base image services: ${BASE_START}"
    "$BASE_START" &
    base_pid=$!
    log "Base image services pid=${base_pid}"
else
    log "WARNING: base start script not present/executable: ${BASE_START}"
fi

bootstrap_path="$REPO_PATH/scripts/bootstrap_tailscale.sh"
deadline=$((SECONDS + WAIT_SECONDS))
while [[ ! -f "$bootstrap_path" ]] && (( SECONDS < deadline )); do
    sleep 1
done

if [[ ! -f "$bootstrap_path" ]]; then
    reason="bootstrap script not found after ${WAIT_SECONDS}s: ${bootstrap_path}"
    log "ERROR: ${reason}"
    mark_failed "$reason"
else
    log "Bootstrapping Tailscale from ${REPO_PATH}"
    set +e
    bash "$bootstrap_path"
    tailscale_rc=$?
    set -e
    if [[ $tailscale_rc -eq 0 ]]; then
        date -u +'%Y-%m-%dT%H:%M:%SZ' > "$READY_FILE" 2>/dev/null || true
        log "Worker networking is ready"
    else
        reason="tailscale bootstrap failed rc=${tailscale_rc}"
        log "ERROR: ${reason}; keeping container alive for diagnostics"
        mark_failed "$reason"
    fi
fi

if [[ -S "${KRITI_TAILSCALE_SOCKET:-/var/run/tailscale/tailscaled.sock}" ]]; then
    log "Tailscale socket present"
else
    log "Tailscale socket not present"
fi

# Never let a Tailscale/bootstrap failure terminate the container. Keep base
# services alive for RunPod diagnostics. If the base service exits, preserve the
# container with an idle process so logs/status files remain inspectable.
if [[ -n "$base_pid" ]]; then
    set +e
    wait "$base_pid"
    base_rc=$?
    set -e
    log "Base image services exited rc=${base_rc}; keeping container alive for diagnostics"
fi

exec sleep infinity
