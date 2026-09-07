# RunPod Lifecycle Automation

Kriti can now manage the lifecycle of an existing RunPod Pod through the official
RunPod REST API v1.

## Required local configuration

Set these on the Windows control machine or other trusted orchestrator host:

```text
KRITI_RUNPOD_POD_ID=<your-pod-id>
RUNPOD_API_KEY=<your-api-key>
```

Optional settings:

```text
KRITI_RUNPOD_API_BASE_URL=https://rest.runpod.io/v1
KRITI_RUNPOD_REQUEST_TIMEOUT_SECONDS=30
KRITI_RUNPOD_POLL_INTERVAL_SECONDS=5
KRITI_WORKER_HOSTNAME=kriti-runpod
```

Never commit the real API key.

## Current scope

`RunPodProvider` can:

- query an existing Pod
- start/resume a stopped Pod
- stop a running Pod
- wait for RunPod to report `desiredStatus=RUNNING`

It does not yet connect to the worker, start Tailscale, run the Kriti preflight,
execute `Chapter_Agent.py`, download artifacts, or guarantee shutdown around a
render job. Those behaviors belong to later transport/orchestration slices.

## Cost safety

The lifecycle unit tests use mocked API responses only. Running the test suite
cannot start or stop a real RunPod Pod. A real Pod is contacted only when a
caller constructs `RunPodProvider` without a mocked request function and invokes
a lifecycle method with a valid Pod ID and `RUNPOD_API_KEY`.
