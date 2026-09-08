"""Safety tests for hardened disposable RunPod startup behavior.

These tests are static/read-only and do not contact RunPod or Tailscale.
"""

from __future__ import annotations

from pathlib import Path
import unittest

from compute.models import WorkerInfo, WorkerState, WorkerStatus
from compute.orchestrator import PreflightOrchestrator, PreflightRequest, WorkerTransportTimeout
from compute.provider import ComputeProvider
from compute.transport.base import WorkerTransport


REPO_ROOT = Path(__file__).resolve().parent


class TimeoutProvider(ComputeProvider):
    def __init__(self) -> None:
        self.stopped = 0

    def start(self) -> WorkerInfo:
        return WorkerInfo(
            "pod-abc123",
            "fake",
            WorkerState.RUNNING,
            hostname="kriti-worker-pod-abc123",
        )

    def stop(self) -> None:
        self.stopped += 1

    def status(self) -> WorkerStatus:
        return WorkerStatus("pod-abc123", "fake", WorkerState.RUNNING)

    def wait_until_ready(self, timeout: int = 600) -> WorkerInfo:
        return self.start()


class DownTransport(WorkerTransport):
    def health_check(self) -> bool:
        return False

    def execute(self, command: str) -> str:
        raise AssertionError("execute should not be called while transport is unavailable")

    def download(self, remote_path: str, local_path) -> None:
        raise NotImplementedError


class StartupHardeningTests(unittest.TestCase):
    def test_startup_script_keeps_tailscale_failure_nonfatal(self) -> None:
        script = (REPO_ROOT / "scripts" / "runpod_startup.sh").read_text(encoding="utf-8")
        self.assertIn("tailscale bootstrap failed rc=", script)
        self.assertIn("keeping container alive for diagnostics", script)
        self.assertIn("exec sleep infinity", script)
        self.assertNotIn("exit 1\n    fi\n    sleep 1", script)

    def test_startup_script_persists_diagnostics_without_secret_value(self) -> None:
        script = (REPO_ROOT / "scripts" / "runpod_startup.sh").read_text(encoding="utf-8")
        self.assertIn("/workspace/data/logs/runpod-startup", script)
        self.assertIn(".tailscale-ready", script)
        self.assertIn(".tailscale-failed", script)
        self.assertIn("TAILSCALE_AUTH_KEY=$([[ -n", script)
        self.assertNotIn('TAILSCALE_AUTH_KEY=${TAILSCALE_AUTH_KEY}', script)

    def test_transport_timeout_contains_runtime_worker_identity(self) -> None:
        provider = TimeoutProvider()
        times = iter([0.0, 2.0])
        orchestrator = PreflightOrchestrator(
            provider,
            transport_factory=lambda _: DownTransport(),
            sleep_fn=lambda _: None,
            monotonic_fn=lambda: next(times),
        )
        request = PreflightRequest(
            commit_sha="a" * 40,
            transport_ready_timeout_seconds=1,
            transport_poll_interval_seconds=0,
        )

        with self.assertRaises(WorkerTransportTimeout) as raised:
            orchestrator.run(request)

        message = str(raised.exception)
        self.assertIn("worker_id=pod-abc123", message)
        self.assertIn("hostname=kriti-worker-pod-abc123", message)
        self.assertEqual(provider.stopped, 1)


if __name__ == "__main__":
    unittest.main()
