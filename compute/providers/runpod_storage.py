"""RunPod network-volume helpers for durable Kriti workspace storage."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping

from ..exceptions import ComputeConfigurationError, ComputeError
from .runpod_api import RunPodApiClient

RequestFn = Callable[[str, str, Mapping[str, Any] | None], Mapping[str, Any]]


@dataclass(frozen=True)
class RunPodNetworkVolumeConfig:
    name: str
    size_gb: int
    data_center_id: str


class RunPodNetworkVolumeClient:
    """Create and inspect RunPod network volumes.

    Volume creation is explicit. Merely constructing this client never creates or
    bills storage.
    """

    def __init__(
        self,
        api: RunPodApiClient | None = None,
        *,
        request_fn: RequestFn | None = None,
    ) -> None:
        self.api = api or RunPodApiClient()
        self._request_fn = request_fn or self.api.request

    @staticmethod
    def _validate(config: RunPodNetworkVolumeConfig) -> None:
        if not config.name.strip():
            raise ComputeConfigurationError("Network volume name is required")
        if config.size_gb <= 0:
            raise ComputeConfigurationError("Network volume size_gb must be > 0")
        if not config.data_center_id.strip():
            raise ComputeConfigurationError("Network volume data_center_id is required")

    def create(self, config: RunPodNetworkVolumeConfig) -> dict[str, Any]:
        self._validate(config)
        result = self._request_fn(
            "POST",
            "networkvolumes",
            {
                "name": config.name.strip(),
                "size": config.size_gb,
                "dataCenterId": config.data_center_id.strip(),
            },
        )
        if not result.get("id"):
            raise ComputeError("RunPod network-volume creation returned no volume id")
        return dict(result)

    def get(self, volume_id: str) -> dict[str, Any]:
        volume_id = volume_id.strip()
        if not volume_id:
            raise ComputeConfigurationError("Network volume id is required")
        result = self._request_fn("GET", f"networkvolumes/{volume_id}", None)
        if not result:
            raise ComputeError(f"RunPod returned no data for network volume {volume_id}")
        return dict(result)
