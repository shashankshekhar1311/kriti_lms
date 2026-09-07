"""RunPod REST API lifecycle provider for Kriti LMS.

The provider manages only pod lifecycle and RunPod control-plane readiness.
Transport readiness (Tailscale/SSH), repository sync, rendering, and artifact
transfer remain separate concerns.

RunPod API credentials are read from ``RUNPOD_API_KEY`` by default and are never
written to logs or persisted by this module.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from ..exceptions import (
    ComputeConfigurationError,
    ComputeError,
    RunPodCapacityUnavailableError,
    WorkerReadinessTimeout,
    WorkerStartError,
    WorkerStopError,
)
from ..models import WorkerInfo, WorkerState, WorkerStatus
from ..provider import ComputeProvider


JsonMapping = Mapping[str, Any]
RequestFn = Callable[[str, str], JsonMapping]

_CAPACITY_ERROR_MARKERS = (
    "not enough free gpus",
    "gpu is no longer available",
    "gpus are no longer available",
    "zero gpu",
    "zero gpus",
)


@dataclass(frozen=True)
class RunPodProviderConfig:
    """Non-secret configuration for an existing RunPod pod."""

    pod_id: str | None = None
    api_base_url: str = "https://rest.runpod.io/v1"
    worker_hostname: str = "kriti-runpod"
    request_timeout_seconds: float = 30.0
    poll_interval_seconds: float = 5.0
    capacity_retry_timeout_seconds: float = 180.0
    capacity_retry_interval_seconds: float = 15.0


class RunPodProvider(ComputeProvider):
    """Manage an existing RunPod pod through the official REST API v1.

    ``start`` and ``stop`` are idempotent from Kriti's perspective. ``status``
    maps RunPod's ``desiredStatus`` into provider-neutral worker states.
    ``wait_until_ready`` waits for RunPod to report the pod as RUNNING; later
    transport/preflight slices are responsible for proving the container itself
    is reachable and ready for a render job.
    """

    provider_name = "runpod"

    def __init__(
        self,
        config: RunPodProviderConfig | None = None,
        *,
        api_key: str | None = None,
        request_fn: RequestFn | None = None,
        sleep_fn: Callable[[float], None] = time.sleep,
        monotonic_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        self.config = config or RunPodProviderConfig()
        self._explicit_api_key = api_key
        self._request_fn = request_fn or self._request_json
        self._sleep = sleep_fn
        self._monotonic = monotonic_fn

    def _require_pod_id(self) -> str:
        pod_id = (self.config.pod_id or "").strip()
        if not pod_id:
            raise ComputeConfigurationError(
                "RunPod pod ID is required. Set KRITI_RUNPOD_POD_ID or pass "
                "RunPodProviderConfig(pod_id=...)."
            )
        return pod_id

    def _resolve_api_key(self) -> str:
        key = (self._explicit_api_key or os.getenv("RUNPOD_API_KEY") or "").strip()
        if not key:
            raise ComputeConfigurationError(
                "RunPod API key is required. Set RUNPOD_API_KEY in the local "
                "environment or secret store; never commit the key to Git."
            )
        return key

    def _request_json(self, method: str, path: str) -> JsonMapping:
        """Call RunPod REST API v1 using only the Python standard library."""
        api_key = self._resolve_api_key()
        base_url = self.config.api_base_url.rstrip("/")
        url = f"{base_url}/{path.lstrip('/')}"
        body = b"" if method.upper() == "POST" else None
        request = Request(
            url,
            data=body,
            method=method.upper(),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
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
                detail = ""
            suffix = f": {detail[:500]}" if detail else ""
            raise ComputeError(
                f"RunPod API request failed with HTTP {exc.code} ({method.upper()} {path}){suffix}"
            ) from exc
        except URLError as exc:
            raise ComputeError(
                f"RunPod API request failed ({method.upper()} {path}): {exc.reason}"
            ) from exc
        except TimeoutError as exc:
            raise ComputeError(
                f"RunPod API request timed out ({method.upper()} {path})"
            ) from exc

        if not raw:
            return {}
        try:
            decoded = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ComputeError(
                f"RunPod API returned an invalid JSON response ({method.upper()} {path})"
            ) from exc
        if not isinstance(decoded, Mapping):
            raise ComputeError(
                f"RunPod API returned an unexpected response ({method.upper()} {path})"
            )
        return decoded

    def _pod_path(self, suffix: str = "") -> str:
        pod_id = quote(self._require_pod_id(), safe="")
        return f"pods/{pod_id}{suffix}"

    @staticmethod
    def _desired_status(payload: JsonMapping) -> str:
        return str(payload.get("desiredStatus") or "").strip().upper()

    @staticmethod
    def _is_capacity_error(exc: BaseException) -> bool:
        text = str(exc).lower()
        return any(marker in text for marker in _CAPACITY_ERROR_MARKERS)

    @classmethod
    def _state_from_payload(cls, payload: JsonMapping) -> WorkerState:
        desired = cls._desired_status(payload)
        if desired == "RUNNING":
            return WorkerState.RUNNING
        if desired in {"EXITED", "TERMINATED"}:
            return WorkerState.STOPPED
        return WorkerState.UNKNOWN

    def _metadata_from_payload(self, payload: JsonMapping) -> dict[str, Any]:
        keys = (
            "desiredStatus",
            "name",
            "machineId",
            "lastStartedAt",
            "lastStatusChange",
            "portMappings",
        )
        return {key: payload.get(key) for key in keys if payload.get(key) is not None}

    def _worker_info(self, payload: JsonMapping) -> WorkerInfo:
        return WorkerInfo(
            worker_id=str(payload.get("id") or self._require_pod_id()),
            provider=self.provider_name,
            state=self._state_from_payload(payload),
            hostname=self.config.worker_hostname or None,
            public_ip=str(payload.get("publicIp")) if payload.get("publicIp") else None,
            metadata=self._metadata_from_payload(payload),
        )

    def _get_pod(self) -> JsonMapping:
        payload = self._request_fn("GET", self._pod_path())
        if not payload:
            raise ComputeError("RunPod API returned no pod data")
        return payload

    def _start_with_capacity_retry(self) -> None:
        timeout = max(0.0, self.config.capacity_retry_timeout_seconds)
        interval = max(0.0, self.config.capacity_retry_interval_seconds)
        deadline = self._monotonic() + timeout
        attempts = 0
        last_error: BaseException | None = None

        while True:
            attempts += 1
            try:
                self._request_fn("POST", self._pod_path("/start"))
                return
            except ComputeError as exc:
                if not self._is_capacity_error(exc):
                    raise
                last_error = exc

            if timeout <= 0 or self._monotonic() >= deadline:
                pod_id = self._require_pod_id()
                raise RunPodCapacityUnavailableError(
                    f"RunPod pod {pod_id} is still bound to a host with no free GPU after "
                    f"{attempts} start attempt(s). RunPod stopped Pods release their GPU, so "
                    "the original machine may be occupied. Use RunPod's automatic Pod migration "
                    "when available, or redeploy on available GPU capacity. For a durable Kriti "
                    "architecture, keep /workspace on a RunPod network volume so a replacement "
                    "Pod can attach the same data."
                ) from last_error

            self._sleep(interval)

    def start(self) -> WorkerInfo:
        """Start/resume the configured pod, retrying temporary host-capacity failures."""
        try:
            current = self._get_pod()
            desired = self._desired_status(current)
            if desired == "TERMINATED":
                raise WorkerStartError(
                    f"RunPod pod {self._require_pod_id()} is terminated and cannot be resumed"
                )
            if desired == "RUNNING":
                return self._worker_info(current)

            self._start_with_capacity_retry()
            return self._worker_info(self._get_pod())
        except (ComputeConfigurationError, RunPodCapacityUnavailableError, WorkerStartError):
            raise
        except ComputeError as exc:
            raise WorkerStartError(
                f"Failed to start RunPod pod {self.config.pod_id or '<unset>'}: {exc}"
            ) from exc
        except Exception as exc:
            raise WorkerStartError(
                f"Failed to start RunPod pod {self.config.pod_id or '<unset>'}: {exc}"
            ) from exc

    def stop(self) -> None:
        """Stop the configured pod; already stopped/terminated pods are a no-op."""
        try:
            current = self._get_pod()
            if self._desired_status(current) in {"EXITED", "TERMINATED"}:
                return
            self._request_fn("POST", self._pod_path("/stop"))
        except ComputeConfigurationError:
            raise
        except ComputeError as exc:
            raise WorkerStopError(
                f"Failed to stop RunPod pod {self.config.pod_id or '<unset>'}: {exc}"
            ) from exc
        except Exception as exc:
            raise WorkerStopError(
                f"Failed to stop RunPod pod {self.config.pod_id or '<unset>'}: {exc}"
            ) from exc

    def status(self) -> WorkerStatus:
        """Return the current provider-neutral status for the configured pod."""
        payload = self._get_pod()
        desired = self._desired_status(payload) or "UNKNOWN"
        return WorkerStatus(
            worker_id=str(payload.get("id") or self._require_pod_id()),
            provider=self.provider_name,
            state=self._state_from_payload(payload),
            message=f"RunPod desiredStatus={desired}",
            metadata=self._metadata_from_payload(payload),
        )

    def wait_until_ready(self, timeout: int = 600) -> WorkerInfo:
        """Wait until RunPod reports desiredStatus=RUNNING.

        This is deliberately a control-plane check only. Tailscale/SSH and Kriti
        preflight readiness are validated by later orchestration layers.
        """
        if timeout <= 0:
            raise ValueError("timeout must be greater than zero")

        deadline = self._monotonic() + timeout
        last_status = "UNKNOWN"
        while True:
            payload = self._get_pod()
            desired = self._desired_status(payload)
            last_status = desired or "UNKNOWN"
            if desired == "RUNNING":
                return self._worker_info(payload)
            if desired == "TERMINATED":
                raise WorkerStartError(
                    f"RunPod pod {self._require_pod_id()} became TERMINATED while waiting for readiness"
                )
            if self._monotonic() >= deadline:
                raise WorkerReadinessTimeout(
                    f"RunPod pod {self._require_pod_id()} did not reach RUNNING within "
                    f"{timeout}s (last desiredStatus={last_status})"
                )
            self._sleep(max(0.0, self.config.poll_interval_seconds))
