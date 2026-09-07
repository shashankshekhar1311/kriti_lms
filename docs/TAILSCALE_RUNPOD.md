# Tailscale bootstrap on RunPod

Kriti uses Tailscale as a private worker-control network so a RunPod pod does not
need a stable public IP address. The RunPod container tested for Kriti does not
provide `systemd` or `/dev/net/tun`, so the bootstrap uses Tailscale's userspace
networking mode rather than a kernel TUN device.

## Integration result

The live RunPod integration test proved the following path works:

```text
Windows PC
  -> Tailscale tailnet
  -> RunPod userspace tailscaled
  -> Tailscale SSH
  -> root shell on the RunPod container
```

Ordinary TCP port 22 was **not** reachable from Windows and there was no normal
`sshd` listener inside the tested RunPod container. Kriti therefore uses
**Tailscale SSH** for the private control channel instead of assuming conventional
OpenSSH/SCP over the Tailscale address.

## Bootstrap

On fresh RunPod containers, Tailscale may not be installed. By default the
bootstrap now installs it using the official Tailscale install script when the
`tailscale` or `tailscaled` binaries are missing. Set
`KRITI_TAILSCALE_AUTO_INSTALL=0` to require a prebuilt image instead.

Store the Tailscale auth key in RunPod Secrets or another runtime secret source,
then expose it to the container as `TAILSCALE_AUTH_KEY`. Do not commit a real key
to `.env`, Git, logs, screenshots, or documentation.

```bash
cd /workspace/kriti_lms
bash scripts/bootstrap_tailscale.sh
```

Expected final line resembles:

```text
[TAILSCALE] READY hostname=kriti-runpod ip=100.x.y.z ssh=1 socket=/var/run/tailscale/tailscaled.sock state=/workspace/tailscale/tailscaled.state
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

For migration from the initial manual Kriti setup, if persistent state does not
yet exist but `/var/lib/tailscale/tailscaled.state` does, the bootstrap copies
that state into `/workspace/tailscale/tailscaled.state`. It never deletes the
legacy state file.

If an older offline Tailscale device already owns the requested hostname,
Tailscale may assign a suffix such as `kriti-runpod-1`. Remove stale nodes from
the Tailscale admin console when appropriate so the active worker can return to
the canonical `kriti-runpod` name. Automation should not hard-code a historical
100.x address.

## Idempotent restart behavior

On each worker startup the script:

1. checks for `tailscale` and `tailscaled` and installs them when allowed;
2. creates state/runtime directories if missing;
3. migrates legacy state only when needed;
4. reuses an existing daemon when its control socket is present;
5. otherwise launches `tailscaled --tun=userspace-networking` manually;
6. treats a healthy `NeedsLogin` daemon as reachable instead of waiting on
   `tailscale status`;
7. reuses an authenticated node if it already has a Tailscale IPv4 address;
8. otherwise enrolls with `TAILSCALE_AUTH_KEY` and the configured hostname;
9. enables Tailscale SSH with `tailscale set --ssh`;
10. verifies a tailnet IPv4 address still exists before reporting READY.

The script does not use `systemctl`, does not require `/dev/net/tun`, and does
not change Tailscale ACL policy.

## Configuration

Defaults are appropriate for the current Kriti RunPod layout:

```text
KRITI_TAILSCALE_AUTO_INSTALL=1
KRITI_TAILSCALE_ENABLE_SSH=1
KRITI_TAILSCALE_INSTALL_URL=https://tailscale.com/install.sh
KRITI_TAILSCALE_STATE_DIR=/workspace/tailscale
KRITI_TAILSCALE_STATE_FILE=/workspace/tailscale/tailscaled.state
KRITI_TAILSCALE_RUNTIME_DIR=/var/run/tailscale
KRITI_TAILSCALE_SOCKET=/var/run/tailscale/tailscaled.sock
KRITI_TAILSCALE_PID_FILE=/var/run/tailscale/kriti-tailscaled.pid
KRITI_TAILSCALE_LOG=/tmp/kriti-tailscaled.log
KRITI_TAILSCALE_START_TIMEOUT_SECONDS=20
KRITI_TAILSCALE_LEGACY_STATE_FILE=/var/lib/tailscale/tailscaled.state
KRITI_WORKER_HOSTNAME=kriti-runpod
```

`TAILSCALE_BIN`, `TAILSCALED_BIN`, and `CURL_BIN` can override executable paths.
These are mainly useful for tests or nonstandard images.

## Proven manual validation

The integration test successfully used:

```powershell
tailscale ping kriti-runpod-1
tailscale ssh root@kriti-runpod-1
```

The second command opened a root shell on the live RunPod container. In contrast,
`Test-NetConnection <tailscale-ip> -Port 22` failed, which is expected for the
validated userspace/Tailscale-SSH path and is no longer a prerequisite for the
Kriti transport layer.

## Next transport slice

`compute/transport/tailscale.py` can now be implemented around the proven
`tailscale ssh` command for remote execution. Artifact transfer should be
implemented deliberately rather than assuming `scp`; options include streaming
through Tailscale SSH or a small worker-side transfer mechanism.

The transport must still perform its own command-level health check before a
render job. A bootstrap READY result proves Tailscale enrollment and SSH enablement,
not CUDA/model/application readiness.
