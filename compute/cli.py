"""Command-line entry point for Kriti compute orchestration.

Run from the Windows repository root with:

    python -m compute.cli preflight

The command loads .env locally, resolves the exact local Git HEAD, starts the
configured RunPod, waits for Tailscale SSH, synchronizes that exact commit,
runs the existing RunPod preflight, and stops the worker in a finally block.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys

from config.compute import load_compute_config
from config.env import load_env_file
from .orchestrator import PreflightOrchestrator, PreflightRequest
from .providers.runpod import RunPodProvider, RunPodProviderConfig
from .transport.tailscale import TailscaleTransport, TailscaleTransportConfig


REPO_ROOT = Path(__file__).resolve().parent.parent


def _git_text(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "git command failed").strip()
        raise RuntimeError(detail)
    return (result.stdout or "").strip()


def _local_commit(explicit: str | None, allow_dirty: bool) -> str:
    if not allow_dirty:
        staged = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO_ROOT).returncode
        tracked = subprocess.run(["git", "diff", "--quiet"], cwd=REPO_ROOT).returncode
        if staged != 0 or tracked != 0:
            raise RuntimeError(
                "Local repository has tracked uncommitted changes. Commit/stash them, "
                "or use --allow-dirty-local only when you intentionally want the last commit."
            )
    commit = explicit or _git_text("rev-parse", "HEAD")
    _git_text("cat-file", "-e", f"{commit}^{{commit}}")
    return _git_text("rev-parse", commit)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="kriti-compute")
    sub = parser.add_subparsers(dest="command", required=True)

    preflight = sub.add_parser("preflight", help="Start worker, sync exact commit, run preflight, stop")
    preflight.add_argument("--commit", help="Exact Git commit; defaults to local HEAD")
    preflight.add_argument("--allow-dirty-local", action="store_true")
    preflight.add_argument(
        "--keep-worker-on-failure",
        action="store_true",
        help="Debug only: do not stop a worker after a failed preflight",
    )
    preflight.add_argument(
        "--existing-worker",
        action="store_true",
        help="Do not start/stop RunPod; use an already-running, Tailscale-ready worker",
    )
    return parser


def _run_preflight(args: argparse.Namespace) -> int:
    load_env_file(REPO_ROOT / ".env")
    config = load_compute_config()
    commit = _local_commit(args.commit, args.allow_dirty_local)

    provider = RunPodProvider(
        RunPodProviderConfig(
            pod_id=config.runpod_pod_id,
            api_base_url=config.runpod_api_base_url,
            worker_hostname=config.worker_hostname,
            request_timeout_seconds=config.runpod_request_timeout_seconds,
            poll_interval_seconds=config.runpod_poll_interval_seconds,
            capacity_retry_timeout_seconds=config.runpod_capacity_retry_timeout_seconds,
            capacity_retry_interval_seconds=config.runpod_capacity_retry_interval_seconds,
        )
    )
    transport = TailscaleTransport(
        TailscaleTransportConfig(
            hostname=config.worker_hostname,
            user=config.tailscale_ssh_user,
            command_timeout_seconds=config.tailscale_command_timeout_seconds,
            health_timeout_seconds=config.tailscale_health_timeout_seconds,
        )
    )
    orchestrator = PreflightOrchestrator(provider, transport)

    request = PreflightRequest(
        commit_sha=commit,
        repo_path=config.worker_repo_path,
        git_remote_url=config.git_remote_url,
        provider_ready_timeout_seconds=int(config.provider_ready_timeout_seconds),
        transport_ready_timeout_seconds=int(config.transport_ready_timeout_seconds),
        transport_poll_interval_seconds=config.transport_poll_interval_seconds,
        keep_worker_on_failure=args.keep_worker_on_failure,
        start_worker=not args.existing_worker,
    )

    print(f"Kriti preflight commit: {commit}")
    print(f"Worker target: {config.tailscale_ssh_user}@{config.worker_hostname}")
    if not args.existing_worker and config.runpod_capacity_retry_timeout_seconds > 0:
        print(
            "RunPod capacity retry: "
            f"up to {config.runpod_capacity_retry_timeout_seconds:g}s "
            f"every {config.runpod_capacity_retry_interval_seconds:g}s"
        )
    if args.keep_worker_on_failure:
        print("WARNING: --keep-worker-on-failure can leave billable GPU compute running.")

    result = orchestrator.run(request)
    print(result.preflight_output, end="" if result.preflight_output.endswith("\n") else "\n")
    print(f"KRITI PREFLIGHT COMPLETE worker={result.worker_id} commit={result.commit_sha}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "preflight":
            return _run_preflight(args)
        parser.error(f"Unsupported command: {args.command}")
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"KRITI PREFLIGHT FAILED: {exc}", file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
