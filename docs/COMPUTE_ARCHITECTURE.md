# Kriti LMS Compute Architecture

## Purpose

Kriti's lesson-generation and rendering pipeline should not depend directly on a
specific GPU host. The compute layer separates worker lifecycle from transport
and from the existing rendering/business logic.

## Slice 1

Slice 1 is intentionally non-invasive. It introduces provider-neutral contracts
and a RunPod provider boundary without automating pod lifecycle or changing
`Chapter_Agent.py`, lesson synchronization, lip sync, Remotion, artifact
generation, or the existing manual RunPod workflow.

```text
ComputeProvider
    -> RunPodProvider

WorkerTransport
    -> TailscaleTransport (placeholder in Slice 1)

Existing rendering pipeline
    -> unchanged
```

### ComputeProvider responsibilities

A compute provider owns only worker lifecycle:

- start/resume a worker
- stop a worker
- report provider-neutral status
- wait until the worker is ready

It does not own SSH/Tailscale, file transfer, rendering, lesson orchestration,
or artifact validation.

### WorkerTransport responsibilities

A transport owns communication with an already provisioned worker:

- connectivity/health checks
- remote command execution
- non-destructive artifact download

Transport is kept separate so a RunPod worker can later use either public SSH
or Tailscale without changing rendering code.

## RunPod behavior in Slice 1

`RunPodProvider` is a safe skeleton. API-backed start/stop/status/readiness is
deferred. Calling lifecycle automation raises a clear configuration error and
the existing manual start/stop process remains authoritative.

## Secrets

No RunPod API key or Tailscale auth key is stored in the compute package or in
Git. Later slices must read credentials from environment variables or an
external secret store.

## Planned next slices

1. Add RunPod API lifecycle implementation and explicit readiness polling.
2. Add Tailscale userspace bootstrap/transport for RunPod containers.
3. Add a Windows-side orchestrator/CLI around the existing chapter pipeline.
4. Add failure-safe shutdown, artifact verification, and optional
   keep-worker-on-failure behavior.
