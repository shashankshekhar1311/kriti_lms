"""RunPod compute-provider boundary.

Slice 1 establishes the provider API without making RunPod API calls. This keeps
current manual pod start/stop behavior unchanged while giving later slices a
stable integration point.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..exceptions import ComputeConfigurationError
from ..models import WorkerInfo, WorkerState, WorkerStatus
from ..provider import ComputeProvider


@dataclass(frozen=True)
class RunPodProviderConfig:
    """Non-secret configuration identifying the RunPod worker to manage later."""

    pod_id: str | None = None
    endpoint: str | None = None


class RunPodProvider(ComputeProvider):
    """RunPod lifecycle provider skeleton for Slice 1.

    API-backed lifecycle methods are intentionally deferred to the next slice.
    Instantiating this class is safe; calling lifecycle methods clearly reports
    that automation has not yet been enabled.
    """

    provider_name = "runpod"

    def __init__(self, config: RunPodProviderConfig | None = None) -> None:
        self.config = config or RunPodProviderConfig()

    def _not_implemented(self) -> ComputeConfigurationError:
        return ComputeConfigurationError(
            "RunPod API lifecycle automation is not enabled in Slice 1; "
            "continue using the existing manual RunPod start/stop workflow."
        )

    def start(self) -> WorkerInfo:
        raise self._not_implemented()

    def stop(self) -> None:
        raise self._not_implemented()

    def status(self) -> WorkerStatus:
        if not self.config.pod_id:
            return WorkerStatus(
                worker_id=None,
                provider=self.provider_name,
                state=WorkerState.UNKNOWN,
                message="No RunPod pod_id configured; lifecycle remains manual in Slice 1.",
            )
        return WorkerStatus(
            worker_id=self.config.pod_id,
            provider=self.provider_name,
            state=WorkerState.UNKNOWN,
            message="RunPod API status lookup is deferred until lifecycle automation is enabled.",
        )

    def wait_until_ready(self, timeout: int = 600) -> WorkerInfo:
        del timeout
        raise self._not_implemented()
