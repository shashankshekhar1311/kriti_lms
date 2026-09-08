# RunPod startup diagnostics

Kriti disposable workers use `scripts/runpod_startup.sh` as the RunPod container start command.

The wrapper starts the base RunPod image services first, then attempts Tailscale bootstrap. Tailscale bootstrap failure is intentionally non-fatal: the container remains alive so RunPod SSH, Jupyter, or Web Terminal can be used for diagnosis when the base image services are healthy.

## Persistent diagnostics

Startup output is written to the network volume by default:

```text
/workspace/data/logs/runpod-startup/<RUNPOD_POD_ID>.log
```

The wrapper also writes one of these status markers:

```text
/workspace/data/logs/runpod-startup/<RUNPOD_POD_ID>.tailscale-ready
/workspace/data/logs/runpod-startup/<RUNPOD_POD_ID>.tailscale-failed
```

If the network-volume log directory cannot be created, the wrapper falls back to `/tmp/kriti-runpod-startup` for the current Pod.

The logs record only whether `TAILSCALE_AUTH_KEY` is present. They never print the key value.

`KRITI_STARTUP_LOG_DIR` can override the default log directory.

## Transport timeout

Windows preflight timeout errors include the disposable RunPod Pod ID and expected runtime Tailscale hostname. This makes it possible to correlate the Windows failure with the persistent startup log.

Example:

```text
Tailscale transport did not become ready within 180s (worker_id=<pod-id>, hostname=kriti-worker-<pod-id>)
```

## Diagnostic workflow

For ordinary runs, do not use `--keep-worker-on-failure`; failed disposable workers should be deleted automatically.

For a controlled diagnostic run only, `--keep-worker-on-failure` may be used so the Pod remains available for inspection. Because GPU compute remains billable, inspect the startup log/status quickly and terminate the Pod immediately after collecting evidence.
