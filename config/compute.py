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
    runpod_api_base_url: str = "https://rest.runpod.io/v1"
    runpod_request_timeout_seconds: float = 30.0
    runpod_poll_interval_seconds: float = 5.0
    runpod_capacity_retry_timeout_seconds: float = 180.0
    runpod_capacity_retry_interval_seconds: float = 15.0
    worker_hostname: str = "kriti-runpod"
    worker_repo_path: str = "/workspace/kriti_lms"
    git_remote_url: str = "https://github.com/shashankshekhar1311/kriti_lms.git"
    provider_ready_timeout_seconds: float = 600.0
    transport_ready_timeout_seconds: float = 180.0
    transport_poll_interval_seconds: float = 5.0
    tailscale_ssh_user: str = "root"
    tailscale_command_timeout_seconds: float = 60.0
    tailscale_health_timeout_seconds: float = 15.0


def _env_float(name: str, default: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be numeric, got {raw!r}") from exc
    if value < 0:
        raise ValueError(f"{name} must be >= 0")
    return value


def load_compute_config() -> ComputeConfig:
    """Load provider-neutral, non-secret compute settings from the environment."""
    return ComputeConfig(
        provider=(os.getenv("KRITI_COMPUTE_PROVIDER") or "runpod").strip().lower(),
        runpod_pod_id=(os.getenv("KRITI_RUNPOD_POD_ID") or "").strip() or None,
        runpod_api_base_url=(
            os.getenv("KRITI_RUNPOD_API_BASE_URL") or "https://rest.runpod.io/v1"
        ).strip(),
        runpod_request_timeout_seconds=_env_float(
            "KRITI_RUNPOD_REQUEST_TIMEOUT_SECONDS", 30.0
        ),
        runpod_poll_interval_seconds=_env_float(
            "KRITI_RUNPOD_POLL_INTERVAL_SECONDS", 5.0
        ),
        runpod_capacity_retry_timeout_seconds=_env_float(
            "KRITI_RUNPOD_CAPACITY_RETRY_TIMEOUT_SECONDS", 180.0
        ),
        runpod_capacity_retry_interval_seconds=_env_float(
            "KRITI_RUNPOD_CAPACITY_RETRY_INTERVAL_SECONDS", 15.0
        ),
        worker_hostname=(os.getenv("KRITI_WORKER_HOSTNAME") or "kriti-runpod").strip(),
        worker_repo_path=(os.getenv("KRITI_WORKER_REPO_PATH") or "/workspace/kriti_lms").strip(),
        git_remote_url=(
            os.getenv("KRITI_GIT_REMOTE_URL")
            or "https://github.com/shashankshekhar1311/kriti_lms.git"
        ).strip(),
        provider_ready_timeout_seconds=_env_float(
            "KRITI_PROVIDER_READY_TIMEOUT_SECONDS", 600.0
        ),
        transport_ready_timeout_seconds=_env_float(
            "KRITI_TRANSPORT_READY_TIMEOUT_SECONDS", 180.0
        ),
        transport_poll_interval_seconds=_env_float(
            "KRITI_TRANSPORT_POLL_INTERVAL_SECONDS", 5.0
        ),
        tailscale_ssh_user=(os.getenv("KRITI_TAILSCALE_SSH_USER") or "root").strip(),
        tailscale_command_timeout_seconds=_env_float(
            "KRITI_TAILSCALE_COMMAND_TIMEOUT_SECONDS", 60.0
        ),
        tailscale_health_timeout_seconds=_env_float(
            "KRITI_TAILSCALE_HEALTH_TIMEOUT_SECONDS", 15.0
        ),
    )
