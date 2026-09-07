# RunPod filesystem layout for Kriti LMS
#
# Goal: keep the git repo lean, and put books / outputs / model caches on the
# persistent network volume (`/workspace` on typical RunPod GPU pods).
#
# This document does not hardcode `/workspace` into application code. Paths are
# selected via environment variables (see `.env.example`).

## After starting the RunPod pod

Bootstrap Tailscale first so the worker rejoins the private Kriti control network:

```bash
cd /workspace/kriti_lms
bash scripts/bootstrap_tailscale.sh
```

The script is idempotent, runs `tailscaled` manually in userspace-networking mode,
keeps node state under `/workspace/tailscale` by default, and only requires
`TAILSCALE_AUTH_KEY` for first enrollment or if persistent state is lost. See
**[TAILSCALE_RUNPOD.md](./TAILSCALE_RUNPOD.md)**.

Then run the existing **read-only readiness check**. It does **not** start or stop
the RunPod pod, install packages, download models, or run `Chapter_Agent.py`.

```bash
cd /workspace/kriti_lms
source .venv/bin/activate
source scripts/activate_runpod.sh
./scripts/runpod_preflight.sh
```

Expect `KRITI RUNPOD IS READY` (exit 0) when GPU, caches, tools, and at least
one LLM API key are available. Warnings (for example a dirty git tree or
missing Wav2Lip checkout) do not fail the check by themselves.

## Download renders to Windows (then stop the pod)

After chapters finish rendering, pull MP4s to your PC with the Windows
OpenSSH downloader — see **[RUNPOD_SSH.md](./RUNPOD_SSH.md)** for SSH setup,
keys, and troubleshooting.

Typical loop:

1. Start the RunPod pod  
2. Bootstrap Tailscale  
3. Preflight + render on the pod  
4. On Windows: `.\scripts\download_runpod_outputs.ps1 -Host "<HOST>" -Port <PORT>`  
5. Verify videos locally  
6. Stop the pod to save GPU cost  

The current downloader still uses OpenSSH/SCP. Tailscale-level connectivity is
separate from proving TCP/SSH transport through userspace networking; that
transport validation remains a later step.

Default remote tree: `/workspace/kriti_lms/Rendered_Output`  
Default local tree: `E:\Kriti\Rendered_Output` (configurable)

## Recommended layout

```text
/workspace/
  kriti_lms/                 # git clone (this repository)
  tailscale/
    tailscaled.state         # persistent Tailscale node identity
  caches/
    huggingface/             # HF_HOME
    torch/                   # TORCH_HOME
    rembg/                   # U2NET_HOME (rembg / u2net weights)
  models/
    lipsync/                 # LIP_SYNC_MODELS_DIR (Wav2Lip clone + checkpoints)
  data/
    Source_Books/            # KRITI_SOURCE_BOOKS
    Rendered_Output/         # KRITI_OUTPUT_DIR
  temp/                      # KRITI_TEMP_DIR
  .env                       # optional: keep secrets here or in kriti_lms/.env
```

Prepare empty directories (non-destructive):

```bash
bash /workspace/kriti_lms/scripts/prepare_runpod_dirs.sh
```

## Environment

Copy `.env.example` → `kriti_lms/.env` and uncomment the RunPod paths, for example:

```bash
KRITI_SOURCE_BOOKS=/workspace/data/Source_Books
KRITI_OUTPUT_DIR=/workspace/data/Rendered_Output
KRITI_TEMP_DIR=/workspace/temp
HF_HOME=/workspace/caches/huggingface
TORCH_HOME=/workspace/caches/torch
U2NET_HOME=/workspace/caches/rembg
LIP_SYNC_MODELS_DIR=/workspace/models/lipsync
```

Also set `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` as needed. Keep `RUNPOD_API_KEY`
and `TAILSCALE_AUTH_KEY` in runtime secret storage rather than committed files.

## Backward compatibility

If those variables are **unset**, the app continues to use:

| Role | Default |
|------|---------|
| Source PDFs | `<repo>/Source_Books` |
| Outputs | `<repo>/Rendered_Output` |
| Temp | `<repo>/temp` |
| Lip-sync models | `<repo>/models` |
| HF / Torch / rembg | Library defaults under the user home |

Existing PDFs already under `kriti_lms/Source_Books/` keep working without migration.
To use `/workspace/data/Source_Books`, either copy/symlink books there or point
`KRITI_SOURCE_BOOKS` at the existing folder.

## Path resolution

Central module: `config/paths.py`.

Imported early by `Chapter_Agent.py` (before torch/rembg) and by
`lip_sync_service.py` so cache environment variables take effect.

## Activate GPU environment

```bash
source /workspace/kriti_lms/scripts/activate_runpod.sh
```

Recommended path defaults for this host are documented in `docs/RUNPOD_ENV.md`.
