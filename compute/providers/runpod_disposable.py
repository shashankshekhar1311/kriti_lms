"""Disposable RunPod worker provisioning backed by a network volume."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any, Callable, Mapping

from ..exceptions import (
    ComputeConfigurationError,
    WorkerReadinessTimeout,
    WorkerStartError,
    WorkerStopError,
)
from ..models import WorkerInfo, WorkerState, WorkerStatus
from ..provider import ComputeProvider
from .runpod_api import RunPodApiClient

RequestFn = Callable[[str, str, Mapping[str, Any] | None], Mapping[str, Any]]


@dataclass(frozen=True)
class RunPodDisposableConfig:
    """Configuration for one-at-a-time disposable GPU workers."""

    network_volume_id: str | None = None
    template_id: str | None = None
    image_name: str | None = None
    gpu_type_ids: tuple[str, ...] = ()
    gpu_count: int = 1
    name_prefix: str = "kriti-worker"
    worker_hostname_prefix: str = "kriti-worker"
    container_disk_gb: int = 50
    volume_mount_path: str = "/workspace"
    poll_interval_seconds: float = 5.0
    interruptible: bool = False
    support_public_ip: bool = True


class RunPodDisposableProvider(ComputeProvider):
    """Create an available GPU Pod and delete it when work finishes.

    Persistent data lives on a RunPod network volume. Tailscale identity is
    intentionally *not* persistent: every disposable Pod derives a unique
    hostname from the RunPod Pod ID, for example ``kriti-worker-abc123``.
    ``stop()`` deletes the Pod while preserving the attached network volume.
    """

    provider_name = "runpod-disposable"

    def __init__(
        self,
        config: RunPodDisposableConfig,
        api: RunPodApiClient | None = None,
        *,
        request_fn: RequestFn | None = None,
        sleep_fn: Callable[[float], None] = time.sleep,
        monotonic_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        self.config = config
        self.api = api or RunPodApiClient()
        self._request_fn = request_fn or self.api.request
        self._sleep = sleep_fn
        self._monotonic = monotonic_fn
        self._pod_id: str | None = None
        self._validate_config()

    def _validate_config(self) -> None:
        if not (self.config.network_volume_id or "").strip():
            raise ComputeConfigurationError(
                "KRITI_RUNPOD_NETWORK_VOLUME_ID is required for disposable workers"
            )
        if not self.config.gpu_type_ids:
            raise ComputeConfigurationError(
                "At least one RunPod GPU type id is required for disposable workers"
            )
        if self.config.gpu_count <= 0:
            raise ComputeConfigurationError("gpu_count must be > 0")
        if self.config.container_disk_gb <= 0:
            raise ComputeConfigurationError("container_disk_gb must be > 0")
        if not (self.config.template_id or self.config.image_name):
            raise ComputeConfigurationError(
                "Configure a RunPod template id or image name for disposable workers"
            )
        if not self.config.volume_mount_path.strip():
            raise ComputeConfigurationError("volume_mount_path is required")
        if not self.config.worker_hostname_prefix.strip():
            raise ComputeConfigurationError("worker_hostname_prefix is required")

    @staticmethod
    def _desired_status(payload: Mapping[str, Any]) -> str:
        return str(payload.get("desiredStatus") or "").strip().upper()

    @classmethod
    def _state(cls, payload: Mapping[str, Any]) -> WorkerState:
        desired = cls._desired_status(payload)
        if desired == "RUNNING":
            return WorkerState.RUNNING
        if desired in {"EXITED", "TERMINATED"}:
            return WorkerState.STOPPED
        return WorkerState.UNKNOWN

    @staticmethod
    def _dns_label(value: str) -> str:
        """Return a Tailscale/MagicDNS-safe machine label (<=63 chars)."""
        label = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower())
        label = re.sub(r"-+", "-", label).strip("-")
        if not label:
            raise ComputeConfigurationError("Disposable worker hostname is empty after normalization")
        label = label[:63].rstrip("-")
        if not label or not label[0].isalpha():
            label = f"k-{label}"[:63].rstrip("-")
        return label

    def hostname_for_pod(self, pod_id: str) -> str:
        pod = self._dns_label(pod_id)
        prefix = self._dns_label(self.config.worker_hostname_prefix)
        max_prefix = max(1, 63 - len(pod) - 1)
        prefix = prefix[:max_prefix].rstrip("-") or "k"
        return self._dns_label(f"{prefix}-{pod}")

    def _info(self, payload: Mapping[str, Any]) -> WorkerInfo:
        pod_id = str(payload.get("id") or self._pod_id or "").strip()
        hostname = self.hostname_for_pod(pod_id) if pod_id else None
        return WorkerInfo(
            worker_id=pod_id,
            provider=self.provider_name,
            state=self._state(payload),
            hostname=hostname,
            public_ip=str(payload.get("publicIp")) if payload.get("publicIp") else None,
            metadata={
                **{
                    key: payload.get(key)
                    for key in (
                        "desiredStatus",
                        "name",
                        "machineId",
                        "lastStartedAt",
                        "networkVolumeId",
                        "costPerHr",
                    )
                    if payload.get(key) is not None
                },
                "workerHostname": hostname,
            },
        )

    def _payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "name": f"{self.config.name_prefix}-{int(time.time())}",
            "cloudType": "SECURE",
            "computeType": "GPU",
            "gpuCount": self.config.gpu_count,
            "gpuTypeIds": list(self.config.gpu_type_ids),
            "gpuTypePriority": "availability",
            "dataCenterPriority": "availability",
            "networkVolumeId": self.config.network_volume_id,
            "volumeMountPath": self.config.volume_mount_path,
            "containerDiskInGb": self.config.container_disk_gb,
            "interruptible": self.config.interruptible,
            "supportPublicIp": self.config.support_public_ip,
        }
        if self.config.template_id:
            payload["templateId"] = self.config.template_id
        if self.config.image_name:
            payload["imageName"] = self.config.image_name
        return payload

    def start(self) -> WorkerInfo:
        if self._pod_id:
            return self._info(self._request_fn("GET", f"pods/{self._pod_id}", None))
        try:
            payload = self._request_fn("POST", "pods", self._payload())
        except Exception as exc:
            raise WorkerStartError(f"Failed to provision disposable RunPod worker: {exc}") from exc
        pod_id = str(payload.get("id") or "").strip()
        if not pod_id:
            raise WorkerStartError("RunPod Pod creation returned no pod id")
        self._pod_id = pod_id
        return self._info(payload)

    def stop(self) -> None:
        """Delete the disposable Pod while preserving the attached network volume."""
        if not self._pod_id:
            return
        pod_id = self._pod_id
        try:
            self._request_fn("DELETE", f"pods/{pod_id}", None)
        except Exception as exc:
            raise WorkerStopError(f"Failed to delete disposable RunPod pod {pod_id}: {exc}") from exc
        finally:
            self._pod_id = None

    def status(self) -> WorkerStatus:
        if not self._pod_id:
            return WorkerStatus(
                worker_id="",
                provider=self.provider_name,
                state=WorkerState.STOPPED,
                message="No disposable worker is currently provisioned",
                metadata={},
            )
        payload = self._request_fn("GET", f"pods/{self._pod_id}", None)
        desired = self._desired_status(payload) or "UNKNOWN"
        return WorkerStatus(
            worker_id=self._pod_id,
            provider=self.provider_name,
            state=self._state(payload),
            message=f"RunPod desiredStatus={desired}",
            metadata={
                "networkVolumeId": self.config.network_volume_id,
                "workerHostname": self.hostname_for_pod(self._pod_id),
            },
        )

    def wait_until_ready(self, timeout: int = 600) -> WorkerInfo:
        if not self._pod_id:
            raise WorkerStartError("Disposable worker has not been provisioned")
        if timeout <= 0:
            raise ValueError("timeout must be greater than zero")
        deadline = self._monotonic() + timeout
        last_status = "UNKNOWN"
        while True:
            payload = self._request_fn("GET", f"pods/{self._pod_id}", None)
            desired = self._desired_status(payload)
            last_status = desired or "UNKNOWN"
            if desired == "RUNNING":
                return self._info(payload)
            if desired == "TERMINATED":
                raise WorkerStartError(f"Disposable RunPod pod {self._pod_id} became TERMINATED")
            if self._monotonic() >= deadline:
                raise WorkerReadinessTimeout(
                    f"Disposable RunPod pod {self._pod_id} did not reach RUNNING within {timeout}s "
                    f"(last desiredStatus={last_status})"
                )
            self._sleep(max(0.0, self.config.poll_interval_seconds))
