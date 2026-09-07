"""Tests for compute.transport.tailscale.

All subprocess behavior is mocked. These tests do not contact Tailscale, RunPod,
or the network and cannot start a GPU pod.
"""

from __future__ import annotations

from pathlib import Path
import subprocess
import tempfile
import unittest

from compute.exceptions import (
    TransportCommandError,
    TransportConfigurationError,
    TransportDownloadError,
)
from compute.transport.tailscale import TailscaleTransport, TailscaleTransportConfig


class FakeRunner:
    def __init__(self, responses=None, *, download_bytes: bytes = b"") -> None:
        self.responses = list(responses or [])
        self.download_bytes = download_bytes
        self.calls = []

    def __call__(self, args, **kwargs):
        self.calls.append((list(args), dict(kwargs)))
        if self.responses:
            response = self.responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response

        stdout = kwargs.get("stdout")
        if stdout is not None and hasattr(stdout, "write"):
            stdout.write(self.download_bytes)
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="", stderr=b"")


def completed(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


class TailscaleTransportTests(unittest.TestCase):
    def config(self, **overrides):
        values = {
            "hostname": "kriti-runpod",
            "user": "root",
            "tailscale_bin": "tailscale",
            "command_timeout_seconds": 30.0,
            "health_timeout_seconds": 5.0,
        }
        values.update(overrides)
        return TailscaleTransportConfig(**values)

    def test_target_uses_configured_user_and_hostname(self):
        transport = TailscaleTransport(self.config(), run_fn=FakeRunner())
        self.assertEqual(transport.target, "root@kriti-runpod")

    def test_health_check_uses_tailscale_ssh_and_marker(self):
        runner = FakeRunner([completed(stdout="KRITI_TAILSCALE_TRANSPORT_OK")])
        transport = TailscaleTransport(self.config(), run_fn=runner)

        self.assertTrue(transport.health_check())
        args, kwargs = runner.calls[0]
        self.assertEqual(args[:3], ["tailscale", "ssh", "root@kriti-runpod"])
        self.assertIn("KRITI_TAILSCALE_TRANSPORT_OK", args[3])
        self.assertEqual(kwargs["timeout"], 5.0)

    def test_health_check_returns_false_on_remote_failure(self):
        runner = FakeRunner([completed(returncode=1, stderr="denied")])
        transport = TailscaleTransport(self.config(), run_fn=runner)
        self.assertFalse(transport.health_check())

    def test_health_check_returns_false_on_timeout(self):
        runner = FakeRunner([subprocess.TimeoutExpired(cmd="tailscale", timeout=5)])
        transport = TailscaleTransport(self.config(), run_fn=runner)
        self.assertFalse(transport.health_check())

    def test_execute_returns_stdout(self):
        runner = FakeRunner([completed(stdout="ready\n")])
        transport = TailscaleTransport(self.config(), run_fn=runner)

        output = transport.execute("echo ready")

        self.assertEqual(output, "ready\n")
        args, kwargs = runner.calls[0]
        self.assertEqual(args, ["tailscale", "ssh", "root@kriti-runpod", "echo ready"])
        self.assertEqual(kwargs["timeout"], 30.0)

    def test_execute_raises_with_remote_stderr(self):
        runner = FakeRunner([completed(returncode=7, stderr="remote failure")])
        transport = TailscaleTransport(self.config(), run_fn=runner)

        with self.assertRaisesRegex(TransportCommandError, "remote failure"):
            transport.execute("false")

    def test_empty_command_is_rejected(self):
        transport = TailscaleTransport(self.config(), run_fn=FakeRunner())
        with self.assertRaises(TransportConfigurationError):
            transport.execute("   ")

    def test_download_streams_binary_file_and_renames_atomically(self):
        runner = FakeRunner(download_bytes=b"\x00\x01kriti-video")
        transport = TailscaleTransport(self.config(), run_fn=runner)

        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / "nested" / "video.mp4"
            transport.download("/workspace/data/Rendered Output/video.mp4", destination)

            self.assertEqual(destination.read_bytes(), b"\x00\x01kriti-video")
            self.assertFalse(destination.with_name("video.mp4.part").exists())
            args, _ = runner.calls[0]
            self.assertEqual(args[:3], ["tailscale", "ssh", "root@kriti-runpod"])
            self.assertIn("cat --", args[3])
            self.assertIn("Rendered Output", args[3])

    def test_download_failure_removes_partial_file(self):
        runner = FakeRunner([completed(returncode=1, stderr=b"missing")])
        transport = TailscaleTransport(self.config(), run_fn=runner)

        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / "video.mp4"
            with self.assertRaisesRegex(TransportDownloadError, "missing"):
                transport.download("/missing.mp4", destination)

            self.assertFalse(destination.exists())
            self.assertFalse(destination.with_name("video.mp4.part").exists())

    def test_invalid_config_is_rejected(self):
        with self.assertRaises(TransportConfigurationError):
            TailscaleTransport(self.config(hostname=""), run_fn=FakeRunner())
        with self.assertRaises(TransportConfigurationError):
            TailscaleTransport(self.config(command_timeout_seconds=0), run_fn=FakeRunner())


if __name__ == "__main__":
    unittest.main()
