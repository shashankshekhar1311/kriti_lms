"""Isolated tests for compute.orchestrator.

No test contacts RunPod, Tailscale, GitHub, or a GPU worker.
"""

from __future__ import annotations

import unittest

from compute.models import WorkerInfo, WorkerState, WorkerStatus
from compute.orchestrator import (
    DirtyWorkerError,
    PreflightOrchestrator,
    PreflightRequest,
    WorkerTransportTimeout,
)
from compute.provider import ComputeProvider
from compute.transport.base import WorkerTransport


SHA = "a" * 40


class FakeProvider(ComputeProvider):
    def __init__(self, hostname: str | None = None) -> None:
        self.started = 0
        self.stopped = 0
        self.waited = 0
        self.hostname = hostname

    def start(self) -> WorkerInfo:
        self.started += 1
        return WorkerInfo("pod-123", "fake", WorkerState.RUNNING, hostname=self.hostname)

    def stop(self) -> None:
        self.stopped += 1

    def status(self) -> WorkerStatus:
        return WorkerStatus("pod-123", "fake", WorkerState.RUNNING)

    def wait_until_ready(self, timeout: int = 600) -> WorkerInfo:
        self.waited += 1
        return WorkerInfo("pod-123", "fake", WorkerState.RUNNING, hostname=self.hostname)


class FakeTransport(WorkerTransport):
    def __init__(self, *, health_sequence=None, dirty=False, preflight_failure=False, hostname=None) -> None:
        self.health_sequence = list(health_sequence or [True])
        self.dirty = dirty
        self.preflight_failure = preflight_failure
        self.hostname = hostname
        self.commands: list[str] = []

    def health_check(self) -> bool:
        if len(self.health_sequence) > 1:
            return self.health_sequence.pop(0)
        return self.health_sequence[0]

    def execute(self, command: str) -> str:
        self.commands.append(command)
        if "git diff --quiet" in command:
            return "DIRTY" if self.dirty else ""
        if "git rev-parse HEAD" in command:
            return SHA + "\n"
        if "runpod_preflight.sh" in command:
            if self.preflight_failure:
                raise RuntimeError("preflight failed")
            return "KRITI RUNPOD IS READY\n"
        return ""

    def download(self, remote_path: str, local_path) -> None:
        raise NotImplementedError


class OrchestratorTests(unittest.TestCase):
    def request(self, **overrides) -> PreflightRequest:
        values = dict(
            commit_sha=SHA,
            transport_ready_timeout_seconds=3,
            transport_poll_interval_seconds=0,
        )
        values.update(overrides)
        return PreflightRequest(**values)

    def test_success_starts_syncs_preflights_and_stops(self) -> None:
        provider = FakeProvider()
        transport = FakeTransport(health_sequence=[False, True])
        clock = iter([0.0, 0.0, 1.0, 1.0])
        orchestrator = PreflightOrchestrator(
            provider,
            transport,
            sleep_fn=lambda _: None,
            monotonic_fn=lambda: next(clock),
        )

        result = orchestrator.run(self.request())

        self.assertEqual(result.worker_id, "pod-123")
        self.assertIn("READY", result.preflight_output)
        self.assertEqual(provider.started, 1)
        self.assertEqual(provider.waited, 1)
        self.assertEqual(provider.stopped, 1)
        joined = "\n".join(transport.commands)
        self.assertIn("git remote set-url origin", joined)
        self.assertIn("git checkout --detach", joined)
        self.assertIn(SHA, joined)
        self.assertIn("runpod_preflight.sh", joined)

    def test_transport_factory_uses_runtime_worker_hostname(self) -> None:
        provider = FakeProvider(hostname="kriti-worker-pod-123")
        created: list[FakeTransport] = []

        def factory(worker: WorkerInfo) -> FakeTransport:
            transport = FakeTransport(hostname=worker.hostname)
            created.append(transport)
            return transport

        orchestrator = PreflightOrchestrator(provider, transport_factory=factory)
        result = orchestrator.run(self.request())

        self.assertEqual(result.worker_hostname, "kriti-worker-pod-123")
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0].hostname, "kriti-worker-pod-123")
        self.assertTrue(created[0].commands)
        self.assertEqual(provider.stopped, 1)

    def test_tracked_dirty_worker_refuses_checkout_and_stops(self) -> None:
        provider = FakeProvider()
        transport = FakeTransport(dirty=True)
        orchestrator = PreflightOrchestrator(provider, transport)

        with self.assertRaises(DirtyWorkerError):
            orchestrator.run(self.request())

        self.assertEqual(provider.stopped, 1)
        self.assertFalse(any("git checkout" in cmd for cmd in transport.commands))

    def test_failure_stops_worker_by_default(self) -> None:
        provider = FakeProvider()
        transport = FakeTransport(preflight_failure=True)
        orchestrator = PreflightOrchestrator(provider, transport)

        with self.assertRaisesRegex(RuntimeError, "preflight failed"):
            orchestrator.run(self.request())

        self.assertEqual(provider.stopped, 1)

    def test_keep_worker_on_failure_skips_shutdown(self) -> None:
        provider = FakeProvider()
        transport = FakeTransport(preflight_failure=True)
        orchestrator = PreflightOrchestrator(provider, transport)

        with self.assertRaises(RuntimeError):
            orchestrator.run(self.request(keep_worker_on_failure=True))

        self.assertEqual(provider.stopped, 0)

    def test_existing_worker_mode_does_not_start_or_stop_provider(self) -> None:
        provider = FakeProvider()
        transport = FakeTransport()
        orchestrator = PreflightOrchestrator(provider, transport)

        result = orchestrator.run(self.request(start_worker=False))

        self.assertEqual(result.worker_id, "existing-worker")
        self.assertEqual(provider.started, 0)
        self.assertEqual(provider.waited, 0)
        self.assertEqual(provider.stopped, 0)

    def test_transport_timeout_stops_started_worker(self) -> None:
        provider = FakeProvider()
        transport = FakeTransport(health_sequence=[False])
        times = iter([0.0, 4.0])
        orchestrator = PreflightOrchestrator(
            provider,
            transport,
            sleep_fn=lambda _: None,
            monotonic_fn=lambda: next(times),
        )

        with self.assertRaises(WorkerTransportTimeout):
            orchestrator.run(self.request())

        self.assertEqual(provider.stopped, 1)

    def test_requires_static_transport_or_factory(self) -> None:
        with self.assertRaisesRegex(ValueError, "transport or transport_factory"):
            PreflightOrchestrator(FakeProvider())


if __name__ == "__main__":
    unittest.main()
