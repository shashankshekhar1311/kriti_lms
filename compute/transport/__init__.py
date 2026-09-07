"""Worker transport abstractions.

Transport implementations are introduced separately from compute lifecycle so
Tailscale/SSH decisions do not leak into provider or rendering code.
"""

from .base import WorkerTransport
from .tailscale import TailscaleTransport, TailscaleTransportConfig

__all__ = ["WorkerTransport", "TailscaleTransport", "TailscaleTransportConfig"]
