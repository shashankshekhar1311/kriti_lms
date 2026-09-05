# Windows → RunPod SSH & output download

This guide covers pulling finished Kriti renders from a **running** RunPod GPU
pod onto a Windows PC. It does **not** start or stop the pod for you.

Related files:

- `scripts/download_runpod_outputs.ps1` — incremental downloader (MP4 by default)
- `scripts/runpod_preflight.sh` — read-only readiness check **on the pod**
- `docs/RUNPOD.md` — filesystem / env layout on the pod

## Why OpenSSH `ssh` + `scp` (not rsync)

Modern Windows 10/11 include the **OpenSSH Client** (`ssh.exe`, `scp.exe`).
`rsync` is **not** installed by default on Windows and is not a Kriti
dependency, so this project uses native OpenSSH only:

1. `ssh` lists remote files (size + relative path) under `Rendered_Output`
2. Local size is compared to remote size
3. `scp` copies only **missing** or **size-changed** files

That gives incremental, non-destructive syncs without Cygwin, WSL, or Chocolatey.

## Prerequisites

1. **RunPod pod must be running** (SSH port open).
2. **Windows OpenSSH Client** installed  
   Settings → Apps → Optional features → OpenSSH Client  
   Or: `Get-WindowsCapability -Online -Name OpenSSH.Client*`
3. An **SSH private key** that RunPod accepts (or password auth, not recommended).
4. Local disk space for videos under your chosen output folder.

## Find the RunPod SSH host and port

In the RunPod web UI, open your pod → **Connect** → **SSH**.

You will see something like:

```text
ssh root@<HOST> -p <PORT>
```

- `<HOST>` → `-Host` / `KRITI_RUNPOD_HOST`
- `<PORT>` → `-Port` / `KRITI_RUNPOD_PORT` (often a high port, not 22)

Do **not** commit real hosts, ports, or keys to Git.

## Test SSH manually

From PowerShell:

```powershell
ssh -p <PORT> root@<HOST>
```

With an explicit key:

```powershell
ssh -p <PORT> -i "$env:USERPROFILE\.ssh\id_ed25519" root@<HOST>
```

Once connected, confirm the render tree exists:

```bash
ls -la /workspace/kriti_lms/Rendered_Output
find /workspace/kriti_lms/Rendered_Output -name 'output.mp4' | head
exit
```

## SSH key configuration (recommended)

1. Generate a key on Windows (if you do not already have one):

   ```powershell
   ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519"
   ```

2. Add the **public** key in RunPod (account / pod SSH keys UI), **or** append
   it to `~/.ssh/authorized_keys` on the pod.

3. Keep the **private** key only on your PC.

**Never commit private keys** (`id_ed25519`, `id_rsa`, `*.pem`, `*.ppk`) to this
repository. See `.gitignore`.

Optional `~/.ssh/config` snippet (paths are examples only):

```sshconfig
Host kriti-runpod
    HostName <HOST>
    Port <PORT>
    User root
    IdentityFile ~/.ssh/id_ed25519
```

Then you can use `-Host kriti-runpod -Port <PORT>` or rely on config defaults.

## Downloader usage

Script path (from the repo root on Windows):

```powershell
cd <path-to-kriti_lms>
.\scripts\download_runpod_outputs.ps1 `
    -Host "<RUNPOD_HOST>" `
    -Port <RUNPOD_PORT> `
    -User "root"
```

With identity file:

```powershell
.\scripts\download_runpod_outputs.ps1 `
    -Host "<RUNPOD_HOST>" `
    -Port <RUNPOD_PORT> `
    -User "root" `
    -IdentityFile "$env:USERPROFILE\.ssh\id_ed25519"
```

Custom local folder:

```powershell
.\scripts\download_runpod_outputs.ps1 `
    -Host "<RUNPOD_HOST>" `
    -Port <RUNPOD_PORT> `
    -LocalPath "E:\Kriti\Rendered_Output"
```

### Default behavior

| Behavior | Detail |
|----------|--------|
| Files | `*.mp4` only |
| Layout | Preserves `Class/Subject/Chapter/Micro_Lesson_N/output.mp4` |
| Incremental | Skips local files whose **size** matches remote |
| Updates | Re-downloads when remote size differs |
| Deletes | **Never** deletes local or remote files |

Defaults:

- Remote: `/workspace/kriti_lms/Rendered_Output`
- Local: `E:\Kriti\Rendered_Output`
- User: `root`

### `-AllArtifacts`

Downloads **all files** under the remote `Rendered_Output` tree (storyboards,
audio, props, logs, images, etc.), still incremental and non-destructive.

```powershell
.\scripts\download_runpod_outputs.ps1 `
    -Host "<RUNPOD_HOST>" `
    -Port <RUNPOD_PORT> `
    -AllArtifacts
```

### `-DryRun`

Lists what would be downloaded or updated; transfers nothing.

```powershell
.\scripts\download_runpod_outputs.ps1 `
    -Host "<RUNPOD_HOST>" `
    -Port <RUNPOD_PORT> `
    -DryRun
```

## Windows environment variables (optional)

These are **Windows-side** variables (system/user env or the current PowerShell
session). They are **not** read from the Linux `.env` on the pod.

| Variable | Purpose |
|----------|---------|
| `KRITI_RUNPOD_HOST` | SSH hostname |
| `KRITI_RUNPOD_PORT` | SSH port |
| `KRITI_RUNPOD_USER` | SSH user (default `root`) |
| `KRITI_RUNPOD_REMOTE_OUTPUT` | Remote `Rendered_Output` path |
| `KRITI_LOCAL_OUTPUT` | Local destination folder |

Example (current session only):

```powershell
$env:KRITI_RUNPOD_HOST = "<HOST>"
$env:KRITI_RUNPOD_PORT = "<PORT>"
.\scripts\download_runpod_outputs.ps1
```

## When the RunPod pod is stopped

- The downloader **cannot connect** (connection refused / timeout).
- **Start the pod** in the RunPod UI first.
- Rendered files remain on the **persistent volume** under
  `/workspace/kriti_lms/Rendered_Output` (or your configured output path).
- After the pod is online, run the downloader again.

Stopping the pod does **not** erase persistent `/workspace` data.

## Recommended workflow

### START RUNPOD

1. Start the pod in RunPod.
2. On the pod:

   ```bash
   cd /workspace/kriti_lms
   source .venv/bin/activate
   source scripts/activate_runpod.sh
   ./scripts/runpod_preflight.sh
   ```

3. Render chapters with `Chapter_Agent.py` as usual.
4. On **Windows**, pull videos:

   ```powershell
   .\scripts\download_runpod_outputs.ps1 `
       -Host "<RUNPOD_HOST>" `
       -Port <RUNPOD_PORT> `
       -User "root"
   ```

5. Verify MP4s locally (player / Explorer).
6. **Stop the RunPod pod** when idle to avoid unnecessary GPU cost.

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `ssh` / `scp` not found | Install Windows OpenSSH Client optional feature |
| Connection refused / timeout | Pod stopped? Wrong host/port? Firewall? |
| Authentication failure | Wrong key; public key not on RunPod; try `-IdentityFile` |
| Wrong port | Copy port from RunPod Connect → SSH (often not 22) |
| Pod stopped | Start pod; volume data remains; retry download |
| Permission denied (remote) | Confirm user is `root` (or has read access to `Rendered_Output`) |
| Local path issues | Script creates `LocalPath` if missing; ensure drive letter exists (`E:`) |
| Transfer interrupted | Re-run the same command; already-complete sizes are skipped |
| Host key prompt / failure | First connect may store host key; delete stale entry in `known_hosts` if the pod IP was reused |

## Safety guarantees

The downloader will **never**:

- delete remote files
- delete local files
- modify application source on the pod
- stop/restart the RunPod pod
- embed passwords or private keys in the repo
