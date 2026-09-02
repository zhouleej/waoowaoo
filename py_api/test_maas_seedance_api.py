import os
import sys
import unittest
from unittest.mock import patch
from types import ModuleType

from pydantic import ValidationError

os.environ.setdefault("MAAS_API_KEY", "test-maas-key")
os.environ.setdefault("MAAS_SEEDANCE_INTERNAL_API_KEY", "test-internal-key")
os.environ.setdefault("MAAS_SEEDANCE_ENABLE_VIDEO_ENCRYPT", "false")


class FakeMaasSeedanceClient:
    def __init__(self, **_kwargs: object) -> None:
        pass

    def set_video_file_encrypt_key(self, **_kwargs: object) -> None:
        pass

    def create_video_generation_task(self, _payload: object) -> str:
        return "unused"


fake_maas_seedance = ModuleType("maas_seedance")
fake_maas_seedance.MaasSeedanceClient = FakeMaasSeedanceClient
sys.modules["maas_seedance"] = fake_maas_seedance

from py_api import maas_seedance_api as adapter


class MaasSeedanceApiTest(unittest.TestCase):
    def test_forwards_supported_resolution_to_sdk_payload(self) -> None:
        request = adapter.VideoGenerationRequest(
            prompt="animate this image",
            image_url="https://media.example.com/first.png",
            resolution="1080p",
        )

        with patch.object(adapter.client, "create_video_generation_task", return_value="task-1080") as create_task:
            response = adapter.create_video_generation(
                request,
                f"Bearer {adapter.INTERNAL_API_KEY}",
            )

        self.assertEqual(response, {"id": "task-1080", "status": "processing"})
        self.assertEqual(create_task.call_args.args[0]["resolution"], "1080p")

    def test_rejects_unsupported_resolution_before_sdk_call(self) -> None:
        with self.assertRaises(ValidationError):
            adapter.VideoGenerationRequest(
                prompt="animate this image",
                image_url="https://media.example.com/first.png",
                resolution="2k",
            )


if __name__ == "__main__":
    unittest.main()
