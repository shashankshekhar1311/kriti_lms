# RunPod REST GPU compatibility

Kriti uses two RunPod discovery surfaces for different questions:

- GraphQL `gpuTypes` plus `dataCenters.gpuAvailability`: what GPU offerings/stock RunPod reports in a data center.
- REST OpenAPI `POST /pods` -> `gpuTypeIds` enum: which exact GPU IDs the REST Pod-create endpoint currently accepts.

These sets are not necessarily identical. In September 2026, US-NE-1 GraphQL discovery reported RTX PRO 6000 Blackwell MIG 48GB and 24GB offerings, while REST `POST /pods` rejected the MIG ID at schema validation. Kriti therefore does not infer that a discoverable MIG offering is REST-provisionable.

## Commands

```powershell
python -m compute.cli gpu list --data-center US-NE-1
python -m compute.cli gpu list --data-center US-NE-1 --rest-compatible-only
```

The `REST` column is computed from RunPod's current OpenAPI schema at command runtime. `REST=YES` means the exact ID is accepted by the current REST request schema; it does not guarantee capacity.

Before a disposable preflight sends `POST /pods`, Kriti validates every configured `KRITI_RUNPOD_DISPOSABLE_GPU_TYPE_IDS` value against the same OpenAPI enum. Invalid/MIG-only IDs fail locally before any Pod creation attempt.

## MIG handling

Kriti does not automatically map a MIG GPU ID to its parent full GPU. Such a mapping could silently change VRAM and hourly cost. If RunPod later exposes MIG IDs in the REST Pod-create schema, they will automatically become `REST=YES` without a hard-coded Kriti allowlist.

RunPod also documents a legacy GraphQL Pod creation API, but Kriti's disposable worker path remains on REST so lifecycle behavior stays consistent. A separate GraphQL provisioning path should only be added after confirming it supports the required network-volume, template, Secure Cloud, and cleanup semantics for Kriti.
