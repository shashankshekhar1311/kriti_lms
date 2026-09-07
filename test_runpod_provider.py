"""Unit tests for the RunPod compute lifecycle provider.

All API calls are mocked; these tests never start, stop, or contact a real pod.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from compute.exceptions import (
    ComputeConfigurationError,
    ComputeError,
    RunPodCapacityUnavailableError,
    WorkerReadinessTimeout,
    WorkerStartError,
)
from compute.models import WorkerState
from compute.providers.runpod import RunPodProvider, RunPodProviderConfig


class FakeRequest:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method: str, path: str):
        self.calls.append((method, path))
        if not self.responses:
            raise AssertionError(f"Unexpected request: {method} {path}")
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds: float):
        self.sleeps.append(seconds)
        self.now += seconds


class RunPodProviderTests(unittest.TestCase):
    def config(self, **overrides):
        values = {
            "pod_id": "pod-123",
            "worker_hostname": "kriti-runpod",
            "poll_interval_seconds": 2.0,
            "capacity_retry_timeout_seconds": 0.0,
            "capacity_retry_interval_seconds": 1.0,
        }
        values.update(overrides)
        return RunPodProviderConfig(**values)

    def test_missing_pod_id_fails_before_request(self):
        provider = RunPodProvider(
            RunPodProviderConfig(pod_id=None),
            request_fn=FakeRequest([]),
        )
        with self.assertRaises(ComputeConfigurationError):
            provider.status()

    def test_missing_api_key_is_rejected(self):
        provider = RunPodProvider(self.config())
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ComputeConfigurationError):
                provider._resolve_api_key()

    def test_status_maps_running_and_preserves_connection_metadata(self):
        fake = FakeRequest([
            {
                "id": "pod-123",
                "desiredStatus": "RUNNING",
                "name": "Kriti GPU",
                "publicIp": "1.2.3.4",
                "machineId": "machine-1",
                "portMappings": {"22": 12345},
            }
        ])
        provider = RunPodProvider(self.config(), request_fn=fake)

        status = provider.status()

        self.assertEqual(status.state, WorkerState.RUNNING)
        self.assertTrue(status.ready)
        self.assertEqual(status.worker_id, "pod-123")
        self.assertEqual(status.metadata["machineId"], "machine-1")
        self.assertEqual(fake.calls, [("GET", "pods/pod-123")])

    def test_status_maps_exited_to_stopped(self):
        provider = RunPodProvider(
            self.config(),
            request_fn=FakeRequest([{"id": "pod-123", "desiredStatus": "EXITED"}]),
        )
        self.assertEqual(provider.status().state, WorkerState.STOPPED)

    def test_start_is_idempotent_when_already_running(self):
        fake = FakeRequest([
            {"id": "pod-123", "desiredStatus": "RUNNING", "publicIp": "1.2.3.4"}
        ])
        provider = RunPodProvider(self.config(), request_fn=fake)

        info = provider.start()

        self.assertEqual(info.state, WorkerState.RUNNING)
        self.assertEqual(info.hostname, "kriti-runpod")
        self.assertEqual(info.public_ip, "1.2.3.4")
        self.assertEqual(fake.calls, [("GET", "pods/pod-123")])

    def test_start_resumes_stopped_pod_and_refreshes_state(self):
        fake = FakeRequest([
            {"id": "pod-123", "desiredStatus": "EXITED"},
            {},
            {"id": "pod-123", "desiredStatus": "RUNNING", "publicIp": "5.6.7.8"},
        ])
        provider = RunPodProvider(self.config(), request_fn=fake)

        info = provider.start()

        self.assertEqual(info.state, WorkerState.RUNNING)
        self.assertEqual(info.public_ip, "5.6.7.8")
        self.assertEqual(
            fake.calls,
            [
                ("GET", "pods/pod-123"),
                ("POST", "pods/pod-123/start"),
                ("GET", "pods/pod-123"),
            ],
        )

    def test_start_retries_capacity_error_then_succeeds(self):
        capacity_error = ComputeError(
            'RunPod API request failed with HTTP 500 (POST pods/pod-123/start): '
            '{"error":"start pod: There are not enough free GPUs on the host machine to start this pod."}'
        )
        fake = FakeRequest([
            {"id": "pod-123", "desiredStatus": "EXITED"},
            capacity_error,
            capacity_error,
            {},
            {"id": "pod-123", "desiredStatus": "RUNNING"},
        ])
        clock = FakeClock()
        provider = RunPodProvider(
            self.config(
                capacity_retry_timeout_seconds=30.0,
                capacity_retry_interval_seconds=5.0,
            ),
            request_fn=fake,
            sleep_fn=clock.sleep,
            monotonic_fn=clock.monotonic,
        )

        info = provider.start()

        self.assertEqual(info.state, WorkerState.RUNNING)
        self.assertEqual(clock.sleeps, [5.0, 5.0])
        self.assertEqual(
            [call for call in fake.calls if call == ("POST", "pods/pod-123/start")],
            [("POST", "pods/pod-123/start")] * 3,
        )

    def test_start_capacity_timeout_raises_actionable_error(self):
        capacity_error = ComputeError(
            "RunPod API request failed: There are not enough free GPUs on the host machine"
        )
        fake = FakeRequest([
            {"id": "pod-123", "desiredStatus": "EXITED"},
            capacity_error,
            capacity_error,
            capacity_error,
        ])
        clock = FakeClock()
        provider = RunPodProvider(
            self.config(
                capacity_retry_timeout_seconds=10.0,
                capacity_retry_interval_seconds=5.0,
            ),
            request_fn=fake,
            sleep_fn=clock.sleep,
            monotonic_fn=clock.monotonic,
        )

        with self.assertRaises(RunPodCapacityUnavailableError) as ctx:
            provider.start()

        self.assertIn("automatic Pod migration", str(ctx.exception))
        self.assertIn("network volume", str(ctx.exception))
        self.assertEqual(clock.sleeps, [5.0, 5.0])

    def test_non_capacity_start_error_is_not_retried(self):
        fake = FakeRequest([
            {"id": "pod-123", "desiredStatus": "EXITED"},
            ComputeError("RunPod API request failed with HTTP 401"),
        ])
        clock = FakeClock()
        provider = RunPodProvider(
            self.config(
                capacity_retry_timeout_seconds=30.0,
                capacity_retry_interval_seconds=5.0,
            ),
            request_fn=fake,
            sleep_fn=clock.sleep,
            monotonic_fn=clock.monotonic,
        )

        with self.assertRaises(WorkerStartError):
            provider.start()

        self.assertEqual(clock.sleeps, [])

    def test_start_rejects_terminated_pod(self):
        provider = RunPodProvider(
            self.config(),
            request_fn=FakeRequest([{"id": "pod-123", "desiredStatus": "TERMINATED"}]),
        )
        with self.assertRaises(WorkerStartError):
            provider.start()

    def test_stop_is_idempotent_when_already_stopped(self):
        fake = FakeRequest([{"id": "pod-123", "desiredStatus": "EXITED"}])
        provider = RunPodProvider(self.config(), request_fn=fake)

        provider.stop()

        self.assertEqual(fake.calls, [("GET", "pods/pod-123")])

    def test_stop_running_pod_calls_stop_endpoint(self):
        fake = FakeRequest([
            {"id": "pod-123", "desiredStatus": "RUNNING"},
            {},
        ])
        provider = RunPodProvider(self.config(), request_fn=fake)

        provider.stop()

        self.assertEqual(
            fake.calls,
            [("GET", "pods/pod-123"), ("POST", "pods/pod-123/stop")],
        )

    def test_wait_until_ready_polls_without_real_sleep(self):
        fake = FakeRequest([
            {"id": "pod-123", "desiredStatus": "EXITED"},
            {"id": "pod-123", "desiredStatus": "EXITED"},
            {"id": "pod-123", "desiredStatus": "RUNNING"},
        ])
        clock = FakeClock()
        provider = RunPodProvider(
            self.config(),
            request_fn=fake,
            sleep_fn=clock.sleep,
            monotonic_fn=clock.monotonic,
        )

        info = provider.wait_until_ready(timeout=10)

        self.assertEqual(info.state, WorkerState.RUNNING)
        self.assertEqual(clock.sleeps, [2.0, 2.0])

    def test_wait_until_ready_times_out(self):
        fake = FakeRequest([
            {"id": "pod-123", "desiredStatus": "EXITED"},
            {"id": "pod-123", "desiredStatus": "EXITED"},
            {"id": "pod-123", "desiredStatus": "EXITED"},
        ])
        clock = FakeClock()
        provider = RunPodProvider(
            self.config(),
            request_fn=fake,
            sleep_fn=clock.sleep,
            monotonic_fn=clock.monotonic,
        )

        with self.assertRaises(WorkerReadinessTimeout):
            provider.wait_until_ready(timeout=4)


if __name__ == "__main__":
    unittest.main()
