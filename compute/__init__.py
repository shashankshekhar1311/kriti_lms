"""Compute provider abstractions for Kriti LMS.

This package isolates GPU worker lifecycle management from lesson generation and
rendering logic. Slice 1 intentionally introduces interfaces and models only;
it does not change the existing Chapter_Agent workflow.
"""

from .models import WorkerInfo, WorkerState, WorkerStatus
from .provider import ComputeProvider

__all__ = ["ComputeProvider", "WorkerInfo", "WorkerState", "WorkerStatus"]
