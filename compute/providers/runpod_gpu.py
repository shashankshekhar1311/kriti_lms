"""Read-only RunPod GPU and data-center discovery via GraphQL."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ..exceptions import ComputeConfigurationError, ComputeError


@dataclass(frozen=True)
class RunPodGpuDiscoveryConfig:
    graphql_url: str = "https://api.runpod.io/graphql"
    request_timeout_seconds: float = 30.0


class RunPodGpuDiscoveryClient:
    """Minimal read-only GraphQL client for GPU placement discovery.

    The API key is read at runtime and sent as a bearer token. It is never
    included in the URL, output, or raised error text.
    """

    def __init__(
        self,
        config: RunPodGpuDiscoveryConfig | None = None,
        *,
        api_key: str | None = None,
        query_fn: Callable[[str], Mapping[str, Any]] | None = None,
    ) -> None:
        self.config = config or RunPodGpuDiscoveryConfig()
        self._explicit_api_key = api_key
        self._query_fn = query_fn

    def _resolve_api_key(self) -> str:
        key = (self._explicit_api_key or os.getenv("RUNPOD_API_KEY") or "").strip()
        if not key:
            raise ComputeConfigurationError(
                "RunPod API key is required. Set RUNPOD_API_KEY in the local environment or secret store."
            )
        return key

    def _query(self, query: str) -> dict[str, Any]:
        if self._query_fn is not None:
            return dict(self._query_fn(query))

        payload = json.dumps({"query": query}).encode("utf-8")
        request = Request(
            self.config.graphql_url,
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {self._resolve_api_key()}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "kriti-lms/compute",
            },
        )
        try:
            with urlopen(request, timeout=self.config.request_timeout_seconds) as response:
                raw = response.read()
        except HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", errors="replace").strip()
            except Exception:
                pass
            suffix = f": {detail[:1000]}" if detail else ""
            raise ComputeError(f"RunPod GPU discovery failed with HTTP {exc.code}{suffix}") from exc
        except URLError as exc:
            raise ComputeError(f"RunPod GPU discovery failed: {exc.reason}") from exc
        except TimeoutError as exc:
            raise ComputeError("RunPod GPU discovery timed out") from exc

        try:
            decoded = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ComputeError("RunPod GPU discovery returned invalid JSON") from exc
        if not isinstance(decoded, Mapping):
            raise ComputeError("RunPod GPU discovery returned an unexpected response")
        errors = decoded.get("errors")
        if errors:
            message = "GraphQL query failed"
            if isinstance(errors, list) and errors and isinstance(errors[0], Mapping):
                message = str(errors[0].get("message") or message)
            raise ComputeError(f"RunPod GPU discovery failed: {message}")
        return dict(decoded)

    def list_gpu_types(self) -> list[dict[str, Any]]:
        response = self._query(
            """
            query {
              gpuTypes {
                id
                displayName
                memoryInGb
                secureCloud
                communityCloud
                securePrice
                communityPrice
              }
            }
            """
        )
        data = response.get("data") or {}
        gpu_types = data.get("gpuTypes") if isinstance(data, Mapping) else None
        if not isinstance(gpu_types, list):
            raise ComputeError("RunPod GPU discovery response did not contain gpuTypes")
        return [dict(item) for item in gpu_types if isinstance(item, Mapping) and item.get("id") != "unknown"]

    def list_data_centers(self) -> list[dict[str, Any]]:
        response = self._query(
            """
            query {
              dataCenters {
                id
                name
                location
                gpuAvailability {
                  gpuTypeId
                  displayName
                  stockStatus
                }
              }
            }
            """
        )
        data = response.get("data") or {}
        centers = data.get("dataCenters") if isinstance(data, Mapping) else None
        if not isinstance(centers, list):
            raise ComputeError("RunPod GPU discovery response did not contain dataCenters")
        return [dict(item) for item in centers if isinstance(item, Mapping)]

    def list_for_data_center(
        self,
        data_center_id: str,
        *,
        include_unavailable: bool = False,
        secure_only: bool = True,
    ) -> list[dict[str, Any]]:
        target = data_center_id.strip().upper()
        if not target:
            raise ComputeConfigurationError("A RunPod data-center ID is required")

        gpu_by_id = {gpu["id"]: gpu for gpu in self.list_gpu_types() if gpu.get("id")}
        center = next(
            (dc for dc in self.list_data_centers() if str(dc.get("id", "")).upper() == target),
            None,
        )
        if center is None:
            raise ComputeConfigurationError(f"RunPod data center not found: {data_center_id}")

        result: list[dict[str, Any]] = []
        availability = center.get("gpuAvailability") or []
        for entry in availability:
            if not isinstance(entry, Mapping):
                continue
            gpu_id = str(entry.get("gpuTypeId") or "").strip()
            gpu = gpu_by_id.get(gpu_id, {})
            if secure_only and gpu and not bool(gpu.get("secureCloud")):
                continue
            stock = str(entry.get("stockStatus") or "none").strip() or "none"
            has_stock = stock.lower() not in {"none", "unavailable", "out of stock", "no stock"}
            if not include_unavailable and not has_stock:
                continue
            result.append(
                {
                    "id": gpu_id,
                    "displayName": gpu.get("displayName") or entry.get("displayName") or gpu_id,
                    "memoryInGb": gpu.get("memoryInGb"),
                    "stockStatus": stock,
                    "secureCloud": gpu.get("secureCloud"),
                    "securePrice": gpu.get("securePrice"),
                }
            )

        stock_rank = {"high": 0, "medium": 1, "low": 2}
        result.sort(
            key=lambda item: (
                stock_rank.get(str(item.get("stockStatus", "")).lower(), 3),
                -(int(item.get("memoryInGb") or 0)),
                str(item.get("displayName") or ""),
            )
        )
        return result
