"""Tests for scripts/bootstrap_tailscale.sh.

The suite uses fake tailscale/tailscaled executables in a temporary directory.
It never contacts Tailscale, RunPod, or the network and cannot start a GPU pod.
"""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parent
BOOTSTRAP = REPO_ROOT / "scripts" / "bootstrap_tailscale.sh"


FAKE_TAILSCALED = r'''#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "$FAKE_DAEMON_ARGS"
touch "$FAKE_DAEMON_MARKER"
'''


FAKE_TAILSCALE = r'''#!/usr/bin/env bash
set -euo pipefail
command_name=""
for arg in "$@"; do
  case "$arg" in
    status|ip|up) command_name="$arg"; break ;;
  esac
done

case "$command_name" in
  status)
    [[ -f "$FAKE_DAEMON_MARKER" ]] || exit 1
    echo "fake status"
    ;;
  ip)
    [[ -f "$FAKE_LOGGED_IN_MARKER" ]] || exit 1
    echo "100.64.0.10"
    ;;
  up)
    printf '%s\n' "$*" >> "$FAKE_UP_ARGS"
    touch "$FAKE_LOGGED_IN_MARKER"
    ;;
  *)
    echo "unexpected fake tailscale invocation: $*" >&2
    exit 2
    ;;
esac
'''


class TailscaleBootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="kriti-ts-test-"))
        self.bin_dir = self.tmp / "bin"
        self.bin_dir.mkdir()

        self.tailscale = self.bin_dir / "tailscale"
        self.tailscaled = self.bin_dir / "tailscaled"
        self.tailscale.write_text(FAKE_TAILSCALE, encoding="utf-8")
        self.tailscaled.write_text(FAKE_TAILSCALED, encoding="utf-8")
        self.tailscale.chmod(0o755)
        self.tailscaled.chmod(0o755)

        self.daemon_marker = self.tmp / "daemon.ready"
        self.logged_marker = self.tmp / "logged.in"
        self.daemon_args = self.tmp / "tailscaled.args"
        self.up_args = self.tmp / "tailscale-up.args"
        self.state_dir = self.tmp / "state"
        self.runtime_dir = self.tmp / "run"

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def env(self, *, auth_key: str | None = "tskey-auth-TEST-SECRET") -> dict[str, str]:
        env = os.environ.copy()
        env.update(
            {
                "TAILSCALE_BIN": str(self.tailscale),
                "TAILSCALED_BIN": str(self.tailscaled),
                "KRITI_TAILSCALE_STATE_DIR": str(self.state_dir),
                "KRITI_TAILSCALE_RUNTIME_DIR": str(self.runtime_dir),
                "KRITI_TAILSCALE_LOG": str(self.tmp / "tailscaled.log"),
                "KRITI_TAILSCALE_LEGACY_STATE_FILE": str(self.tmp / "legacy.state"),
                "KRITI_TAILSCALE_START_TIMEOUT_SECONDS": "3",
                "KRITI_WORKER_HOSTNAME": "kriti-runpod",
                "FAKE_DAEMON_MARKER": str(self.daemon_marker),
                "FAKE_LOGGED_IN_MARKER": str(self.logged_marker),
                "FAKE_DAEMON_ARGS": str(self.daemon_args),
                "FAKE_UP_ARGS": str(self.up_args),
            }
        )
        if auth_key is None:
            env.pop("TAILSCALE_AUTH_KEY", None)
        else:
            env["TAILSCALE_AUTH_KEY"] = auth_key
        return env

    def run_bootstrap(self, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["bash", str(BOOTSTRAP)],
            cwd=REPO_ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )

    def test_first_enrollment_starts_userspace_daemon_and_authenticates(self) -> None:
        secret = "tskey-auth-TEST-SECRET"
        result = self.run_bootstrap(self.env(auth_key=secret))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("READY hostname=kriti-runpod ip=100.64.0.10", result.stdout)
        self.assertNotIn(secret, result.stdout)
        self.assertNotIn(secret, result.stderr)

        daemon_args = self.daemon_args.read_text(encoding="utf-8")
        self.assertIn("--tun=userspace-networking", daemon_args)
        self.assertIn(f"--state={self.state_dir / 'tailscaled.state'}", daemon_args)
        self.assertIn(f"--socket={self.runtime_dir / 'tailscaled.sock'}", daemon_args)

        up_args = self.up_args.read_text(encoding="utf-8")
        self.assertIn("--hostname=kriti-runpod", up_args)
        self.assertIn("--auth-key=tskey-auth-TEST-SECRET", up_args)

    def test_second_run_reuses_daemon_and_authenticated_node(self) -> None:
        env = self.env()
        first = self.run_bootstrap(env)
        self.assertEqual(first.returncode, 0, first.stderr)
        first_up = self.up_args.read_text(encoding="utf-8")

        second = self.run_bootstrap(self.env(auth_key=None))

        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertIn("already reachable", second.stdout)
        self.assertIn("already authenticated", second.stdout)
        self.assertEqual(self.up_args.read_text(encoding="utf-8"), first_up)

    def test_unauthenticated_node_without_auth_key_fails_cleanly(self) -> None:
        result = self.run_bootstrap(self.env(auth_key=None))

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("TAILSCALE_AUTH_KEY is not set", result.stderr)

    def test_legacy_state_is_copied_to_persistent_state_location(self) -> None:
        legacy = self.tmp / "legacy.state"
        legacy.write_text("existing-node-state", encoding="utf-8")

        result = self.run_bootstrap(self.env())

        self.assertEqual(result.returncode, 0, result.stderr)
        persistent = self.state_dir / "tailscaled.state"
        self.assertTrue(persistent.exists())
        self.assertEqual(persistent.read_text(encoding="utf-8"), "existing-node-state")
        self.assertIn("Migrated existing Tailscale state", result.stdout)


if __name__ == "__main__":
    unittest.main()
