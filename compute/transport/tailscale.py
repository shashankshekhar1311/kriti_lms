"""Tailscale SSH transport for Kriti RunPod workers.

The live RunPod integration test established that ordinary TCP/22 is not exposed
through the userspace-networking setup, while ``tailscale ssh`` works from the
Windows control machine. This transport therefore invokes the local Tailscale CLI
and deliberately does not depend on OpenSSH/SCP or a stable 100.x address.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shlex
import shutil
import subprocess
from typing import Callable, Sequence

from ..exceptions import (
    TransportCommandError,
    TransportConfigurationError,
    TransportDownloadError,
)
from .base import WorkerTransport


RunFn = Callable[..., subprocess.CompletedProcess]
_HEALTH_MARKER = "KRITI_TAILSCALE_TRANSPORT_OK"


@dataclass(frozen=True)
class TailscaleTransportConfig:
    """Non-secret settings for the Windows -> worker Tailscale SSH path."""

    hostname: str = "kriti-runpod"
    user: str = "root"
    tailscale_bin: str = "tailscale"
    command_timeout_seconds: float = 60.0
    health_timeout_seconds: float = 15.0


class TailscaleTransport(WorkerTransport):
    """Execute commands and stream files through the proven ``tailscale ssh`` path."""

    def __init__(
        self,
        config: TailscaleTransportConfig | None = None,
        *,
        run_fn: RunFn = subprocess.run,
    ) -> None:
        self.config = config or TailscaleTransportConfig()
        self._run_fn = run_fn
        self._validate_config()

    @property
    def target(self) -> str:
        return f"{self.config.user}@{self.config.hostname}"

    def _validate_config(self) -> None:
        if not self.config.hostname.strip():
            raise TransportConfigurationError("Tailscale worker hostname is required")
        if not self.config.user.strip():
            raise TransportConfigurationError("Tailscale SSH user is required")
        if self.config.command_timeout_seconds <= 0:
            raise TransportConfigurationError("command_timeout_seconds must be > 0")
        if self.config.health_timeout_seconds <= 0:
            raise TransportConfigurationError("health_timeout_seconds must be > 0")

        # Only check PATH availability for the normal runtime path. Tests can inject
        # a fake executable by giving an explicit path or a run_fn.
        if (
            self._run_fn is subprocess.run
            and not Path(self.config.tailscale_bin).is_file()
            and shutil.which(self.config.tailscale_bin) is None
        ):
            raise TransportConfigurationError(
                f"Tailscale CLI not found on control machine: {self.config.tailscale_bin}"
            )

    def _ssh_args(self, remote_command: str) -> list[str]:
        return [self.config.tailscale_bin, "ssh", self.target, remote_command]

    def _run_text(self, args: Sequence[str], *, timeout: float) -> subprocess.CompletedProcess:
        try:
            return self._run_fn(
                list(args),
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise TransportCommandError(
                f"Tailscale command timed out after {timeout:g}s"
            ) from exc
        except OSError as exc:
            raise TransportCommandError(f"Unable to launch Tailscale CLI: {exc}") from exc

    def health_check(self) -> bool:
        """Return True only when a non-interactive Tailscale SSH command succeeds."""
        try:
            result = self._run_text(
                self._ssh_args(f"printf %s {_HEALTH_MARKER}"),
                timeout=self.config.health_timeout_seconds,
            )
        except TransportCommandError:
            return False
        return result.returncode == 0 and _HEALTH_MARKER in (result.stdout or "")

    def execute(self, command: str) -> str:
        """Execute a command remotely through Tailscale SSH and return stdout."""
        if not command or not command.strip():
            raise TransportConfigurationError("Remote command must not be empty")

        result = self._run_text(
            self._ssh_args(command),
            timeout=self.config.command_timeout_seconds,
        )
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            detail = f": {stderr[:1000]}" if stderr else ""
            raise TransportCommandError(
                f"Remote command failed with exit code {result.returncode}{detail}"
            )
        return result.stdout or ""

    def download(self, remote_path: str, local_path: str | Path) -> None:
        """Stream one remote file to disk through Tailscale SSH.

        This intentionally avoids ``scp`` because conventional TCP/22 was not
        reachable in the validated RunPod userspace-networking configuration.
        The remote file is never deleted or modified.
        """
        if not remote_path or not remote_path.strip():
            raise TransportConfigurationError("remote_path must not be empty")

        destination = Path(local_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(destination.name + ".part")
        remote_command = f"cat -- {shlex.quote(remote_path)}"

        try:
            with temporary.open("wb") as output:
                result = self._run_fn(
                    self._ssh_args(remote_command),
                    stdout=output,
                    stderr=subprocess.PIPE,
                    timeout=self.config.command_timeout_seconds,
                    check=False,
                )
        except subprocess.TimeoutExpired as exc:
            temporary.unlink(missing_ok=True)
            raise TransportDownloadError(
                f"Download timed out after {self.config.command_timeout_seconds:g}s: {remote_path}"
            ) from exc
        except OSError as exc:
            temporary.unlink(missing_ok=True)
            raise TransportDownloadError(f"Unable to download {remote_path}: {exc}") from exc

        if result.returncode != 0:
            temporary.unlink(missing_ok=True)
            stderr_raw = result.stderr or b""
            if isinstance(stderr_raw, bytes):
                stderr = stderr_raw.decode("utf-8", errors="replace").strip()
            else:
                stderr = str(stderr_raw).strip()
            detail = f": {stderr[:1000]}" if stderr else ""
            raise TransportDownloadError(
                f"Remote download failed with exit code {result.returncode}{detail}"
            )

        temporary.replace(destination)
