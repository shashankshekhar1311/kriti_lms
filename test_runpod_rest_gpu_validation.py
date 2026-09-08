from __future__ import annotations

import unittest

from compute.providers.runpod_rest_schema import RunPodRestSchemaClient


class RunPodRestSchemaTests(unittest.TestCase):
    def schema(self):
        return {
            "paths": {
                "/pods": {
                    "post": {
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/CreatePod"}
                                }
                            }
                        }
                    }
                }
            },
            "components": {
                "schemas": {
                    "CreatePod": {
                        "type": "object",
                        "properties": {
                            "gpuTypeIds": {
                                "type": "array",
                                "items": {
                                    "type": "string",
                                    "enum": [
                                        "NVIDIA RTX PRO 6000 Blackwell Server Edition",
                                        "NVIDIA H100 80GB HBM3",
                                    ],
                                },
                            }
                        },
                    }
                }
            },
        }

    def test_extracts_only_rest_accepted_gpu_ids(self):
        client = RunPodRestSchemaClient(fetch_fn=self.schema)
        accepted = client.pod_create_gpu_type_ids()
        self.assertIn("NVIDIA RTX PRO 6000 Blackwell Server Edition", accepted)
        self.assertNotIn("NVIDIA RTX PRO 6000 Blackwell Server Edition MIG 2g.48gb", accepted)

    def test_openapi_fetch_is_read_only(self):
        calls = []
        def fetch():
            calls.append("GET")
            return self.schema()
        RunPodRestSchemaClient(fetch_fn=fetch).pod_create_gpu_type_ids()
        self.assertEqual(calls, ["GET"])


if __name__ == "__main__":
    unittest.main()
