# Kriti LMS Compute Architecture

## Purpose

Kriti's lesson-generation and rendering pipeline should not depend directly on a
specific GPU host. The compute layer separates worker lifecycle from transport
and from the existing rendering/business logic.

## Current architecture

```text
Windows control plane
    |
    +--> RunPodProvider (REST API v1 lifecycle)
    |
    +--> TailscaleTransport (`tailscale ssh`)
              |
              +--> RunPod worker bootstrap
              |      -> userspace tailscaled
              |      -> persistent state under /workspace/tailscale
              |      -> Tailscale SSH enabled
              |
              +--> remote command execution
              +--> command-level health check
              +--> non-destructive single-file download

Existing rendering pipeline
    -> unchanged
```

### ComputeProvider responsibilities

A compute provider owns only worker lifecycle:

- start/resume a worker
- stop a worker
- report provider-neutral status
- wait until the provider control plane reports the worker as running

It does not own Tailscale, file transfer, rendering, lesson orchestration, or
artifact validation.

### WorkerTransport responsibilities

A transport owns communication with an already provisioned worker:

- connectivity/health checks
- remote command execution
- non-destructive artifact download

Transport is separate from provisioning so later compute backends can reuse or
replace the control channel without changing rendering/business logic.

## Slice 1 — provider-neutral foundation

Slice 1 introduced the provider and transport contracts without changing
`Chapter_Agent.py`, lesson synchronization, lip sync, Remotion, artifact
generation, or the existing manual RunPod workflow.

## Slice 2A — RunPod lifecycle

`RunPodProvider` manages an existing Pod using RunPod's REST API v1:

- `GET /pods/{podId}` for status
- `POST /pods/{podId}/start` to start/resume
- `POST /pods/{podId}/stop` to stop

Starting an already-running Pod and stopping an already-stopped Pod are no-ops.
A terminated Pod is never resumed. `wait_until_ready()` proves only RunPod
control-plane state, not application readiness.

## Slice 2B — Tailscale worker bootstrap

`scripts/bootstrap_tailscale.sh` prepares the private worker network after a
RunPod container starts. The live RunPod environment established these design
constraints:

- no `systemd` dependency;
- no `/dev/net/tun` dependency;
- `tailscaled --tun=userspace-networking`;
- persistent node state under `/workspace/tailscale`;
- automatic Tailscale installation on fresh containers when allowed;
- `NeedsLogin` is treated as a live daemon state rather than a startup failure;
- first enrollment uses runtime `TAILSCALE_AUTH_KEY`;
- Tailscale SSH is enabled automatically.

The live test also established that conventional TCP/22 was not reachable and no
normal `sshd` listener was present, while `tailscale ssh root@<worker>` succeeded
from Windows. Tailscale SSH is therefore the intended private control path.

See `docs/TAILSCALE_RUNPOD.md` for bootstrap details.

## Slice 2C — TailscaleTransport

`compute/transport/tailscale.py` implements `WorkerTransport` using the Tailscale
CLI installed on the Windows control machine.

`health_check()` runs a small non-interactive command through `tailscale ssh` and
returns true only when the remote marker is received. This proves the actual
command path, not merely that a Tailscale node appears in `tailscale status`.

`execute(command)` invokes:

```text
tailscale ssh <user>@<worker-hostname> <command>
```

and returns stdout. A non-zero remote exit or timeout raises a transport-specific
exception.

`download(remote_path, local_path)` deliberately does not use SCP. It streams one
remote file with `cat` through Tailscale SSH into a local `.part` file and atomically
renames it after a successful transfer. The remote source is never deleted.
Directory/multi-file artifact synchronization remains an orchestration/artifact
slice rather than being hidden inside this primitive transport operation.

The transport addresses the worker by hostname, not by a historical 100.x IP.
Stale Tailscale device entries should be removed so the active worker can use the
canonical `KRITI_WORKER_HOSTNAME=kriti-runpod` identity.

## Configuration

RunPod lifecycle settings are read through `config/compute.py`:

- `KRITI_COMPUTE_PROVIDER`
- `KRITI_RUNPOD_POD_ID`
- `KRITI_RUNPOD_API_BASE_URL`
- `KRITI_RUNPOD_REQUEST_TIMEOUT_SECONDS`
- `KRITI_RUNPOD_POLL_INTERVAL_SECONDS`
- `KRITI_WORKER_HOSTNAME`

Tailscale transport settings on the Windows control machine are:

- `KRITI_TAILSCALE_SSH_USER` (default `root`)
- `KRITI_TAILSCALE_COMMAND_TIMEOUT_SECONDS` (default `60`)
- `KRITI_TAILSCALE_HEALTH_TIMEOUT_SECONDS` (default `15`)

The Windows control machine must have the Tailscale CLI installed, be logged into
the same tailnet, and be allowed by Tailscale SSH policy.

The RunPod credential is read from `RUNPOD_API_KEY` at runtime. `TAILSCALE_AUTH_KEY`
is a worker-side enrollment secret and should remain in RunPod Secrets/runtime
environment rather than Git.

## Tests

- `test_runpod_provider.py`: mocked RunPod lifecycle tests.
- `test_tailscale_bootstrap.py`: isolated bootstrap tests with fake Tailscale binaries.
- `test_tailscale_transport.py`: isolated subprocess tests for health, command
  execution, failures/timeouts, binary download, atomic rename, and configuration.

None of these tests starts a RunPod GPU or contacts the real tailnet.

## Planned next slices

1. Build a Windows-side orchestrator/CLI that composes `RunPodProvider` and
   `TailscaleTransport`.
2. Add exact Git commit synchronization plus existing `runpod_preflight.sh` wiring.
3. Add artifact-set verification/checksums and failure-safe shutdown with optional
   keep-worker-on-failure behavior.
4. Wire the orchestrator to the existing chapter/render pipeline without changing
   lesson-generation semantics.
