"""Worker transport abstractions.

Transport implementations are introduced separately from compute lifecycle so
Tailscale/SSH decisions do not leak into provider or rendering code.
"""

from .base import WorkerTransport

__all__ = ["WorkerTransport"]
