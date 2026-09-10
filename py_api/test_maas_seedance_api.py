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


class FakeAICCException(Exception):
    pass


class FakeSecureHttpClient:
    def __init__(self) -> None:
        self.response = FakeResponse(200, {"id": "unused"})

    def post(self, _url: str, **_kwargs: object) -> FakeResponse:
        return self.response


class FakeVolcClient:
    def __init__(self) -> None:
        self.secure_http_client = FakeSecureHttpClient()


class FakeMaasSeedanceClient:
    def __init__(self, **_kwargs: object) -> None:
        # SDK 1.1 moved secure_http_client under volc_client.
        self.volc_client = FakeVolcClient()

    def set_video_file_encrypt_key(self, **_kwargs: object) -> None:
        pass

    def create_video_generation_task(self, _payload: object) -> str:
        response = self.volc_client.secure_http_client.post(
            "https://mobile-cloud.example.com/api/v3/contents/generations/tasks",
        )
        if response.status_code == 200:
            return "unused"
        raise FakeAICCException("create seedance task error")


fake_maas_seedance = ModuleType("maas_seedance")
fake_maas_seedance.MaasSeedanceClient = FakeMaasSeedanceClient
sys.modules["maas_seedance"] = fake_maas_seedance

from py_api import maas_seedance_api as adapter


class MaasSeedanceApiTest(unittest.TestCase):
    def test_accepts_text_only_content(self) -> None:
        request = adapter.VideoGenerationRequest(prompt="A rainy street")
        self.assertEqual(adapter.build_content(request), [{"type": "text", "text": "A rainy street"}])

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

    def test_maps_new_sdk_real_person_exception_to_sensitive_content_error(self) -> None:
        adapter.client.volc_client.secure_http_client.response = FakeResponse(400, {
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

    def test_maps_sdk_exception_without_http_response_to_gateway_error(self) -> None:
        request = adapter.VideoGenerationRequest(
            prompt="animate this image",
            image_url="https://media.example.com/first.png",
        )

        with patch.object(
            adapter.client,
            "create_video_generation_task",
            side_effect=FakeAICCException("temporary SDK failure"),
        ), self.assertRaises(HTTPException) as raised:
            adapter.create_video_generation(request, f"Bearer {adapter.INTERNAL_API_KEY}")

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail, {
            "code": "MAAS_SEEDANCE_UPSTREAM_ERROR",
            "message": "移动云视频生成请求失败，请稍后重试。",
        })

    def test_maps_sensitive_content_embedded_in_sdk_exception(self) -> None:
        request = adapter.VideoGenerationRequest(
            prompt="animate this image",
            image_url="https://media.example.com/first.png",
        )
        sdk_error = FakeAICCException(
            "create seedance task error: "
            '{"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation"}}',
        )

        with patch.object(
            adapter.client,
            "create_video_generation_task",
            side_effect=sdk_error,
        ), self.assertRaises(HTTPException) as raised:
            adapter.create_video_generation(request, f"Bearer {adapter.INTERNAL_API_KEY}")

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(raised.exception.detail["code"], "SENSITIVE_CONTENT")


if __name__ == "__main__":
    unittest.main()
