"""Provider-independent transport interface for communicating with a worker."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class WorkerTransport(ABC):
    """Communication contract intentionally separate from worker provisioning."""

    @abstractmethod
    def health_check(self) -> bool:
        """Return True when the remote worker is reachable through this transport."""
        raise NotImplementedError

    @abstractmethod
    def execute(self, command: str) -> str:
        """Execute a command on the worker and return textual output."""
        raise NotImplementedError

    @abstractmethod
    def download(self, remote_path: str, local_path: str | Path) -> None:
        """Download a remote artifact without deleting the source."""
        raise NotImplementedError
