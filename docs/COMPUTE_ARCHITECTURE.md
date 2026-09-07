# Kriti LMS Compute Architecture

## Purpose

Kriti's lesson-generation and rendering pipeline should not depend directly on a
specific GPU host. The compute layer separates worker lifecycle from transport
and from the existing rendering/business logic.

## Current architecture

```text
ComputeProvider
    -> RunPodProvider (REST API v1 lifecycle implemented)

RunPod worker bootstrap
    -> Tailscale userspace daemon + persistent node state implemented

WorkerTransport
    -> TailscaleTransport (remote execution/download still placeholder)

Existing rendering pipeline
    -> unchanged
```

### ComputeProvider responsibilities

A compute provider owns only worker lifecycle:

- start/resume a worker
- stop a worker
- report provider-neutral status
- wait until the provider control plane reports the worker as running

It does not own SSH/Tailscale, file transfer, rendering, lesson orchestration,
or artifact validation.

### WorkerTransport responsibilities

A transport owns communication with an already provisioned worker:

- connectivity/health checks
- remote command execution
- non-destructive artifact download

Transport is kept separate so a RunPod worker can later use either public SSH
or Tailscale without changing rendering code.

## Slice 1 — provider-neutral foundation

Slice 1 introduced the provider and transport contracts without changing
`Chapter_Agent.py`, lesson synchronization, lip sync, Remotion, artifact
generation, or the existing manual RunPod workflow.

## Slice 2A — RunPod lifecycle

`RunPodProvider` manages an existing Pod using RunPod's REST API v1:

- `GET /pods/{podId}` for status
- `POST /pods/{podId}/start` to start/resume
- `POST /pods/{podId}/stop` to stop

The implementation is intentionally idempotent from Kriti's perspective:
starting an already-running Pod and stopping an already-stopped Pod are no-ops.
A terminated Pod is never resumed.

`wait_until_ready()` polls RunPod until `desiredStatus=RUNNING`. This is only a
**control-plane readiness check**. It does not prove that Tailscale/SSH, CUDA,
Python dependencies, models, or the Kriti pipeline are ready.

## Slice 2B — Tailscale RunPod bootstrap

`scripts/bootstrap_tailscale.sh` prepares the private worker network after a
RunPod container starts. It reflects the actual Kriti RunPod environment already
validated manually:

- no `systemd` dependency;
- no `/dev/net/tun` dependency;
- `tailscaled --tun=userspace-networking`;
- persistent node state under `/workspace/tailscale` by default;
- optional migration from `/var/lib/tailscale/tailscaled.state`;
- reuse of an already-running daemon and authenticated node;
- first-time enrollment through runtime `TAILSCALE_AUTH_KEY`;
- auth key is never printed by the bootstrap script.

A successful bootstrap means the daemon is reachable and the worker has a
Tailscale IPv4 address. It intentionally does **not** claim that ordinary
OpenSSH/SCP works through Tailscale userspace networking. That transport must be
validated before `TailscaleTransport` is wired for command execution/downloads.

See `docs/TAILSCALE_RUNPOD.md` for operational details.

## Configuration

RunPod lifecycle settings are read through `config/compute.py`:

- `KRITI_COMPUTE_PROVIDER`
- `KRITI_RUNPOD_POD_ID`
- `KRITI_RUNPOD_API_BASE_URL`
- `KRITI_RUNPOD_REQUEST_TIMEOUT_SECONDS`
- `KRITI_RUNPOD_POLL_INTERVAL_SECONDS`
- `KRITI_WORKER_HOSTNAME`

The RunPod credential is read from `RUNPOD_API_KEY` at runtime.

Tailscale bootstrap settings include:

- `TAILSCALE_AUTH_KEY` (secret; runtime only)
- `KRITI_TAILSCALE_STATE_DIR`
- `KRITI_TAILSCALE_STATE_FILE`
- `KRITI_TAILSCALE_RUNTIME_DIR`
- `KRITI_TAILSCALE_SOCKET`
- `KRITI_TAILSCALE_LOG`
- `KRITI_TAILSCALE_START_TIMEOUT_SECONDS`
- `KRITI_TAILSCALE_LEGACY_STATE_FILE`
- `KRITI_WORKER_HOSTNAME`

Secrets must remain in environment/secret management and must never be committed.

## Tests

`test_runpod_provider.py` tests lifecycle behavior entirely with mocked RunPod API
responses.

`test_tailscale_bootstrap.py` executes the real bootstrap script against fake
`tailscale` and `tailscaled` binaries in temporary directories. It does not use
the network, contact Tailscale, or start a RunPod pod. It covers first enrollment,
idempotent restart, missing-auth-key failure, persistent-state arguments, secret
redaction from output, and legacy-state migration.

## Planned next slices

1. Validate worker transport on a short-lived RunPod integration test (Tailscale
   ping plus TCP/SSH reachability) and only then implement command/download
   transport.
2. Add a Windows-side orchestrator/CLI around the existing chapter pipeline.
3. Add commit-SHA sync, transport health, and existing RunPod preflight wiring.
4. Add artifact verification and failure-safe shutdown with optional
   keep-worker-on-failure behavior.
