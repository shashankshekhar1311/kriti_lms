"""Windows-side orchestration for Kriti RunPod preflight jobs.

This module composes ComputeProvider and WorkerTransport without coupling either
abstraction to rendering logic. The first orchestrator slice intentionally stops
at repository synchronization plus the existing read-only RunPod preflight.
"""

from __future__ import annotations

from dataclasses import dataclass
import shlex
import time
from typing import Callable

from .models import WorkerInfo
from .provider import ComputeProvider
from .transport.base import WorkerTransport


class OrchestrationError(RuntimeError):
    """Raised when the control-plane workflow cannot complete safely."""


class WorkerTransportTimeout(OrchestrationError):
    """Raised when Tailscale transport does not become reachable in time."""


class DirtyWorkerError(OrchestrationError):
    """Raised when tracked worker changes would be overwritten by Git sync."""


TransportFactory = Callable[[WorkerInfo], WorkerTransport]


@dataclass(frozen=True)
class PreflightRequest:
    """Inputs for one safe worker preflight run."""

    commit_sha: str
    repo_path: str = "/workspace/kriti_lms"
    git_remote_url: str = "https://github.com/shashankshekhar1311/kriti_lms.git"
    provider_ready_timeout_seconds: int = 600
    transport_ready_timeout_seconds: int = 180
    transport_poll_interval_seconds: float = 5.0
    keep_worker_on_failure: bool = False
    start_worker: bool = True


@dataclass(frozen=True)
class PreflightResult:
    worker_id: str
    commit_sha: str
    preflight_output: str
    worker_hostname: str | None = None


class PreflightOrchestrator:
    """Start, synchronize, preflight, and safely stop a Kriti worker.

    A static transport is used for fixed/existing workers. Disposable workers can
    instead supply ``transport_factory`` so the provider's runtime WorkerInfo
    (including its unique hostname) determines the Tailscale SSH destination.
    """

    def __init__(
        self,
        provider: ComputeProvider,
        transport: WorkerTransport | None = None,
        *,
        transport_factory: TransportFactory | None = None,
        sleep_fn: Callable[[float], None] = time.sleep,
        monotonic_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        if transport is None and transport_factory is None:
            raise ValueError("transport or transport_factory is required")
        self.provider = provider
        self.transport = transport
        self.transport_factory = transport_factory
        self._sleep = sleep_fn
        self._monotonic = monotonic_fn

    def _require_transport(self) -> WorkerTransport:
        if self.transport is None:
            raise OrchestrationError("Worker transport has not been resolved")
        return self.transport

    def _wait_for_transport(
        self,
        timeout: int,
        poll_interval: float,
        *,
        worker_id: str | None = None,
        worker_hostname: str | None = None,
    ) -> None:
        if timeout <= 0:
            raise ValueError("transport_ready_timeout_seconds must be > 0")
        transport = self._require_transport()
        deadline = self._monotonic() + timeout
        while True:
            if transport.health_check():
                return
            if self._monotonic() >= deadline:
                context: list[str] = []
                if worker_id:
                    context.append(f"worker_id={worker_id}")
                if worker_hostname:
                    context.append(f"hostname={worker_hostname}")
                suffix = f" ({', '.join(context)})" if context else ""
                raise WorkerTransportTimeout(
                    f"Tailscale transport did not become ready within {timeout}s{suffix}"
                )
            self._sleep(max(0.0, poll_interval))

    @staticmethod
    def _q(value: str) -> str:
        return shlex.quote(value)

    def _sync_exact_commit(self, request: PreflightRequest) -> None:
        transport = self._require_transport()
        repo = self._q(request.repo_path)
        remote = self._q(request.git_remote_url)
        sha = self._q(request.commit_sha)

        # Ignore untracked render artifacts, but never overwrite tracked changes.
        dirty = transport.execute(
            f"cd {repo} && "
            "if ! git diff --quiet || ! git diff --cached --quiet; then "
            "printf DIRTY; fi"
        ).strip()
        if dirty:
            raise DirtyWorkerError(
                "Worker repository has tracked local changes; refusing to checkout another commit"
            )

        # Public HTTPS remote avoids depending on ephemeral GitHub SSH keys.
        transport.execute(f"cd {repo} && git remote set-url origin {remote}")
        transport.execute(f"cd {repo} && git fetch --prune origin")
        transport.execute(f"cd {repo} && git cat-file -e {sha}^{{commit}}")
        transport.execute(f"cd {repo} && git checkout --detach {sha}")
        actual = transport.execute(f"cd {repo} && git rev-parse HEAD").strip()
        if actual.lower() != request.commit_sha.lower():
            raise OrchestrationError(
                f"Worker checkout mismatch: expected {request.commit_sha}, got {actual or '<empty>'}"
            )

    def _run_preflight(self, request: PreflightRequest) -> str:
        transport = self._require_transport()
        repo = self._q(request.repo_path)
        command = (
            f"cd {repo} && "
            "source .venv/bin/activate && "
            "source scripts/activate_runpod.sh && "
            "bash scripts/runpod_preflight.sh"
        )
        return transport.execute(f"bash -lc {self._q(command)}")

    def run(self, request: PreflightRequest) -> PreflightResult:
        if not request.commit_sha.strip():
            raise ValueError("commit_sha is required")

        worker_id = "existing-worker"
        worker_hostname: str | None = None
        worker_started = False
        failure: BaseException | None = None

        try:
            if request.start_worker:
                worker = self.provider.start()
                worker_started = True
                worker_id = worker.worker_id
                ready_worker = self.provider.wait_until_ready(
                    request.provider_ready_timeout_seconds
                )
                worker_hostname = ready_worker.hostname or worker.hostname
                if self.transport_factory is not None:
                    self.transport = self.transport_factory(ready_worker)

            self._wait_for_transport(
                request.transport_ready_timeout_seconds,
                request.transport_poll_interval_seconds,
                worker_id=worker_id,
                worker_hostname=worker_hostname,
            )
            self._sync_exact_commit(request)
            output = self._run_preflight(request)
            return PreflightResult(
                worker_id=worker_id,
                commit_sha=request.commit_sha,
                preflight_output=output,
                worker_hostname=worker_hostname,
            )
        except BaseException as exc:
            failure = exc
            raise
        finally:
            should_stop = request.start_worker and worker_started
            if failure is not None and request.keep_worker_on_failure:
                should_stop = False
            if should_stop:
                try:
                    self.provider.stop()
                except Exception:
                    # Never mask the primary workflow failure. On a successful
                    # workflow, propagate shutdown failure because cost safety is
                    # part of the contract.
                    if failure is None:
                        raise
