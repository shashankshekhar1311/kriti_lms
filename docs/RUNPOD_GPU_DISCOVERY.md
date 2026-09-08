# RunPod GPU discovery

Kriti can query RunPod from the Windows control plane without starting a Pod.

```powershell
python -m compute.cli gpu list --data-center US-NE-1
```

If `--data-center` is omitted, the command uses `KRITI_RUNPOD_NETWORK_VOLUME_DATA_CENTER_ID` from `.env`.

The command reads `RUNPOD_API_KEY` at runtime and performs read-only GraphQL queries for `gpuTypes` and `dataCenters`. It prints the exact GPU type ID required by `KRITI_RUNPOD_DISPOSABLE_GPU_TYPE_IDS`, VRAM, Secure Cloud on-demand price reported by RunPod, and current stock status for the requested data center.

By default, the output is restricted to Secure Cloud GPU types with reported stock because Kriti's network-volume Pod path requires Secure Cloud. To inspect GPU types offered in the data center even when stock is currently unavailable:

```powershell
python -m compute.cli gpu list --data-center US-NE-1 --include-unavailable
```

This command does not create, start, stop, update, or delete Pods, GPUs, templates, or network volumes.

For Kriti's current network volume, the relevant data center is `US-NE-1`. Availability is point-in-time and should be treated as discovery information rather than a guarantee that a subsequent Pod creation will succeed.
