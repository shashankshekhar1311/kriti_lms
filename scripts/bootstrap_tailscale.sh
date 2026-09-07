#!/usr/bin/env bash
# =============================================================================
# Kriti LMS — Tailscale bootstrap for RunPod containers
#
# RunPod pods may not expose systemd or /dev/net/tun. This script therefore
# starts tailscaled manually in userspace-networking mode and keeps its state on
# persistent storage (default: /workspace/tailscale).
#
# Safe/idempotent behavior:
#   - reuses an already-running tailscaled daemon when reachable
#   - reuses an already-authenticated node when state is present
#   - requires TAILSCALE_AUTH_KEY only for first-time/re-enrollment
#   - never prints the auth key
#   - never installs Tailscale or modifies firewall/ACL policy
#
# Typical RunPod usage:
#   export TAILSCALE_AUTH_KEY='tskey-auth-...'
#   export KRITI_WORKER_HOSTNAME='kriti-runpod'
#   bash scripts/bootstrap_tailscale.sh
# =============================================================================

set -euo pipefail

TAILSCALE_BIN="${TAILSCALE_BIN:-tailscale}"
TAILSCALED_BIN="${TAILSCALED_BIN:-tailscaled}"
STATE_DIR="${KRITI_TAILSCALE_STATE_DIR:-/workspace/tailscale}"
STATE_FILE="${KRITI_TAILSCALE_STATE_FILE:-${STATE_DIR}/tailscaled.state}"
RUNTIME_DIR="${KRITI_TAILSCALE_RUNTIME_DIR:-/var/run/tailscale}"
SOCKET="${KRITI_TAILSCALE_SOCKET:-${RUNTIME_DIR}/tailscaled.sock}"
LOG_FILE="${KRITI_TAILSCALE_LOG:-/tmp/kriti-tailscaled.log}"
HOSTNAME="${KRITI_WORKER_HOSTNAME:-kriti-runpod}"
AUTH_KEY="${TAILSCALE_AUTH_KEY:-}"
LEGACY_STATE_FILE="${KRITI_TAILSCALE_LEGACY_STATE_FILE:-/var/lib/tailscale/tailscaled.state}"
START_TIMEOUT_SECONDS="${KRITI_TAILSCALE_START_TIMEOUT_SECONDS:-20}"

log() { printf '[TAILSCALE] %s\n' "$*"; }
fail() { printf '[TAILSCALE][FAIL] %s\n' "$*" >&2; exit 1; }

command -v "$TAILSCALE_BIN" >/dev/null 2>&1 || fail "tailscale CLI not found: ${TAILSCALE_BIN}"
command -v "$TAILSCALED_BIN" >/dev/null 2>&1 || fail "tailscaled daemon not found: ${TAILSCALED_BIN}"

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

daemon_reachable() {
    "${TS[@]}" status >/dev/null 2>&1
}

if daemon_reachable; then
    log "tailscaled is already reachable; reusing existing daemon"
else
    log "Starting tailscaled in userspace-networking mode"
    nohup "$TAILSCALED_BIN" \
        --tun=userspace-networking \
        --state="$STATE_FILE" \
        --socket="$SOCKET" \
        >"$LOG_FILE" 2>&1 &

    deadline=$((SECONDS + START_TIMEOUT_SECONDS))
    until daemon_reachable; do
        if (( SECONDS >= deadline )); then
            tail -n 30 "$LOG_FILE" 2>/dev/null || true
            fail "tailscaled did not become reachable within ${START_TIMEOUT_SECONDS}s"
        fi
        sleep 1
    done
fi

# `tailscale ip -4` succeeds only when the node is authenticated and has a
# tailnet address. This avoids parsing human-readable `tailscale status` output.
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

log "READY hostname=${HOSTNAME} ip=${TAILNET_IP} socket=${SOCKET} state=${STATE_FILE}"
