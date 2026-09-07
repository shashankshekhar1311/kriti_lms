#!/usr/bin/env bash
# =============================================================================
# Kriti LMS — Tailscale bootstrap for RunPod containers
#
# Fixed workers can set KRITI_WORKER_HOSTNAME and retain persistent Tailscale
# state under /workspace/tailscale. Disposable workers intentionally do not set
# KRITI_WORKER_HOSTNAME: when RUNPOD_POD_ID is present, this script derives a
# unique hostname (kriti-worker-<pod-id>) and keeps Tailscale state on ephemeral
# container storage so deleting the Pod also deletes its Tailscale identity.
# =============================================================================

set -euo pipefail

TAILSCALE_BIN="${TAILSCALE_BIN:-tailscale}"
TAILSCALED_BIN="${TAILSCALED_BIN:-tailscaled}"
CURL_BIN="${CURL_BIN:-curl}"
EXPLICIT_HOSTNAME="${KRITI_WORKER_HOSTNAME:-}"
RUNPOD_ID="${RUNPOD_POD_ID:-}"
HOSTNAME_PREFIX="${KRITI_WORKER_HOSTNAME_PREFIX:-kriti-worker}"

sanitize_hostname() {
    local value="$1"
    value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//')"
    [[ -n "$value" ]] || value="kriti-worker"
    if [[ ! "$value" =~ ^[a-z] ]]; then
        value="k-${value}"
    fi
    printf '%.63s' "$value" | sed -E 's/-+$//'
}

DISPOSABLE_IDENTITY=0
if [[ -n "$EXPLICIT_HOSTNAME" ]]; then
    HOSTNAME="$(sanitize_hostname "$EXPLICIT_HOSTNAME")"
elif [[ -n "$RUNPOD_ID" ]]; then
    HOSTNAME="$(sanitize_hostname "${HOSTNAME_PREFIX}-${RUNPOD_ID}")"
    DISPOSABLE_IDENTITY=1
else
    HOSTNAME="kriti-runpod"
fi

if (( DISPOSABLE_IDENTITY )); then
    DEFAULT_STATE_DIR="/tmp/kriti-tailscale-${RUNPOD_ID}"
else
    DEFAULT_STATE_DIR="/workspace/tailscale"
fi

STATE_DIR="${KRITI_TAILSCALE_STATE_DIR:-$DEFAULT_STATE_DIR}"
STATE_FILE="${KRITI_TAILSCALE_STATE_FILE:-${STATE_DIR}/tailscaled.state}"
RUNTIME_DIR="${KRITI_TAILSCALE_RUNTIME_DIR:-/var/run/tailscale}"
SOCKET="${KRITI_TAILSCALE_SOCKET:-${RUNTIME_DIR}/tailscaled.sock}"
PID_FILE="${KRITI_TAILSCALE_PID_FILE:-${RUNTIME_DIR}/kriti-tailscaled.pid}"
LOG_FILE="${KRITI_TAILSCALE_LOG:-/tmp/kriti-tailscaled.log}"
AUTH_KEY="${TAILSCALE_AUTH_KEY:-}"
LEGACY_STATE_FILE="${KRITI_TAILSCALE_LEGACY_STATE_FILE:-/var/lib/tailscale/tailscaled.state}"
START_TIMEOUT_SECONDS="${KRITI_TAILSCALE_START_TIMEOUT_SECONDS:-20}"
AUTO_INSTALL="${KRITI_TAILSCALE_AUTO_INSTALL:-1}"
ENABLE_SSH="${KRITI_TAILSCALE_ENABLE_SSH:-1}"
INSTALL_URL="${KRITI_TAILSCALE_INSTALL_URL:-https://tailscale.com/install.sh}"

log() { printf '[TAILSCALE] %s\n' "$*"; }
fail() { printf '[TAILSCALE][FAIL] %s\n' "$*" >&2; exit 1; }

is_enabled() {
    case "${1,,}" in
        1|true|yes|on) return 0 ;;
        *) return 1 ;;
    esac
}

install_tailscale_if_needed() {
    if command -v "$TAILSCALE_BIN" >/dev/null 2>&1 && command -v "$TAILSCALED_BIN" >/dev/null 2>&1; then
        return 0
    fi

    is_enabled "$AUTO_INSTALL" || fail "tailscale/tailscaled not found and KRITI_TAILSCALE_AUTO_INSTALL is disabled"
    command -v "$CURL_BIN" >/dev/null 2>&1 || fail "curl is required to install Tailscale automatically"

    log "Tailscale is not installed; installing from the official Tailscale installer"
    "$CURL_BIN" -fsSL "$INSTALL_URL" | sh

    command -v "$TAILSCALE_BIN" >/dev/null 2>&1 || fail "tailscale CLI still not found after installation: ${TAILSCALE_BIN}"
    command -v "$TAILSCALED_BIN" >/dev/null 2>&1 || fail "tailscaled daemon still not found after installation: ${TAILSCALED_BIN}"
}

install_tailscale_if_needed
mkdir -p "$STATE_DIR" "$RUNTIME_DIR"

# Legacy-state migration is for the fixed worker only. Disposable workers must
# never inherit a persistent Tailscale machine identity from the shared volume.
if (( ! DISPOSABLE_IDENTITY )) && [[ ! -f "$STATE_FILE" && -f "$LEGACY_STATE_FILE" ]]; then
    cp "$LEGACY_STATE_FILE" "$STATE_FILE"
    chmod 600 "$STATE_FILE" 2>/dev/null || true
    log "Migrated existing Tailscale state to persistent storage: ${STATE_FILE}"
fi

TS=("$TAILSCALE_BIN" "--socket=${SOCKET}")

daemon_reachable() {
    [[ -S "$SOCKET" || -e "$SOCKET" ]] || return 1
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid="$(cat "$PID_FILE" 2>/dev/null || true)"
        [[ -n "$pid" ]] || return 1
        kill -0 "$pid" 2>/dev/null || return 1
    fi
    return 0
}

if daemon_reachable; then
    log "tailscaled is already reachable; reusing existing daemon"
else
    rm -f "$SOCKET" "$PID_FILE" 2>/dev/null || true
    log "Starting tailscaled in userspace-networking mode"
    nohup "$TAILSCALED_BIN" \
        --tun=userspace-networking \
        --state="$STATE_FILE" \
        --socket="$SOCKET" \
        >"$LOG_FILE" 2>&1 &
    daemon_pid=$!
    printf '%s\n' "$daemon_pid" > "$PID_FILE"

    deadline=$((SECONDS + START_TIMEOUT_SECONDS))
    until daemon_reachable; do
        if ! kill -0 "$daemon_pid" 2>/dev/null; then
            tail -n 30 "$LOG_FILE" 2>/dev/null || true
            fail "tailscaled exited before creating its control socket"
        fi
        if (( SECONDS >= deadline )); then
            tail -n 30 "$LOG_FILE" 2>/dev/null || true
            fail "tailscaled did not create its control socket within ${START_TIMEOUT_SECONDS}s"
        fi
        sleep 1
    done
fi

if TAILNET_IP="$("${TS[@]}" ip -4 2>/dev/null | head -n 1)" && [[ -n "$TAILNET_IP" ]]; then
    log "Node is already authenticated (${HOSTNAME}, ${TAILNET_IP})"
else
    [[ -n "$AUTH_KEY" ]] || fail "Node is not authenticated and TAILSCALE_AUTH_KEY is not set"

    log "Authenticating node as ${HOSTNAME}"
    "${TS[@]}" up \
        --auth-key="$AUTH_KEY" \
        --hostname="$HOSTNAME" \
        --accept-dns=true \
        >/dev/null

    TAILNET_IP="$("${TS[@]}" ip -4 2>/dev/null | head -n 1 || true)"
    [[ -n "$TAILNET_IP" ]] || fail "Tailscale authentication completed but no IPv4 address was assigned"
fi

# Enforce the expected name even when an existing fixed-worker state was reused.
"${TS[@]}" set --hostname="$HOSTNAME" >/dev/null

if is_enabled "$ENABLE_SSH"; then
    log "Enabling Tailscale SSH"
    "${TS[@]}" set --ssh >/dev/null
fi

TAILNET_IP="$("${TS[@]}" ip -4 2>/dev/null | head -n 1 || true)"
[[ -n "$TAILNET_IP" ]] || fail "Tailscale node lost its IPv4 address during bootstrap"

log "READY hostname=${HOSTNAME} ip=${TAILNET_IP} ssh=${ENABLE_SSH} socket=${SOCKET} state=${STATE_FILE} disposable=${DISPOSABLE_IDENTITY}"
