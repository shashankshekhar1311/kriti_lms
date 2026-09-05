# RunPod Python / Node environment (Slice 2)

## Virtualenv location

**Chosen:** `/workspace/kriti_lms/.venv`

Reasons:

- Lives on the persistent `/workspace` network volume (survives pod restart)
- Matches the preferred location from the Slice 2 brief
- Already covered by `.gitignore` (`venv/`, `.venv/`)
- Keeps one activate path next to the repo (`source .venv/bin/activate`)

Alternative `/workspace/.venvs/kriti` was not used — no conflict with the preferred path.

## Cache / data env (no secrets)

```bash
export HF_HOME=/workspace/caches/huggingface
export TORCH_HOME=/workspace/caches/torch
export U2NET_HOME=/workspace/caches/rembg
export LIP_SYNC_MODELS_DIR=/workspace/models/lipsync
export KRITI_SOURCE_BOOKS=/workspace/kriti_lms/Source_Books
export KRITI_OUTPUT_DIR=/workspace/data/Rendered_Output
export KRITI_TEMP_DIR=/workspace/temp
```

Helper: `source scripts/activate_runpod.sh`

## Dependency matrix (Slice 2)

| Component | Version / source | Notes |
|-----------|------------------|-------|
| Host driver CUDA | 13.0 (nvidia-smi) | Do not change |
| System torch (reference) | 2.8.0+cu128 | Already CUDA-capable |
| **venv torch** | **2.8.0+cu128** from `download.pytorch.org/whl/cu128` | Do not install CPU torch from PyPI |
| torchvision | 0.23.0+cu128 | Matches torch 2.8 |
| torchaudio | 2.8.0+cu128 | Matches torch 2.8 |
| diffusers | ≥0.32,<0.36 | SDXL-Turbo later (not downloaded in Slice 2) |
| transformers | ≥4.46,<4.52 | HF stack |
| accelerate | ≥1.1,<1.5 | HF stack |
| onnxruntime-gpu | ≥1.20,<1.23 | **Not** `onnxruntime` (CPU) |
| rembg | ≥2.0.50 | After ORT GPU; no U2Net download in Slice 2 |
| edge-tts, anthropic, google-genai, … | per `requirements-runpod.txt` | App deps |
| manim | **skipped** | Unused by Chapter_Agent; heavy |
| Remotion | **4.0.518** locked | `npm ci` in `remotion/` — no upgrade |
| Node | 20.x | Required by Remotion |
| FFmpeg | system 6.1.1 | Keep unless proven broken |

## MIG

MIG is **enabled**. PyTorch sees:

`NVIDIA RTX PRO 6000 Blackwell Server Edition MIG 2g.48gb` (~47 GiB), not the full 96 GB.

Do not disable MIG in this slice.

## Activate

```bash
source /workspace/kriti_lms/scripts/activate_runpod.sh
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

## Slice 3 smoke results (cached models)

| Asset | Location | Notes |
|-------|----------|-------|
| SDXL-Turbo | `/workspace/caches/huggingface/hub/models--stabilityai--sdxl-turbo` (~6.5G) | `stabilityai/sdxl-turbo`, fp16, cuda:0 |
| rembg u2net | `/workspace/caches/rembg/u2net.onnx` (~168M) | CUDAExecutionProvider selected |
| Smoke outputs | `/workspace/temp/slice3_smoke/` | Not production Rendered_Output |

Chromium: apt `chromium` is a snap stub on this image — use **Google Chrome** at `/usr/bin/google-chrome-stable` (symlinked to `/usr/bin/chromium`).

If Hugging Face downloads fail with `hf_transfer` errors, set `HF_HUB_ENABLE_HF_TRANSFER=0` (the activate script does this when `hf_transfer` is missing).
