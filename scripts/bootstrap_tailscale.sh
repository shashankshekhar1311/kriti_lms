#!/usr/bin/env bash
# =============================================================================
# Kriti LMS — Tailscale bootstrap for RunPod containers
#
# RunPod pods may not expose systemd or /dev/net/tun. This script therefore
# starts tailscaled manually in userspace-networking mode and keeps its state on
# persistent storage (default: /workspace/tailscale).
#
# Safe/idempotent behavior:
#   - can install Tailscale automatically when missing
#   - reuses an already-running tailscaled daemon
#   - treats a NeedsLogin daemon as reachable instead of timing out
#   - reuses an already-authenticated node when state is present
#   - requires TAILSCALE_AUTH_KEY only for first-time/re-enrollment
#   - enables Tailscale SSH for the private Windows -> RunPod control path
#   - never prints the auth key
#
# Typical RunPod usage:
#   export TAILSCALE_AUTH_KEY='tskey-auth-...'
#   export KRITI_WORKER_HOSTNAME='kriti-runpod'
#   bash scripts/bootstrap_tailscale.sh
# =============================================================================

set -euo pipefail

TAILSCALE_BIN="${TAILSCALE_BIN:-tailscale}"
TAILSCALED_BIN="${TAILSCALED_BIN:-tailscaled}"
CURL_BIN="${CURL_BIN:-curl}"
STATE_DIR="${KRITI_TAILSCALE_STATE_DIR:-/workspace/tailscale}"
STATE_FILE="${KRITI_TAILSCALE_STATE_FILE:-${STATE_DIR}/tailscaled.state}"
RUNTIME_DIR="${KRITI_TAILSCALE_RUNTIME_DIR:-/var/run/tailscale}"
SOCKET="${KRITI_TAILSCALE_SOCKET:-${RUNTIME_DIR}/tailscaled.sock}"
PID_FILE="${KRITI_TAILSCALE_PID_FILE:-${RUNTIME_DIR}/kriti-tailscaled.pid}"
LOG_FILE="${KRITI_TAILSCALE_LOG:-/tmp/kriti-tailscaled.log}"
HOSTNAME="${KRITI_WORKER_HOSTNAME:-kriti-runpod}"
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

# Preserve the manually-enrolled node identity when migrating from the historic
# default location used during initial RunPod testing. Copy only when the new
# persistent state does not yet exist.
if [[ ! -f "$STATE_FILE" && -f "$LEGACY_STATE_FILE" ]]; then
    cp "$LEGACY_STATE_FILE" "$STATE_FILE"
    chmod 600 "$STATE_FILE" 2>/dev/null || true
    log "Migrated existing Tailscale state to persistent storage: ${STATE_FILE}"
fi

TS=("$TAILSCALE_BIN" "--socket=${SOCKET}")

daemon_process_alive() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid="$(cat "$PID_FILE" 2>/dev/null || true)"
        [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && return 0
    fi

    # A unix socket is created by tailscaled before authentication. This is the
    # key distinction from the old status-based readiness check: `tailscale
    # status` can return non-zero while the daemon is healthy but NeedsLogin.
    [[ -S "$SOCKET" || -e "$SOCKET" ]]
}

if daemon_process_alive; then
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
    until daemon_process_alive; do
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

# `tailscale ip -4` succeeds only when the node is authenticated and has a
# tailnet address. A daemon in NeedsLogin state is therefore handled here rather
# than being mistaken for an unreachable daemon.
if TAILNET_IP="$("${TS[@]}" ip -4 2>/dev/null | head -n 1)" && [[ -n "$TAILNET_IP" ]]; then
    log "Node is already authenticated (${HOSTNAME}, ${TAILNET_IP})"
else
    [[ -n "$AUTH_KEY" ]] || fail "Node is not authenticated and TAILSCALE_AUTH_KEY is not set"

    log "Authenticating node as ${HOSTNAME}"
    # Never echo this command: it contains the auth key.
    "${TS[@]}" up \
        --auth-key="$AUTH_KEY" \
        --hostname="$HOSTNAME" \
        --accept-dns=true \
        >/dev/null

    TAILNET_IP="$("${TS[@]}" ip -4 2>/dev/null | head -n 1 || true)"
    [[ -n "$TAILNET_IP" ]] || fail "Tailscale authentication completed but no IPv4 address was assigned"
fi

if is_enabled "$ENABLE_SSH"; then
    log "Enabling Tailscale SSH"
    "${TS[@]}" set --ssh >/dev/null
fi

# Final proof that the authenticated node still has an address after applying
# preferences. This remains a tailnet/control-plane health check; the Windows
# transport layer separately validates command execution.
TAILNET_IP="$("${TS[@]}" ip -4 2>/dev/null | head -n 1 || true)"
[[ -n "$TAILNET_IP" ]] || fail "Tailscale node lost its IPv4 address during bootstrap"

log "READY hostname=${HOSTNAME} ip=${TAILNET_IP} ssh=${ENABLE_SSH} socket=${SOCKET} state=${STATE_FILE}"
