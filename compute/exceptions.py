"""Exceptions raised by Kriti compute-provider integrations."""


class ComputeError(RuntimeError):
    """Base exception for compute lifecycle failures."""


class ComputeConfigurationError(ComputeError):
    """Raised when provider configuration is missing or invalid."""


class WorkerStartError(ComputeError):
    """Raised when a worker cannot be started."""


class RunPodCapacityUnavailableError(WorkerStartError):
    """Raised when the Pod's bound RunPod host has no GPU capacity available."""


class WorkerStopError(ComputeError):
    """Raised when a worker cannot be stopped."""


class WorkerReadinessTimeout(ComputeError):
    """Raised when a worker does not become ready within the requested timeout."""


class TransportError(ComputeError):
    """Base exception for worker transport failures."""


class TransportConfigurationError(TransportError):
    """Raised when worker transport configuration is missing or invalid."""


class TransportCommandError(TransportError):
    """Raised when a remote command cannot be executed successfully."""


class TransportDownloadError(TransportError):
    """Raised when a remote artifact cannot be downloaded safely."""
