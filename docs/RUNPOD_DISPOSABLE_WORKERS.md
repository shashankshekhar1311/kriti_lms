# RunPod network volume + disposable workers

## Purpose

The original Kriti RunPod uses host-bound Pod storage. Stopping that Pod releases
its GPU but leaves the Pod tied to the original physical machine. If that GPU is
occupied later, the Pod may not restart even when compatible GPUs exist elsewhere.

The durable model is:

```text
Windows control plane
    -> provision fresh GPU Pod using availability priority
    -> attach persistent RunPod network volume at /workspace
    -> derive unique Tailscale hostname from RUNPOD_POD_ID
    -> bootstrap Tailscale with ephemeral node state
    -> sync exact Git commit
    -> run preflight/render
    -> download/verify outputs
    -> DELETE disposable Pod

RunPod network volume
    -> /workspace/kriti_lms
    -> /workspace/caches
    -> /workspace/models
    -> /workspace/data
```

Deleting the Pod must not delete the network volume.

## RunPod constraints reflected in this slice

RunPod network volumes for Pods:

- are available only in Secure Cloud;
- replace the normal Pod volume and normally mount at `/workspace`;
- must be attached when the Pod is created;
- cannot be attached/detached later without deleting the Pod;
- are located in a specific data center, so GPU choices are limited to capacity in
  that volume's data center.

A single network volume removes dependence on one physical host but not dependence
on its data center. Multi-region resilience is a future replication problem; data
does not automatically synchronize between network volumes.

## One-time network volume creation

Set non-secret values in Windows `.env`:

```env
KRITI_RUNPOD_NETWORK_VOLUME_NAME=kriti-workspace
KRITI_RUNPOD_NETWORK_VOLUME_SIZE_GB=100
KRITI_RUNPOD_NETWORK_VOLUME_DATA_CENTER_ID=<chosen secure-cloud data center>
```

Then explicitly create billable storage:

```powershell
python -m compute.cli volume create --confirm-create
```

The command prints the new volume ID. Store that ID locally:

```env
KRITI_RUNPOD_NETWORK_VOLUME_ID=<returned id>
```

The CLI intentionally refuses creation without `--confirm-create` because network
volume charges continue independently of GPU compute.

## One-time migration from the current host-bound Pod

Do not terminate the current Kriti Pod until required data has been verified on the
network volume.

The current host-bound `/workspace` cannot be attached to another Pod. Migration is
therefore an explicit copy operation. A safe sequence is:

1. Create the destination network volume.
2. Deploy a temporary destination Pod with that network volume attached.
3. Start the current source Pod when its GPU becomes available, or use RunPod's
   supported CPU/data-recovery path if appropriate.
4. Copy required `/workspace` content using RunPod-supported `runpodctl`, rsync, or
   the network-volume S3-compatible API.
5. Verify repository, caches/models needed by Kriti, source books, and rendered
   output awaiting download.
6. Do **not** migrate `/workspace/tailscale/tailscaled.state` for disposable workers.
   Each disposable worker must authenticate as its own short-lived Tailscale node.
7. Verify the destination Pod can run `bootstrap_tailscale.sh`, Git status, and
   `runpod_preflight.sh`.
8. Only after verification may the old host-bound Pod be retired.

Do not use `git reset --hard` or `git clean` as part of migration. Preserve the
known untracked render/background assets unless intentionally archived elsewhere.

## Disposable worker configuration

Prefer a RunPod template so image settings, ports, RunPod Secret references, and
container-start behavior are centrally controlled.

```env
KRITI_RUNPOD_NETWORK_VOLUME_ID=<volume id>
KRITI_RUNPOD_DISPOSABLE_TEMPLATE_ID=<template id>
KRITI_RUNPOD_DISPOSABLE_GPU_TYPE_IDS=<gpu-type-id-1>,<gpu-type-id-2>
KRITI_RUNPOD_DISPOSABLE_GPU_COUNT=1
KRITI_RUNPOD_DISPOSABLE_NAME_PREFIX=kriti-worker
KRITI_RUNPOD_DISPOSABLE_HOSTNAME_PREFIX=kriti-worker
KRITI_RUNPOD_DISPOSABLE_CONTAINER_DISK_GB=50
```

`KRITI_WORKER_HOSTNAME` remains the manual target only for the legacy fixed-Pod
workflow. It is not used as the disposable worker's runtime destination.

`KRITI_RUNPOD_DISPOSABLE_IMAGE_NAME` is available as a fallback when no template
is used, but a template is preferred for Kriti because the worker also needs
Tailscale/secret/startup configuration.

### Disposable template identity rule

When the disposable RunPod template is created, **do not copy these fixed-worker
environment variables into it**:

```text
KRITI_WORKER_HOSTNAME
KRITI_TAILSCALE_STATE_DIR=/workspace/tailscale
KRITI_TAILSCALE_STATE_FILE=/workspace/tailscale/tailscaled.state
```

The bootstrap intentionally detects disposable mode only when an explicit
`KRITI_WORKER_HOSTNAME` is absent and `RUNPOD_POD_ID` is present. It then derives
the unique runtime hostname and selects ephemeral Tailscale state automatically.

The template should still contain the RunPod Secret reference for
`TAILSCALE_AUTH_KEY` plus the ordinary Tailscale/bootstrap settings that do not pin
a machine identity.

The provider sends RunPod:

```text
cloudType=SECURE
gpuTypePriority=availability
dataCenterPriority=availability
networkVolumeId=<configured volume>
volumeMountPath=/workspace
```

## Dynamic Tailscale identity

RunPod exposes `RUNPOD_POD_ID` inside every Pod. For disposable workers Kriti uses
that provider-assigned ID as the stable rendezvous key for the lifetime of that
Pod.

Example:

```text
RunPod Pod ID:  abc123
hostname prefix: kriti-worker
Tailscale name:  kriti-worker-abc123
```

The same derivation is implemented on both sides:

- `RunPodDisposableProvider` derives the expected hostname from the returned Pod ID;
- `bootstrap_tailscale.sh` derives the same hostname from `RUNPOD_POD_ID` when no
  explicit `KRITI_WORKER_HOSTNAME` is configured;
- the orchestrator waits for RunPod readiness, receives `WorkerInfo.hostname`, then
  creates the Tailscale transport for that exact runtime hostname.

Disposable Tailscale state defaults to:

```text
/tmp/kriti-tailscale-<RUNPOD_POD_ID>/tailscaled.state
```

It intentionally does **not** live on the shared network volume. Persisting one
`tailscaled.state` across disposable Pods would cause later Pods to reuse the old
Tailscale machine identity and reintroduce hostname collisions.

For the existing fixed worker, an explicit `KRITI_WORKER_HOSTNAME` keeps the prior
persistent-state behavior under `/workspace/tailscale` unless overridden.

## Preflight with a disposable worker

Once the network volume has been seeded and the template has been validated:

```powershell
python -m compute.cli preflight --disposable-worker --allow-dirty-local
```

Expected control flow:

```text
create Pod
  -> RunPod returns Pod ID
  -> derive kriti-worker-<pod-id>
  -> wait for provider RUNNING
  -> Tailscale bootstrap registers same hostname
  -> Windows creates transport for returned hostname
  -> exact Git sync + preflight
  -> delete Pod in finally
```

The existing orchestrator owns cost safety. It calls provider `stop()` in `finally`.
For `RunPodDisposableProvider`, `stop()` means **DELETE the Pod**, not merely stop it.
The network volume remains intact.

Do not use `--keep-worker-on-failure` in routine operation because it deliberately
keeps the billable disposable GPU worker alive for debugging.

## Tailscale auth-key guidance

The RunPod template should continue to reference `TAILSCALE_AUTH_KEY` through a
RunPod Secret rather than embedding the key. Disposable workers authenticate on
each new Pod because their node state is ephemeral. A reusable tagged/pre-approved
key can support this model; an ephemeral Tailscale auth key is also appropriate for
short-lived container workloads when operationally convenient.

Using a Tailscale auth key configured for ephemeral nodes is preferred for the
final disposable-worker template because stale device records are then cleaned up
more naturally after a Pod is deleted.

## Scope boundary

This slice automates runtime worker identity and transport discovery. It does not
automatically copy the old host-bound workspace into the new network volume and it
does not create or modify RunPod templates.

Those remain explicit operator-controlled migration steps because they affect
durable data and billable infrastructure.
