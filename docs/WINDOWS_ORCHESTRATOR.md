# Windows preflight orchestrator

Kriti's Windows control plane can now compose `RunPodProvider` and
`TailscaleTransport` into one cost-safe preflight workflow.

## Command

Run from the local Kriti repository on Windows:

```powershell
python -m compute.cli preflight
```

The CLI loads the repository-local `.env` file without overwriting variables
already supplied by the Windows environment/secret manager. It resolves the
exact local Git `HEAD`, then performs:

```text
start configured RunPod
  -> wait until RunPod desiredStatus=RUNNING
  -> wait for Tailscale SSH command health
  -> refuse tracked changes on worker
  -> switch worker origin to public HTTPS
  -> fetch origin
  -> checkout exact local commit in detached HEAD
  -> verify worker HEAD equals requested commit
  -> activate RunPod environment
  -> run scripts/runpod_preflight.sh
  -> stop RunPod in finally
```

This slice does not render lessons.

## Automatic Tailscale startup is required

There is a bootstrap dependency between RunPod lifecycle and Tailscale SSH: the
Windows transport cannot reach the worker until `tailscaled` starts inside the
container. `scripts/runpod_startup.sh` closes that gap.

Configure the Kriti RunPod template/pod **Container start command** to:

```text
bash /workspace/kriti_lms/scripts/runpod_startup.sh
```

The wrapper starts `/start.sh` in the background when the base image provides it,
waits for `/workspace/kriti_lms/scripts/bootstrap_tailscale.sh`, runs the existing
userspace Tailscale bootstrap, and then keeps the container alive. This must be
validated once on the real Pod after the PR is merged.

Do not configure the start command until `scripts/runpod_startup.sh` exists in the
worker's persistent checkout.

## Required Windows `.env` values

At minimum:

```env
KRITI_COMPUTE_PROVIDER=runpod
KRITI_RUNPOD_POD_ID=<kept Kriti-runpod pod ID>
RUNPOD_API_KEY=<secret>
KRITI_WORKER_HOSTNAME=kriti-runpod
KRITI_TAILSCALE_SSH_USER=root
```

Useful defaults are already built in and documented in `.env.example`.

`RUNPOD_API_KEY` stays only on Windows. `TAILSCALE_AUTH_KEY` stays in RunPod
Secrets and is exposed to the worker as `TAILSCALE_AUTH_KEY`.

## Git safety

The worker synchronization is intentionally conservative:

- tracked/staged worker changes cause the workflow to stop;
- no `git reset --hard` is used;
- no `git clean` is used;
- untracked render/generated artifacts are preserved;
- the requested commit is checked out in detached HEAD state;
- the worker commit is verified before preflight.

The local CLI also refuses tracked uncommitted Windows changes by default. Use
`--allow-dirty-local` only when you explicitly want the committed `HEAD` while
ignoring local tracked edits.

## Failure and GPU-cost behavior

By default a Pod that Kriti starts is stopped in `finally`, including failures in
RunPod readiness, transport readiness, Git synchronization, or preflight.

For deliberate debugging only:

```powershell
python -m compute.cli preflight --keep-worker-on-failure
```

This can leave billable GPU compute running and should not be the normal path.

To test orchestration against a worker you manually started and bootstrapped:

```powershell
python -m compute.cli preflight --existing-worker
```

In this mode Kriti neither starts nor stops the Pod.

## First live validation after merge

Use the shortest possible paid window:

1. merge this PR and update `/workspace/kriti_lms` to the merged commit;
2. configure the RunPod Container start command shown above;
3. ensure the stale old Tailscale node is removed or `KRITI_WORKER_HOSTNAME`
   matches the active node name;
4. stop the Pod;
5. from Windows run `python -m compute.cli preflight`;
6. confirm the Pod starts, Tailscale SSH becomes healthy, preflight completes,
   and the Pod returns to stopped state automatically.

Only after this succeeds should lesson rendering be added to the orchestrator.
