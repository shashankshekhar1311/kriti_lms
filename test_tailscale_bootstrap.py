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
socket=""
for arg in "$@"; do
  case "$arg" in
    --socket=*) socket="${arg#--socket=}" ;;
  esac
done
[[ -n "$socket" ]] || exit 3
mkdir -p "$(dirname "$socket")"
touch "$socket"
touch "$FAKE_DAEMON_MARKER"
# Keep the fake daemon alive long enough for the bootstrap to inspect it.
sleep 30
'''


FAKE_TAILSCALE = r'''#!/usr/bin/env bash
set -euo pipefail
command_name=""
for arg in "$@"; do
  case "$arg" in
    status|ip|up|set) command_name="$arg"; break ;;
  esac
done

case "$command_name" in
  status)
    [[ -f "$FAKE_DAEMON_MARKER" ]] || exit 1
    # Reproduce the real RunPod behavior discovered during integration testing:
    # the daemon is alive but status exits non-zero while authentication is needed.
    [[ -f "$FAKE_LOGGED_IN_MARKER" ]] || exit 1
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
  set)
    printf '%s\n' "$*" >> "$FAKE_SET_ARGS"
    ;;
  *)
    echo "unexpected fake tailscale invocation: $*" >&2
    exit 2
    ;;
esac
'''


FAKE_CURL = r'''#!/usr/bin/env bash
set -euo pipefail
cat <<'INSTALLER'
#!/usr/bin/env bash
set -euo pipefail
cp "$FAKE_INSTALL_SOURCE_TAILSCALE" "$FAKE_INSTALL_TARGET_TAILSCALE"
cp "$FAKE_INSTALL_SOURCE_TAILSCALED" "$FAKE_INSTALL_TARGET_TAILSCALED"
chmod +x "$FAKE_INSTALL_TARGET_TAILSCALE" "$FAKE_INSTALL_TARGET_TAILSCALED"
INSTALLER
'''


class TailscaleBootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="kriti-ts-test-"))
        self.bin_dir = self.tmp / "bin"
        self.bin_dir.mkdir()

        self.tailscale = self.bin_dir / "tailscale"
        self.tailscaled = self.bin_dir / "tailscaled"
        self.curl = self.bin_dir / "curl"
        self.tailscale.write_text(FAKE_TAILSCALE, encoding="utf-8")
        self.tailscaled.write_text(FAKE_TAILSCALED, encoding="utf-8")
        self.curl.write_text(FAKE_CURL, encoding="utf-8")
        self.tailscale.chmod(0o755)
        self.tailscaled.chmod(0o755)
        self.curl.chmod(0o755)

        self.daemon_marker = self.tmp / "daemon.ready"
        self.logged_marker = self.tmp / "logged.in"
        self.daemon_args = self.tmp / "tailscaled.args"
        self.up_args = self.tmp / "tailscale-up.args"
        self.set_args = self.tmp / "tailscale-set.args"
        self.state_dir = self.tmp / "state"
        self.runtime_dir = self.tmp / "run"

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def env(self, *, auth_key: str | None = "tskey-auth-TEST-SECRET") -> dict[str, str]:
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{self.bin_dir}{os.pathsep}{env.get('PATH', '')}",
                "TAILSCALE_BIN": str(self.tailscale),
                "TAILSCALED_BIN": str(self.tailscaled),
                "CURL_BIN": str(self.curl),
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
                "FAKE_SET_ARGS": str(self.set_args),
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

    def test_needs_login_daemon_is_treated_as_reachable_and_authenticated(self) -> None:
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

    def test_bootstrap_enables_tailscale_ssh(self) -> None:
        result = self.run_bootstrap(self.env())

        self.assertEqual(result.returncode, 0, result.stderr)
        set_args = self.set_args.read_text(encoding="utf-8")
        self.assertIn("set --ssh", set_args)
        self.assertIn("ssh=1", result.stdout)

    def test_second_run_reuses_daemon_and_authenticated_node_without_auth_key(self) -> None:
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

    def test_missing_tailscale_is_installed_when_auto_install_enabled(self) -> None:
        install_source_tailscale = self.tmp / "source-tailscale"
        install_source_tailscaled = self.tmp / "source-tailscaled"
        install_source_tailscale.write_text(FAKE_TAILSCALE, encoding="utf-8")
        install_source_tailscaled.write_text(FAKE_TAILSCALED, encoding="utf-8")
        install_source_tailscale.chmod(0o755)
        install_source_tailscaled.chmod(0o755)

        self.tailscale.unlink()
        self.tailscaled.unlink()

        env = self.env()
        env.update(
            {
                "FAKE_INSTALL_SOURCE_TAILSCALE": str(install_source_tailscale),
                "FAKE_INSTALL_SOURCE_TAILSCALED": str(install_source_tailscaled),
                "FAKE_INSTALL_TARGET_TAILSCALE": str(self.tailscale),
                "FAKE_INSTALL_TARGET_TAILSCALED": str(self.tailscaled),
            }
        )

        result = self.run_bootstrap(env)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Tailscale is not installed", result.stdout)
        self.assertTrue(self.tailscale.exists())
        self.assertTrue(self.tailscaled.exists())

    def test_missing_tailscale_fails_when_auto_install_disabled(self) -> None:
        self.tailscale.unlink()
        self.tailscaled.unlink()
        env = self.env()
        env["KRITI_TAILSCALE_AUTO_INSTALL"] = "0"

        result = self.run_bootstrap(env)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("AUTO_INSTALL is disabled", result.stderr)


if __name__ == "__main__":
    unittest.main()
