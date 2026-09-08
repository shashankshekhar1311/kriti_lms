"""Tests for read-only RunPod GPU discovery."""

from __future__ import annotations

import unittest

from compute.exceptions import ComputeConfigurationError
from compute.providers.runpod_gpu import RunPodGpuDiscoveryClient


class FakeGraphQL:
    def __init__(self):
        self.queries = []

    def __call__(self, query):
        self.queries.append(query)
        if "gpuTypes" in query:
            return {
                "data": {
                    "gpuTypes": [
                        {"id": "NVIDIA L40S", "displayName": "L40S", "memoryInGb": 48, "secureCloud": True, "communityCloud": True, "securePrice": 0.86, "communityPrice": 0.79},
                        {"id": "NVIDIA RTX A6000", "displayName": "RTX A6000", "memoryInGb": 48, "secureCloud": True, "communityCloud": True, "securePrice": 0.49, "communityPrice": 0.43},
                        {"id": "NVIDIA GeForce RTX 4090", "displayName": "RTX 4090", "memoryInGb": 24, "secureCloud": False, "communityCloud": True, "securePrice": None, "communityPrice": 0.44},
                    ]
                }
            }
        return {
            "data": {
                "dataCenters": [
                    {
                        "id": "US-NE-1",
                        "name": "US-NE-1",
                        "location": "United States",
                        "gpuAvailability": [
                            {"gpuTypeId": "NVIDIA L40S", "displayName": "L40S", "stockStatus": "High"},
                            {"gpuTypeId": "NVIDIA RTX A6000", "displayName": "RTX A6000", "stockStatus": "None"},
                            {"gpuTypeId": "NVIDIA GeForce RTX 4090", "displayName": "RTX 4090", "stockStatus": "High"},
                        ],
                    }
                ]
            }
        }


class RunPodGpuDiscoveryTests(unittest.TestCase):
    def test_filters_to_secure_in_stock_gpu_for_requested_data_center(self):
        client = RunPodGpuDiscoveryClient(query_fn=FakeGraphQL())
        result = client.list_for_data_center("us-ne-1")
        self.assertEqual([gpu["id"] for gpu in result], ["NVIDIA L40S"])
        self.assertEqual(result[0]["memoryInGb"], 48)
        self.assertEqual(result[0]["stockStatus"], "High")

    def test_include_unavailable_keeps_secure_no_stock_gpu(self):
        client = RunPodGpuDiscoveryClient(query_fn=FakeGraphQL())
        result = client.list_for_data_center("US-NE-1", include_unavailable=True)
        self.assertEqual([gpu["id"] for gpu in result], ["NVIDIA L40S", "NVIDIA RTX A6000"])

    def test_unknown_data_center_fails_without_creating_resources(self):
        client = RunPodGpuDiscoveryClient(query_fn=FakeGraphQL())
        with self.assertRaises(ComputeConfigurationError):
            client.list_for_data_center("DOES-NOT-EXIST")


if __name__ == "__main__":
    unittest.main()
