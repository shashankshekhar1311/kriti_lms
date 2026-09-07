"""Compute configuration helpers for Kriti LMS.

Only non-secret configuration is resolved here. Provider API tokens and
Tailscale auth keys must be supplied through environment/secret management and
must never be committed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ComputeConfig:
    provider: str = "runpod"
    runpod_pod_id: str | None = None
    worker_hostname: str = "kriti-runpod"


def load_compute_config() -> ComputeConfig:
    """Load provider-neutral, non-secret compute settings from the environment."""
    return ComputeConfig(
        provider=(os.getenv("KRITI_COMPUTE_PROVIDER") or "runpod").strip().lower(),
        runpod_pod_id=(os.getenv("KRITI_RUNPOD_POD_ID") or "").strip() or None,
        worker_hostname=(os.getenv("KRITI_WORKER_HOSTNAME") or "kriti-runpod").strip(),
    )
