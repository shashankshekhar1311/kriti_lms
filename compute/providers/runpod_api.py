"""Small dependency-free RunPod REST client used by provisioning helpers."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ..exceptions import ComputeConfigurationError, ComputeError

JsonMapping = Mapping[str, Any]


@dataclass(frozen=True)
class RunPodApiConfig:
    api_base_url: str = "https://rest.runpod.io/v1"
    request_timeout_seconds: float = 30.0


class RunPodApiClient:
    """Minimal JSON client for RunPod REST API v1.

    Secrets are read at runtime and never included in logs or returned errors.
    """

    def __init__(self, config: RunPodApiConfig | None = None, *, api_key: str | None = None) -> None:
        self.config = config or RunPodApiConfig()
        self._explicit_api_key = api_key

    def _resolve_api_key(self) -> str:
        key = (self._explicit_api_key or os.getenv("RUNPOD_API_KEY") or "").strip()
        if not key:
            raise ComputeConfigurationError(
                "RunPod API key is required. Set RUNPOD_API_KEY in the local environment or secret store."
            )
        return key

    def request(self, method: str, path: str, body: JsonMapping | None = None) -> dict[str, Any]:
        base_url = self.config.api_base_url.rstrip("/")
        url = f"{base_url}/{path.lstrip('/')}"
        payload = json.dumps(dict(body)).encode("utf-8") if body is not None else None
        request = Request(
            url,
            data=payload,
            method=method.upper(),
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
                detail = ""
            suffix = f": {detail[:1000]}" if detail else ""
            raise ComputeError(
                f"RunPod API request failed with HTTP {exc.code} ({method.upper()} {path}){suffix}"
            ) from exc
        except URLError as exc:
            raise ComputeError(
                f"RunPod API request failed ({method.upper()} {path}): {exc.reason}"
            ) from exc
        except TimeoutError as exc:
            raise ComputeError(f"RunPod API request timed out ({method.upper()} {path})") from exc

        if not raw:
            return {}
        try:
            decoded = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ComputeError(
                f"RunPod API returned invalid JSON ({method.upper()} {path})"
            ) from exc
        if not isinstance(decoded, Mapping):
            raise ComputeError(
                f"RunPod API returned an unexpected response ({method.upper()} {path})"
            )
        return dict(decoded)
