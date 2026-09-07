"""Isolated disposable Tailscale identity test; no network calls."""

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
  case "$arg" in --socket=*) socket="${arg#--socket=}" ;; esac
done
mkdir -p "$(dirname "$socket")"
touch "$socket"
sleep 20
'''

FAKE_TAILSCALE = r'''#!/usr/bin/env bash
set -euo pipefail
cmd=""
for arg in "$@"; do
  case "$arg" in ip|up|set) cmd="$arg"; break ;; esac
done
case "$cmd" in
  ip)
    [[ -f "$FAKE_LOGGED_IN" ]] || exit 1
    echo "100.64.0.55"
    ;;
  up)
    printf '%s\n' "$*" > "$FAKE_UP_ARGS"
    touch "$FAKE_LOGGED_IN"
    ;;
  set)
    printf '%s\n' "$*" >> "$FAKE_SET_ARGS"
    ;;
  *) exit 2 ;;
esac
'''


class DisposableTailscaleIdentityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="kriti-disposable-ts-"))
        self.bin_dir = self.tmp / "bin"
        self.bin_dir.mkdir()
        self.tailscale = self.bin_dir / "tailscale"
        self.tailscaled = self.bin_dir / "tailscaled"
        self.tailscale.write_text(FAKE_TAILSCALE, encoding="utf-8")
        self.tailscaled.write_text(FAKE_TAILSCALED, encoding="utf-8")
        self.tailscale.chmod(0o755)
        self.tailscaled.chmod(0o755)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_runpod_id_derives_unique_hostname_and_ephemeral_state(self) -> None:
        daemon_args = self.tmp / "daemon.args"
        up_args = self.tmp / "up.args"
        set_args = self.tmp / "set.args"
        logged_in = self.tmp / "logged.in"
        runtime = self.tmp / "run"
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{self.bin_dir}{os.pathsep}{env.get('PATH', '')}",
                "TAILSCALE_BIN": str(self.tailscale),
                "TAILSCALED_BIN": str(self.tailscaled),
                "RUNPOD_POD_ID": "AbC_123",
                "KRITI_WORKER_HOSTNAME_PREFIX": "kriti-worker",
                "TAILSCALE_AUTH_KEY": "tskey-auth-TEST-SECRET",
                "KRITI_TAILSCALE_RUNTIME_DIR": str(runtime),
                "KRITI_TAILSCALE_LOG": str(self.tmp / "tailscaled.log"),
                "KRITI_TAILSCALE_LEGACY_STATE_FILE": str(self.tmp / "legacy.state"),
                "KRITI_TAILSCALE_START_TIMEOUT_SECONDS": "3",
                "FAKE_DAEMON_ARGS": str(daemon_args),
                "FAKE_UP_ARGS": str(up_args),
                "FAKE_SET_ARGS": str(set_args),
                "FAKE_LOGGED_IN": str(logged_in),
            }
        )
        env.pop("KRITI_WORKER_HOSTNAME", None)
        env.pop("KRITI_TAILSCALE_STATE_DIR", None)
        env.pop("KRITI_TAILSCALE_STATE_FILE", None)

        result = subprocess.run(
            ["bash", str(BOOTSTRAP)],
            cwd=REPO_ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("READY hostname=kriti-worker-abc-123", result.stdout)
        self.assertIn("disposable=1", result.stdout)
        self.assertIn("--hostname=kriti-worker-abc-123", up_args.read_text(encoding="utf-8"))
        daemon = daemon_args.read_text(encoding="utf-8")
        self.assertIn("--state=/tmp/kriti-tailscale-AbC_123/tailscaled.state", daemon)
        self.assertNotIn("/workspace/tailscale", daemon)


if __name__ == "__main__":
    unittest.main()
