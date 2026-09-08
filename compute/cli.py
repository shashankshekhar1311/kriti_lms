"""Command-line entry point for Kriti compute orchestration."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys

from config.compute import load_compute_config
from config.env import load_env_file
from .models import WorkerInfo
from .orchestrator import PreflightOrchestrator, PreflightRequest
from .providers.runpod import RunPodProvider, RunPodProviderConfig
from .providers.runpod_api import RunPodApiClient, RunPodApiConfig
from .providers.runpod_disposable import RunPodDisposableConfig, RunPodDisposableProvider
from .providers.runpod_gpu import RunPodGpuDiscoveryClient, RunPodGpuDiscoveryConfig
from .providers.runpod_storage import RunPodNetworkVolumeClient, RunPodNetworkVolumeConfig
from .transport.tailscale import TailscaleTransport, TailscaleTransportConfig


REPO_ROOT = Path(__file__).resolve().parent.parent


def _git_text(*args: str) -> str:
    result = subprocess.run(["git", *args], cwd=REPO_ROOT, capture_output=True, text=True, check=False)
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
    preflight.add_argument("--keep-worker-on-failure", action="store_true")
    preflight.add_argument("--existing-worker", action="store_true")
    preflight.add_argument("--disposable-worker", action="store_true", help="Provision a fresh GPU Pod attached to KRITI_RUNPOD_NETWORK_VOLUME_ID and delete it afterward")

    volume = sub.add_parser("volume", help="Manage Kriti RunPod network volume")
    volume_sub = volume.add_subparsers(dest="volume_command", required=True)
    create = volume_sub.add_parser("create", help="Create the configured RunPod network volume")
    create.add_argument("--confirm-create", action="store_true", help="Required because network volumes incur ongoing storage charges")
    show = volume_sub.add_parser("show", help="Show the configured network volume")
    show.add_argument("--id", dest="volume_id", help="Override KRITI_RUNPOD_NETWORK_VOLUME_ID")

    gpu = sub.add_parser("gpu", help="Read-only RunPod GPU discovery")
    gpu_sub = gpu.add_subparsers(dest="gpu_command", required=True)
    gpu_list = gpu_sub.add_parser("list", help="List GPU types and current stock for a data center")
    gpu_list.add_argument("--data-center", dest="data_center", help="RunPod data-center ID; defaults to KRITI_RUNPOD_NETWORK_VOLUME_DATA_CENTER_ID")
    gpu_list.add_argument("--include-unavailable", action="store_true", help="Include GPU types offered in the data center with no current stock")
    return parser


def _api(config) -> RunPodApiClient:
    return RunPodApiClient(RunPodApiConfig(api_base_url=config.runpod_api_base_url, request_timeout_seconds=config.runpod_request_timeout_seconds))


def _provider(config, disposable: bool):
    if disposable:
        return RunPodDisposableProvider(
            RunPodDisposableConfig(
                network_volume_id=config.runpod_network_volume_id,
                template_id=config.runpod_disposable_template_id,
                image_name=config.runpod_disposable_image_name,
                gpu_type_ids=config.runpod_disposable_gpu_type_ids,
                gpu_count=config.runpod_disposable_gpu_count,
                name_prefix=config.runpod_disposable_name_prefix,
                worker_hostname_prefix=config.runpod_disposable_hostname_prefix,
                container_disk_gb=config.runpod_disposable_container_disk_gb,
                poll_interval_seconds=config.runpod_poll_interval_seconds,
            ),
            api=_api(config),
        )
    return RunPodProvider(
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


def _tailscale_transport(config, hostname: str) -> TailscaleTransport:
    return TailscaleTransport(TailscaleTransportConfig(hostname=hostname, user=config.tailscale_ssh_user, command_timeout_seconds=config.tailscale_command_timeout_seconds, health_timeout_seconds=config.tailscale_health_timeout_seconds))


def _run_preflight(args: argparse.Namespace) -> int:
    load_env_file(REPO_ROOT / ".env")
    config = load_compute_config()
    if args.existing_worker and args.disposable_worker:
        raise RuntimeError("--existing-worker and --disposable-worker cannot be used together")
    commit = _local_commit(args.commit, args.allow_dirty_local)
    provider = _provider(config, args.disposable_worker)
    if args.disposable_worker:
        def transport_factory(worker: WorkerInfo) -> TailscaleTransport:
            if not worker.hostname:
                raise RuntimeError("Disposable provider returned no runtime worker hostname")
            return _tailscale_transport(config, worker.hostname)
        orchestrator = PreflightOrchestrator(provider, transport_factory=transport_factory)
    else:
        orchestrator = PreflightOrchestrator(provider, _tailscale_transport(config, config.worker_hostname))
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
    if args.disposable_worker:
        print("RunPod mode: disposable worker; runtime Tailscale hostname will be derived from the Pod ID; " f"prefix={config.runpod_disposable_hostname_prefix} volume={config.runpod_network_volume_id or '<unset>'}")
    else:
        print(f"Worker target: {config.tailscale_ssh_user}@{config.worker_hostname}")
        if not args.existing_worker and config.runpod_capacity_retry_timeout_seconds > 0:
            print("RunPod capacity retry: " f"up to {config.runpod_capacity_retry_timeout_seconds:g}s every {config.runpod_capacity_retry_interval_seconds:g}s")
    if args.keep_worker_on_failure:
        print("WARNING: --keep-worker-on-failure can leave billable GPU compute running.")
    result = orchestrator.run(request)
    if result.worker_hostname:
        print(f"Resolved worker target: {config.tailscale_ssh_user}@{result.worker_hostname}")
    print(result.preflight_output, end="" if result.preflight_output.endswith("\n") else "\n")
    print(f"KRITI PREFLIGHT COMPLETE worker={result.worker_id} commit={result.commit_sha}")
    return 0


def _run_volume(args: argparse.Namespace) -> int:
    load_env_file(REPO_ROOT / ".env")
    config = load_compute_config()
    client = RunPodNetworkVolumeClient(_api(config))
    if args.volume_command == "create":
        if not args.confirm_create:
            raise RuntimeError("Refusing to create billable storage without --confirm-create. Review name, size, and data center in .env first.")
        if not config.runpod_network_volume_data_center_id:
            raise RuntimeError("KRITI_RUNPOD_NETWORK_VOLUME_DATA_CENTER_ID is required")
        volume = client.create(RunPodNetworkVolumeConfig(name=config.runpod_network_volume_name, size_gb=config.runpod_network_volume_size_gb, data_center_id=config.runpod_network_volume_data_center_id))
        print(f"RUNPOD NETWORK VOLUME CREATED id={volume['id']} name={volume.get('name', '')}")
        print("Set KRITI_RUNPOD_NETWORK_VOLUME_ID to the returned id before disposable-worker use.")
        return 0
    volume_id = args.volume_id or config.runpod_network_volume_id
    if not volume_id:
        raise RuntimeError("Network volume id is required")
    volume = client.get(volume_id)
    print(f"RUNPOD NETWORK VOLUME id={volume.get('id', volume_id)} name={volume.get('name', '')} size={volume.get('size', '')} dataCenterId={volume.get('dataCenterId', '')}")
    return 0


def _run_gpu(args: argparse.Namespace) -> int:
    load_env_file(REPO_ROOT / ".env")
    config = load_compute_config()
    data_center = (args.data_center or config.runpod_network_volume_data_center_id or "").strip()
    if not data_center:
        raise RuntimeError("--data-center or KRITI_RUNPOD_NETWORK_VOLUME_DATA_CENTER_ID is required")
    client = RunPodGpuDiscoveryClient(RunPodGpuDiscoveryConfig(request_timeout_seconds=config.runpod_request_timeout_seconds))
    gpus = client.list_for_data_center(data_center, include_unavailable=args.include_unavailable, secure_only=True)
    print(f"RUNPOD GPU DISCOVERY dataCenter={data_center} cloud=SECURE")
    if not gpus:
        print("No matching GPU types reported for this data center.")
        return 0
    print(f"{'STOCK':<10} {'VRAM':>6} {'PRICE/HR':>10}  {'GPU ID'}")
    for gpu in gpus:
        memory = f"{gpu['memoryInGb']}GB" if gpu.get('memoryInGb') is not None else "?"
        price = f"${float(gpu['securePrice']):.3f}" if gpu.get('securePrice') is not None else "?"
        print(f"{str(gpu.get('stockStatus', '?')):<10} {memory:>6} {price:>10}  {gpu.get('id', '')}")
    print("Read-only discovery only; no Pod, volume, or GPU resource was created or changed.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "preflight":
            return _run_preflight(args)
        if args.command == "volume":
            return _run_volume(args)
        if args.command == "gpu":
            return _run_gpu(args)
        parser.error(f"Unsupported command: {args.command}")
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"KRITI COMPUTE FAILED: {exc}", file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
