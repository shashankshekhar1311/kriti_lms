"""Read-only discovery of GPU IDs accepted by RunPod REST Pod creation."""

from __future__ import annotations

import json
from typing import Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ..exceptions import ComputeError


class RunPodRestSchemaClient:
    """Fetch the public REST OpenAPI schema and expose Pod-create GPU IDs."""

    def __init__(
        self,
        openapi_url: str = "https://rest.runpod.io/v1/openapi.json",
        *,
        request_timeout_seconds: float = 30.0,
        fetch_fn: Callable[[], Mapping[str, Any]] | None = None,
    ) -> None:
        self.openapi_url = openapi_url
        self.request_timeout_seconds = request_timeout_seconds
        self._fetch_fn = fetch_fn

    def _fetch(self) -> dict[str, Any]:
        if self._fetch_fn is not None:
            return dict(self._fetch_fn())
        request = Request(
            self.openapi_url,
            method="GET",
            headers={"Accept": "application/json", "User-Agent": "kriti-lms/compute"},
        )
        try:
            with urlopen(request, timeout=self.request_timeout_seconds) as response:
                raw = response.read()
        except HTTPError as exc:
            raise ComputeError(f"RunPod OpenAPI discovery failed with HTTP {exc.code}") from exc
        except URLError as exc:
            raise ComputeError(f"RunPod OpenAPI discovery failed: {exc.reason}") from exc
        except TimeoutError as exc:
            raise ComputeError("RunPod OpenAPI discovery timed out") from exc
        try:
            decoded = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ComputeError("RunPod OpenAPI discovery returned invalid JSON") from exc
        if not isinstance(decoded, Mapping):
            raise ComputeError("RunPod OpenAPI discovery returned an unexpected response")
        return dict(decoded)

    @staticmethod
    def _resolve_ref(document: Mapping[str, Any], node: Any) -> Any:
        seen: set[str] = set()
        while isinstance(node, Mapping) and isinstance(node.get("$ref"), str):
            ref = str(node["$ref"])
            if not ref.startswith("#/") or ref in seen:
                break
            seen.add(ref)
            target: Any = document
            for token in ref[2:].split("/"):
                token = token.replace("~1", "/").replace("~0", "~")
                if not isinstance(target, Mapping) or token not in target:
                    return node
                target = target[token]
            node = target
        return node

    def pod_create_gpu_type_ids(self) -> set[str]:
        document = self._fetch()
        try:
            post = document["paths"]["/pods"]["post"]
            schema: Any = post["requestBody"]["content"]["application/json"]["schema"]
        except (KeyError, TypeError) as exc:
            raise ComputeError("RunPod OpenAPI schema did not contain POST /pods request body") from exc

        schema = self._resolve_ref(document, schema)
        properties = schema.get("properties") if isinstance(schema, Mapping) else None
        if not isinstance(properties, Mapping):
            raise ComputeError("RunPod OpenAPI POST /pods schema did not contain properties")
        gpu_types: Any = self._resolve_ref(document, properties.get("gpuTypeIds"))
        if not isinstance(gpu_types, Mapping):
            raise ComputeError("RunPod OpenAPI POST /pods schema did not contain gpuTypeIds")
        items: Any = self._resolve_ref(document, gpu_types.get("items"))
        enum = items.get("enum") if isinstance(items, Mapping) else None
        if not isinstance(enum, list) or not enum:
            raise ComputeError("RunPod OpenAPI POST /pods gpuTypeIds did not contain an enum")
        return {str(value) for value in enum if isinstance(value, str) and value.strip()}
