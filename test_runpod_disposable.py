"""Isolated tests for RunPod disposable workers and network volumes."""

from __future__ import annotations

import unittest

from compute.exceptions import ComputeConfigurationError, WorkerStartError
from compute.models import WorkerState
from compute.providers.runpod_disposable import RunPodDisposableConfig, RunPodDisposableProvider
from compute.providers.runpod_storage import RunPodNetworkVolumeClient, RunPodNetworkVolumeConfig


class FakeRequest:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method, path, body=None):
        self.calls.append((method, path, body))
        if not self.responses:
            raise AssertionError(f"Unexpected request {method} {path}")
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

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class DisposableProviderTests(unittest.TestCase):
    def config(self, **overrides):
        values = dict(
            network_volume_id="vol-123",
            template_id="tpl-123",
            gpu_type_ids=("NVIDIA GeForce RTX 4090", "NVIDIA RTX A6000"),
            worker_hostname_prefix="kriti-worker",
            poll_interval_seconds=2.0,
        )
        values.update(overrides)
        return RunPodDisposableConfig(**values)

    def test_requires_network_volume(self):
        with self.assertRaises(ComputeConfigurationError):
            RunPodDisposableProvider(self.config(network_volume_id=None), request_fn=FakeRequest([]))

    def test_requires_gpu_types(self):
        with self.assertRaises(ComputeConfigurationError):
            RunPodDisposableProvider(self.config(gpu_type_ids=()), request_fn=FakeRequest([]))

    def test_start_creates_secure_available_gpu_pod_with_network_volume(self):
        fake = FakeRequest([
            {
                "id": "pod-new",
                "desiredStatus": "RUNNING",
                "networkVolumeId": "vol-123",
            }
        ])
        provider = RunPodDisposableProvider(self.config(), request_fn=fake)
        info = provider.start()
        self.assertEqual(info.worker_id, "pod-new")
        self.assertEqual(info.state, WorkerState.RUNNING)
        self.assertEqual(info.hostname, "kriti-worker-pod-new")
        method, path, body = fake.calls[0]
        self.assertEqual((method, path), ("POST", "pods"))
        self.assertEqual(body["networkVolumeId"], "vol-123")
        self.assertEqual(body["gpuTypePriority"], "availability")
        self.assertEqual(body["cloudType"], "SECURE")
        self.assertEqual(body["volumeMountPath"], "/workspace")
        self.assertEqual(body["templateId"], "tpl-123")

    def test_hostname_is_unique_per_pod_id(self):
        provider = RunPodDisposableProvider(self.config(), request_fn=FakeRequest([]))
        first = provider.hostname_for_pod("abc123")
        second = provider.hostname_for_pod("xyz789")
        self.assertEqual(first, "kriti-worker-abc123")
        self.assertEqual(second, "kriti-worker-xyz789")
        self.assertNotEqual(first, second)

    def test_hostname_is_dns_safe_and_bounded(self):
        provider = RunPodDisposableProvider(
            self.config(worker_hostname_prefix="Kriti Worker !!! With A Very Long Prefix " * 3),
            request_fn=FakeRequest([]),
        )
        hostname = provider.hostname_for_pod("POD_ABC_123")
        self.assertLessEqual(len(hostname), 63)
        self.assertRegex(hostname, r"^[a-z][a-z0-9-]*[a-z0-9]$")
        self.assertTrue(hostname.endswith("pod-abc-123"))

    def test_stop_deletes_disposable_pod_not_network_volume(self):
        fake = FakeRequest([
            {"id": "pod-new", "desiredStatus": "RUNNING"},
            {},
        ])
        provider = RunPodDisposableProvider(self.config(), request_fn=fake)
        provider.start()
        provider.stop()
        self.assertEqual(fake.calls[-1][:2], ("DELETE", "pods/pod-new"))
        self.assertFalse(any("networkvolumes" in call[1] for call in fake.calls))

    def test_wait_until_ready_polls_and_preserves_runtime_hostname(self):
        fake = FakeRequest([
            {"id": "pod-new", "desiredStatus": "CREATED"},
            {"id": "pod-new", "desiredStatus": "CREATED"},
            {"id": "pod-new", "desiredStatus": "RUNNING"},
        ])
        clock = FakeClock()
        provider = RunPodDisposableProvider(
            self.config(), request_fn=fake, sleep_fn=clock.sleep, monotonic_fn=clock.monotonic
        )
        provider.start()
        info = provider.wait_until_ready(timeout=10)
        self.assertEqual(info.state, WorkerState.RUNNING)
        self.assertEqual(info.hostname, "kriti-worker-pod-new")
        self.assertEqual(clock.sleeps, [2.0])

    def test_creation_failure_does_not_leave_fake_pod_id(self):
        fake = FakeRequest([RuntimeError("capacity unavailable")])
        provider = RunPodDisposableProvider(self.config(), request_fn=fake)
        with self.assertRaises(WorkerStartError):
            provider.start()
        self.assertIsNone(provider._pod_id)


class NetworkVolumeTests(unittest.TestCase):
    def test_create_uses_official_network_volume_payload(self):
        fake = FakeRequest([{"id": "vol-1", "name": "kriti-workspace"}])
        client = RunPodNetworkVolumeClient(request_fn=fake)
        volume = client.create(
            RunPodNetworkVolumeConfig(name="kriti-workspace", size_gb=100, data_center_id="US-KS-2")
        )
        self.assertEqual(volume["id"], "vol-1")
        self.assertEqual(
            fake.calls,
            [
                (
                    "POST",
                    "networkvolumes",
                    {"name": "kriti-workspace", "size": 100, "dataCenterId": "US-KS-2"},
                )
            ],
        )

    def test_create_requires_data_center(self):
        client = RunPodNetworkVolumeClient(request_fn=FakeRequest([]))
        with self.assertRaises(ComputeConfigurationError):
            client.create(RunPodNetworkVolumeConfig(name="kriti", size_gb=100, data_center_id=""))


if __name__ == "__main__":
    unittest.main()
