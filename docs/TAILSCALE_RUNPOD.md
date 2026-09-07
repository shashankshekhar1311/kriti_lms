# Tailscale bootstrap on RunPod

Kriti uses Tailscale as a private worker-control network so a RunPod pod does not
need a stable public IP address. The RunPod container tested for Kriti does not
provide `systemd` or `/dev/net/tun`, so the bootstrap uses Tailscale's userspace
networking mode rather than a kernel TUN device.

## Bootstrap

Tailscale must already be installed in the RunPod image/container. The bootstrap
script does not install packages.

Store the Tailscale auth key in RunPod Secrets or another runtime secret source,
then expose it to the container as `TAILSCALE_AUTH_KEY`. Do not commit a real key
to `.env`, Git, logs, screenshots, or documentation.

```bash
cd /workspace/kriti_lms
export TAILSCALE_AUTH_KEY='...'
export KRITI_WORKER_HOSTNAME='kriti-runpod'
bash scripts/bootstrap_tailscale.sh
```

Expected final line resembles:

```text
[TAILSCALE] READY hostname=kriti-runpod ip=100.x.y.z socket=/var/run/tailscale/tailscaled.sock state=/workspace/tailscale/tailscaled.state
```

The script never prints the auth key.

## Persistent identity

The default state file is:

```text
/workspace/tailscale/tailscaled.state
```

Keeping state under `/workspace` allows the same stopped/restarted RunPod pod to
reuse its Tailscale node identity when that storage survives the restart. The
auth key is therefore normally needed only for initial enrollment or if the
persistent state is lost.

For the migration from the initial manual Kriti setup, if persistent state does
not yet exist but `/var/lib/tailscale/tailscaled.state` does, the bootstrap copies
that state into `/workspace/tailscale/tailscaled.state`. It never deletes the
legacy state file.

## Idempotent restart behavior

On each worker startup the script:

1. verifies `tailscale` and `tailscaled` are installed;
2. creates state/runtime directories if missing;
3. migrates legacy state only when needed;
4. reuses an already-reachable daemon;
5. otherwise launches `tailscaled --tun=userspace-networking` manually;
6. reuses an authenticated node if it already has a Tailscale IPv4 address;
7. otherwise enrolls with `TAILSCALE_AUTH_KEY` and the configured hostname.

This script does not use `systemctl`, does not require `/dev/net/tun`, and does
not change Tailscale ACL policy.

## Configuration

Defaults are appropriate for the current Kriti RunPod layout:

```text
KRITI_TAILSCALE_STATE_DIR=/workspace/tailscale
KRITI_TAILSCALE_STATE_FILE=/workspace/tailscale/tailscaled.state
KRITI_TAILSCALE_RUNTIME_DIR=/var/run/tailscale
KRITI_TAILSCALE_SOCKET=/var/run/tailscale/tailscaled.sock
KRITI_TAILSCALE_LOG=/tmp/kriti-tailscaled.log
KRITI_TAILSCALE_START_TIMEOUT_SECONDS=20
KRITI_TAILSCALE_LEGACY_STATE_FILE=/var/lib/tailscale/tailscaled.state
KRITI_WORKER_HOSTNAME=kriti-runpod
```

`TAILSCALE_BIN` and `TAILSCALED_BIN` can also override executable paths. These
are mainly useful for tests or nonstandard images.

## What this slice does not prove

A successful bootstrap proves that the Tailscale daemon is running and the node
has a tailnet IPv4 address. It does **not** by itself prove that ordinary
OpenSSH/SCP works through Tailscale userspace networking on this RunPod image.
That transport must be validated separately before the Windows orchestrator
uses it for remote command execution or artifact transfer.

The current `compute/transport/tailscale.py` therefore remains a placeholder in
this slice. This avoids making SSH a hidden dependency before it is tested.

## Safe integration test later

When a RunPod integration test is intentionally scheduled, start the pod for the
shortest possible window, run the bootstrap, verify from Windows with:

```powershell
tailscale ping kriti-runpod
```

Then separately test TCP port 22 before enabling SSH transport:

```powershell
Test-NetConnection kriti-runpod -Port 22
```

Stop the pod after the test to avoid idle GPU cost.
