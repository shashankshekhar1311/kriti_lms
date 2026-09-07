"""Tailscale transport placeholder for the next implementation slice.

The RunPod worker uses Tailscale userspace networking because containerized pods
may not expose /dev/net/tun. No auth key or secret belongs in this module.
"""

from __future__ import annotations

from pathlib import Path

from .base import WorkerTransport


class TailscaleTransport(WorkerTransport):
    """Interface placeholder; remote execution wiring is deferred from Slice 1."""

    def health_check(self) -> bool:
        raise NotImplementedError("Tailscale transport is not enabled in Slice 1")

    def execute(self, command: str) -> str:
        del command
        raise NotImplementedError("Tailscale transport is not enabled in Slice 1")

    def download(self, remote_path: str, local_path: str | Path) -> None:
        del remote_path, local_path
        raise NotImplementedError("Tailscale transport is not enabled in Slice 1")
