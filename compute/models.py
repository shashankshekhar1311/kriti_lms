"""Shared data models for compute providers."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping


class WorkerState(str, Enum):
    """Provider-neutral lifecycle state for a compute worker."""

    UNKNOWN = "unknown"
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


@dataclass(frozen=True)
class WorkerInfo:
    """Provider-neutral information needed to identify and reach a worker."""

    worker_id: str
    provider: str
    state: WorkerState
    hostname: str | None = None
    public_ip: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class WorkerStatus:
    """Current worker status returned by a compute provider."""

    worker_id: str | None
    provider: str
    state: WorkerState
    message: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    @property
    def ready(self) -> bool:
        return self.state is WorkerState.RUNNING
