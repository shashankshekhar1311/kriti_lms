"""Provider-neutral GPU worker lifecycle interface."""

from __future__ import annotations

from abc import ABC, abstractmethod

from .models import WorkerInfo, WorkerStatus


class ComputeProvider(ABC):
    """Lifecycle contract implemented by GPU compute backends.

    Transport, file transfer, rendering, and lesson orchestration deliberately do
    not belong here. A provider owns only worker lifecycle and readiness.
    """

    @abstractmethod
    def start(self) -> WorkerInfo:
        """Start or resume the configured worker and return its identity."""
        raise NotImplementedError

    @abstractmethod
    def stop(self) -> None:
        """Stop the configured worker."""
        raise NotImplementedError

    @abstractmethod
    def status(self) -> WorkerStatus:
        """Return the provider-neutral current worker status."""
        raise NotImplementedError

    @abstractmethod
    def wait_until_ready(self, timeout: int = 600) -> WorkerInfo:
        """Wait until the worker is usable or raise a readiness error."""
        raise NotImplementedError
