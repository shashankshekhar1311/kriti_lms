# Kriti LMS Compute Architecture

## Purpose

Kriti's lesson-generation and rendering pipeline should not depend directly on a
specific GPU host. The compute layer separates worker lifecycle from transport
and from the existing rendering/business logic.

## Current architecture

```text
ComputeProvider
    -> RunPodProvider (REST API v1 lifecycle implemented)

WorkerTransport
    -> TailscaleTransport (placeholder; next slice)

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

`RunPodProvider` now manages an existing Pod using RunPod's REST API v1:

- `GET /pods/{podId}` for status
- `POST /pods/{podId}/start` to start/resume
- `POST /pods/{podId}/stop` to stop

The implementation is intentionally idempotent from Kriti's perspective:
starting an already-running Pod and stopping an already-stopped Pod are no-ops.
A terminated Pod is never resumed.

`wait_until_ready()` polls RunPod until `desiredStatus=RUNNING`. This is only a
**control-plane readiness check**. It does not prove that Tailscale/SSH, CUDA,
Python dependencies, models, or the Kriti pipeline are ready. Those checks stay
in the transport and preflight/orchestration layers.

The provider uses only the Python standard library for HTTP, so no additional
runtime dependency is required.

## Configuration

Non-secret settings are read through `config/compute.py`:

- `KRITI_COMPUTE_PROVIDER`
- `KRITI_RUNPOD_POD_ID`
- `KRITI_RUNPOD_API_BASE_URL`
- `KRITI_RUNPOD_REQUEST_TIMEOUT_SECONDS`
- `KRITI_RUNPOD_POLL_INTERVAL_SECONDS`
- `KRITI_WORKER_HOSTNAME`

The RunPod credential is read from `RUNPOD_API_KEY` at runtime. It must be kept
in the local environment or secret management and must never be committed.

## Tests

`test_runpod_provider.py` exercises lifecycle behavior entirely with mocked API
responses, so the tests cannot start or stop a real Pod. Coverage includes:

- missing configuration
- RUNNING / EXITED status mapping
- idempotent start and stop
- stopped-to-running resume flow
- terminated Pod protection
- readiness polling
- readiness timeout

## Planned next slices

1. Add Tailscale userspace bootstrap/transport for RunPod containers.
2. Add a Windows-side orchestrator/CLI around the existing chapter pipeline.
3. Add commit-SHA sync, transport health, and existing RunPod preflight wiring.
4. Add artifact verification and failure-safe shutdown with optional
   keep-worker-on-failure behavior.
