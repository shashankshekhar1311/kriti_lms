# RunPod capacity placement strategy

## Why stopped Pods can fail to restart

RunPod assigns a Pod to a specific physical machine. While the Pod is running,
its GPU is reserved. When the Pod is stopped, the GPU is released but the Pod's
local volume remains associated with that machine. If another user takes the GPU
slot, restarting the same Pod can fail even when the same GPU model exists
elsewhere in RunPod's fleet.

Kriti observed this exact API response during live validation:

```text
There are not enough free GPUs on the host machine to start this pod.
```

This is a placement/capacity condition, not a Tailscale, Git, API-key, or Kriti
rendering failure.

## What Kriti now does

`RunPodProvider.start()` recognizes the known host-capacity error and retries for
a bounded window instead of failing immediately.

Defaults:

```text
KRITI_RUNPOD_CAPACITY_RETRY_TIMEOUT_SECONDS=180
KRITI_RUNPOD_CAPACITY_RETRY_INTERVAL_SECONDS=15
```

That means Kriti can tolerate a short-lived capacity race without requiring the
operator to manually rerun the CLI.

Only the specific capacity condition is retried. Authentication failures, invalid
Pod IDs, API errors, and other start failures still fail immediately.

If capacity is still unavailable after the retry window, Kriti raises a dedicated
`RunPodCapacityUnavailableError` with migration/redeployment guidance.

## Why Kriti does not automatically migrate the existing Pod yet

RunPod's automatic Pod migration feature creates a new Pod with a new Pod ID and
moves data to a machine with an available GPU. The feature is currently handled
by RunPod's migration workflow rather than the Pod start endpoint used by Kriti.

Because the current Kriti Pod relies on host-bound Pod storage, silently creating
a replacement Pod through `POST /pods` would not guarantee that the existing
`/workspace` data is available on that replacement. Kriti therefore does not
automatically terminate or replace the current Pod when capacity is unavailable.

This is intentional data-safety behavior.

## Recommended durable architecture

The long-term solution is to decouple persistent Kriti data from one physical
RunPod machine by placing `/workspace` data on a RunPod network volume.

Target architecture:

```text
Windows orchestrator
      |
      +--> choose/create any compatible available GPU Pod
      |        |
      |        +--> attach Kriti network volume at /workspace
      |        +--> bootstrap Tailscale
      |        +--> sync exact Git SHA
      |        +--> render
      |
      +--> download/verify artifacts
      +--> terminate disposable GPU Pod

RunPod network volume
      +--> repository/work data that must survive worker replacement
      +--> model caches
      +--> rendered outputs pending download
```

With that model, a specific Pod ID is no longer the durable worker identity.
Kriti can provision a replacement Pod on available capacity, attach the same
network volume, and continue without waiting for the original host's GPU.

## Current operator options after retry exhaustion

Until network-volume-backed disposable provisioning is implemented, use one of
these RunPod-supported recovery paths:

1. Use RunPod's automatic Pod migration when the console offers it. Migration
   creates a new Pod ID; update `KRITI_RUNPOD_POD_ID` on Windows afterward.
2. Wait for the original physical host's GPU to become free and rerun the Kriti
   command.
3. Start CPU-only only for data access/recovery; do not use CPU-only mode for
   Kriti rendering.

Do not terminate the existing host-bound Pod until required data is verified on
persistent/network storage or copied elsewhere.

## Next infrastructure slice

After the retry behavior is validated, the preferred next compute-provider slice
is network-volume-backed disposable worker provisioning:

- configure a RunPod template for the Kriti image/startup settings;
- configure a persistent RunPod network volume;
- create a new Pod using GPU type priority `availability`;
- attach the network volume;
- update/discover the worker identity dynamically;
- run the existing Tailscale + exact-Git-SHA orchestration;
- terminate the disposable Pod after artifact verification.

This removes the single-host capacity dependency instead of merely retrying it.
