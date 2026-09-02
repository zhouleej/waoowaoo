import os
import sys
import unittest
from unittest.mock import patch
from types import ModuleType

from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("MAAS_API_KEY", "test-maas-key")
os.environ.setdefault("MAAS_SEEDANCE_INTERNAL_API_KEY", "test-internal-key")
os.environ.setdefault("MAAS_SEEDANCE_ENABLE_VIDEO_ENCRYPT", "false")


class FakeResponse:
    def __init__(self, status_code: int, body: object) -> None:
        self.status_code = status_code
        self._body = body

    def json(self) -> object:
        return self._body


class FakeSecureHttpClient:
    def __init__(self) -> None:
        self.response = FakeResponse(200, {"id": "unused"})

    def post(self, _url: str, **_kwargs: object) -> FakeResponse:
        return self.response


class FakeMaasSeedanceClient:
    def __init__(self, **_kwargs: object) -> None:
        self.secure_http_client = FakeSecureHttpClient()

    def set_video_file_encrypt_key(self, **_kwargs: object) -> None:
        pass

    def create_video_generation_task(self, _payload: object) -> str:
        response = self.secure_http_client.post(
            "https://mobile-cloud.example.com/api/v3/contents/generations/tasks",
        )
        return "unused" if response.status_code == 200 else ""


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

    def test_maps_upstream_real_person_rejection_to_sensitive_content_error(self) -> None:
        adapter.client.secure_http_client.response = FakeResponse(400, {
            "error": {
                "code": "InputImageSensitiveContentDetected.PrivacyInformation",
                "message": "The request failed because the input image may contain real person.",
            },
        })
        request = adapter.VideoGenerationRequest(
            prompt="animate this image",
            image_url="https://media.example.com/first.png",
        )

        with self.assertRaises(HTTPException) as raised:
            adapter.create_video_generation(request, f"Bearer {adapter.INTERNAL_API_KEY}")

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(raised.exception.detail, {
            "code": "SENSITIVE_CONTENT",
            "message": "输入图片审核未通过：图片可能包含真实人物或可识别的个人信息。请更换为不含真人的图片后重试。",
        })


if __name__ == "__main__":
    unittest.main()
