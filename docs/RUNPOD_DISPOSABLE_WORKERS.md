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
    -> bootstrap Tailscale
    -> sync exact Git commit
    -> run preflight/render
    -> download/verify outputs
    -> DELETE disposable Pod

RunPod network volume
    -> /workspace/kriti_lms
    -> /workspace/caches
    -> /workspace/models
    -> /workspace/data
    -> /workspace/tailscale
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
5. Verify at least repository, caches/models needed by Kriti, source books, rendered
   output awaiting download, and `/workspace/tailscale` state.
6. Verify the destination Pod can run `bootstrap_tailscale.sh`, Git status, and
   `runpod_preflight.sh`.
7. Only after verification may the old host-bound Pod be retired.

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
KRITI_RUNPOD_DISPOSABLE_CONTAINER_DISK_GB=50
```

`KRITI_RUNPOD_DISPOSABLE_IMAGE_NAME` is available as a fallback when no template
is used, but a template is preferred for Kriti because the worker also needs
Tailscale/secret/startup configuration.

The provider sends RunPod:

```text
cloudType=SECURE
gpuTypePriority=availability
dataCenterPriority=availability
networkVolumeId=<configured volume>
volumeMountPath=/workspace
```

## Preflight with a disposable worker

Once the network volume has been seeded and the template has been validated:

```powershell
python -m compute.cli preflight --disposable-worker --allow-dirty-local
```

The existing orchestrator owns cost safety. It calls provider `stop()` in `finally`.
For `RunPodDisposableProvider`, `stop()` means **DELETE the Pod**, not merely stop it.
The network volume remains intact.

Do not use `--keep-worker-on-failure` in routine operation because it deliberately
keeps the billable disposable GPU worker alive for debugging.

## Tailscale identity

`/workspace/tailscale/tailscaled.state` should live on the network volume. This lets
a replacement container reuse the existing Tailscale node identity instead of
creating another hostname suffix on every worker.

Only one Kriti disposable worker should use the same Tailscale state at a time.
The current orchestrator is deliberately one-worker-at-a-time.

## Scope boundary

This slice implements network-volume creation/inspection and disposable Pod
provisioning/deletion. It does not automatically copy the old host-bound workspace
into a new network volume and does not create or modify RunPod templates.

Those are explicit operator-controlled migration steps because they affect durable
data and billable infrastructure.
