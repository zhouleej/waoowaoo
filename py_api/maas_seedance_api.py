import os
import tempfile
import ipaddress
import json
import logging
import threading
import urllib.request
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from maas_seedance import MaasSeedanceClient

# python -m uvicorn py_api.maas_seedance_api:app --host 0.0.0.0 --port 8000 --reload

MAAS_BASE_URL = os.getenv("MAAS_BASE_URL", "https://zhenze-huhehaote.cmecloud.cn/api/v3")
MAAS_API_KEY = os.getenv("MAAS_API_KEY", "qzuthZNrHq7V9WQQMclw6YgLcj7hofROdCzfKDqtkno").strip()
MAAS_MODEL = os.getenv("MAAS_MODEL", "doubao-seedance-2.0")
INTERNAL_API_KEY = os.getenv("MAAS_SEEDANCE_INTERNAL_API_KEY", "waoowaoo-internal-seedance-token").strip()
if not MAAS_API_KEY:
    raise RuntimeError("MAAS_API_KEY environment variable is required")
if not INTERNAL_API_KEY:
    raise RuntimeError("MAAS_SEEDANCE_INTERNAL_API_KEY environment variable is required")
ENABLE_VIDEO_ENCRYPT = os.getenv("MAAS_SEEDANCE_ENABLE_VIDEO_ENCRYPT", "true").lower() in {"1", "true", "yes"}
PUBLIC_KEY_PATH = os.getenv("MAAS_SEEDANCE_PUBLIC_KEY_PATH", "./tmp/seedance_pub.pem")
PRIVATE_KEY_PATH = os.getenv("MAAS_SEEDANCE_PRIVATE_KEY_PATH", "./tmp/seedance_priv.pem")
VIDEO_TMP_DIR = Path(os.getenv("MAAS_SEEDANCE_VIDEO_TMP_DIR", "./tmp/videos"))
logger = logging.getLogger("maas_seedance_api")


# #region debug-point A-E:maas-url-reporting
def _debug_url_metadata(field_name: str, value: str) -> dict[str, Any]:
    parsed = urlparse(value.strip())
    hostname = (parsed.hostname or "").lower()
    is_private = False
    try:
        address = ipaddress.ip_address(hostname)
        is_private = address.is_private or address.is_loopback or address.is_link_local
    except ValueError:
        pass
    return {
        "fieldName": field_name,
        "scheme": parsed.scheme or None,
        "hostname": hostname or None,
        "port": parsed.port,
        "pathnameCategory": "root" if parsed.path in {"", "/"} else "api-storage" if parsed.path.startswith("/api/storage/") else "object-path",
        "isLocalhost": hostname == "localhost" or hostname.endswith(".localhost"),
        "isPrivate": is_private,
        "isInternal": hostname.endswith((".local", ".internal")) or (bool(hostname) and "." not in hostname and hostname != "localhost"),
    }


def _report_debug_urls(location: str, urls: list[tuple[str, str]]) -> None:
    def send() -> None:
        try:
            endpoint = "http://127.0.0.1:7777/event"
            session_id = "maas-private-image-url"
            try:
                env = Path(".dbg/maas-private-image-url.env").read_text(encoding="utf-8")
                values = dict(line.split("=", 1) for line in env.splitlines() if "=" in line)
                endpoint = values.get("DEBUG_SERVER_URL", endpoint)
                session_id = values.get("DEBUG_SESSION_ID", session_id)
            except Exception:
                pass
            event = {"sessionId": session_id, "runId": "post-fix", "hypothesisId": "A-E", "location": location, "msg": "[DEBUG] MAAS URL metadata", "data": {"urls": [_debug_url_metadata(field_name, value) for field_name, value in urls]}}
            request = urllib.request.Request(endpoint, data=json.dumps(event).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
            urllib.request.urlopen(request, timeout=0.5).read()
        except Exception:
            pass

    threading.Thread(target=send, daemon=True).start()
# #endregion


class VideoGenerationRequest(BaseModel):
    model: str | None = None
    prompt: str = Field(min_length=1)
    image_url: str | None = None
    last_frame_image_url: str | None = None
    reference_images: list[str] = Field(default_factory=list)
    reference_videos: list[str] = Field(default_factory=list)
    reference_audios: list[str] = Field(default_factory=list)
    duration: int | None = None
    ratio: str | None = None
    resolution: Literal["480p", "720p", "1080p"] | None = None
    generate_audio: bool | None = None
    watermark: bool | None = None


def require_auth(authorization: str | None) -> None:
    if authorization != f"Bearer {INTERNAL_API_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def require_public_url(value: str, field_name: str) -> str:
    trimmed = value.strip()
    if trimmed.startswith("asset://"):
        asset_id = trimmed.removeprefix("asset://")
        if asset_id and all(char.isalnum() or char in "._:-" for char in asset_id):
            return trimmed
        raise HTTPException(status_code=400, detail=f"{field_name} has an invalid trusted asset URI")
    parsed = urlparse(trimmed)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        # #region debug-point C:python-before-public-url-reject
        _report_debug_urls("py_api/maas_seedance_api.py:require_public_url:invalid", [(field_name, trimmed)])
        # #endregion
        raise HTTPException(status_code=400, detail=f"{field_name} must be a public http(s) URL")
    hostname = parsed.hostname.lower()
    if (
        hostname == "localhost"
        or hostname.endswith((".localhost", ".local", ".internal"))
        or "." not in hostname
    ):
        # #region debug-point A-E:python-before-hostname-reject
        _report_debug_urls("py_api/maas_seedance_api.py:require_public_url:hostname", [(field_name, trimmed)])
        # #endregion
        raise HTTPException(status_code=400, detail=f"{field_name} must not use a local/private hostname")
    try:
        if ipaddress.ip_address(hostname).is_private:
            # #region debug-point E:python-before-private-ip-reject
            _report_debug_urls("py_api/maas_seedance_api.py:require_public_url:private-ip", [(field_name, trimmed)])
            # #endregion
            raise HTTPException(status_code=400, detail=f"{field_name} must not use a private IP address")
    except ValueError:
        pass
    return trimmed


def build_content(request: VideoGenerationRequest) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [{"type": "text", "text": request.prompt.strip()}]
    if request.image_url:
        content.append({
            "type": "image_url",
            "image_url": {"url": require_public_url(request.image_url, "image_url")},
            "role": "reference_image",
        })

    if request.last_frame_image_url:
        content.append({
            "type": "image_url",
            "image_url": {"url": require_public_url(request.last_frame_image_url, "last_frame_image_url")},
            "role": "reference_image",
        })

    for index, url in enumerate(request.reference_images):
        content.append({
            "type": "image_url",
            "image_url": {"url": require_public_url(url, f"reference_images[{index}]")},
            "role": "reference_image",
        })

    for index, url in enumerate(request.reference_videos):
        content.append({
            "type": "video_url",
            "video_url": {"url": require_public_url(url, f"reference_videos[{index}]")},
            "role": "reference_video",
        })

    for index, url in enumerate(request.reference_audios):
        content.append({
            "type": "audio_url",
            "audio_url": {"url": require_public_url(url, f"reference_audios[{index}]")},
            "role": "reference_audio",
        })

    return content


def normalize_status(raw: Any) -> str:
    status = str(raw or "").lower()
    if status == "succeeded":
        return "succeeded"
    if status in {"failed", "cancelled", "canceled"}:
        return "failed"
    return "processing"


def normalize_task_failure(task_info: dict[str, Any]) -> dict[str, Any]:
    raw_error = task_info.get("error") or task_info.get("message") or "Maas Seedance task failed"
    upstream_code: str | None = None
    message: str

    def compact(value: Any, fallback: str = "") -> str:
        normalized = " ".join(str(value).split())[:1000]
        return normalized or fallback

    if isinstance(raw_error, dict):
        raw_code = raw_error.get("code") or raw_error.get("type")
        if raw_code is not None:
            upstream_code = compact(raw_code) or None
        raw_message = raw_error.get("message") or raw_error.get("detail") or raw_error.get("reason")
        message = compact(raw_message or upstream_code, "Maas Seedance task failed")
    else:
        message = compact(raw_error, "Maas Seedance task failed")

    combined = f"{upstream_code or ''} {message}".lower()
    sensitive = any(marker in combined for marker in (
        "sensitive",
        "privacyinformation",
        "content policy",
    ))
    return {
        "error": message,
        "error_code": "SENSITIVE_CONTENT" if sensitive else "GENERATION_FAILED",
        "upstream_error_code": upstream_code,
        "retryable": not sensitive,
    }


VIDEO_TMP_DIR.mkdir(parents=True, exist_ok=True)
client = MaasSeedanceClient(
    maas_base_url=MAAS_BASE_URL,
    maas_api_key=MAAS_API_KEY,
    maas_model=MAAS_MODEL,
    enable_video_encrypt=ENABLE_VIDEO_ENCRYPT,
)
if ENABLE_VIDEO_ENCRYPT:
    client.set_video_file_encrypt_key(
        public_key_path=PUBLIC_KEY_PATH,
        private_key_path=PRIVATE_KEY_PATH,
    )


# SDK 1.0 returns an empty task id for a non-200 create response. SDK 1.1
# retains the response but then raises AICCException. Capture that response in
# both SDK object layouts so either behavior can produce the same API error.
_sdk_create_task_response = threading.local()


def _is_sdk_create_task_url(value: Any) -> bool:
    return isinstance(value, str) and urlparse(value).path.rstrip("/").endswith("/contents/generations/tasks")


def _sdk_create_task_http_clients() -> list[Any]:
    # SDK 1.0 exposed secure_http_client on the public client. SDK 1.1 wraps
    # it in volc_client; preserve support for both versions while upgrading.
    candidates = [
        getattr(client, "secure_http_client", None),
        getattr(getattr(client, "volc_client", None), "secure_http_client", None),
    ]
    http_clients: list[Any] = []
    seen: set[int] = set()
    for http_client in candidates:
        if http_client is not None and id(http_client) not in seen:
            http_clients.append(http_client)
            seen.add(id(http_client))
    return http_clients


def _install_sdk_create_task_response_capture() -> None:
    for http_client in _sdk_create_task_http_clients():
        original_post = getattr(http_client, "post", None)
        if not callable(original_post):
            continue

        def capture_post(*args: Any, __original_post: Any = original_post, **kwargs: Any) -> Any:
            response = __original_post(*args, **kwargs)
            request_url = args[0] if args else kwargs.get("url")
            if _is_sdk_create_task_url(request_url):
                _sdk_create_task_response.response = response
            return response

        http_client.post = capture_post


def _clear_sdk_create_task_response() -> None:
    if hasattr(_sdk_create_task_response, "response"):
        del _sdk_create_task_response.response


def _body_from_sdk_create_task_exception(error: Exception | None) -> dict[str, Any] | None:
    """Extract the JSON body embedded in SDK 1.1's AICCException message."""
    if error is None:
        return None
    message = str(error).strip()
    json_start = message.find("{")
    if json_start < 0:
        return None
    try:
        body, _ = json.JSONDecoder().raw_decode(message[json_start:])
    except (TypeError, ValueError):
        return None
    return body if isinstance(body, dict) else None


def _raise_sdk_create_task_error(sdk_error: Exception | None = None) -> None:
    response = getattr(_sdk_create_task_response, "response", None)
    raw_status = getattr(response, "status_code", None)
    try:
        status_code = int(raw_status)
    except (TypeError, ValueError):
        status_code = 502

    body: Any = None
    if response is not None:
        try:
            body = response.json()
        except Exception:
            body = None
    if not isinstance(body, dict):
        body = _body_from_sdk_create_task_exception(sdk_error)

    upstream_error = body.get("error") if isinstance(body, dict) else None
    upstream_code = upstream_error.get("code") if isinstance(upstream_error, dict) else None
    if isinstance(upstream_code, str) and upstream_code.startswith("InputImageSensitiveContentDetected"):
        logger.warning(
            "Maas Seedance rejected an input image during content safety review: status=%s code=%s",
            status_code,
            upstream_code,
        )
        raise HTTPException(
            status_code=422,
            detail={
                "code": "SENSITIVE_CONTENT",
                "message": "输入图片审核未通过：图片可能包含真实人物或可识别的个人信息。请更换为不含真人的图片后重试。",
            },
        )

    logger.error(
        "Maas Seedance create task failed: status=%s upstream_code=%s sdk_error_type=%s",
        status_code,
        upstream_code,
        type(sdk_error).__name__ if sdk_error is not None else None,
    )
    raise HTTPException(
        status_code=status_code if 400 <= status_code < 500 else 502,
        detail={
            "code": "MAAS_SEEDANCE_UPSTREAM_ERROR",
            "message": "移动云视频生成请求失败，请稍后重试。",
        },
    )


_install_sdk_create_task_response_capture()


app = FastAPI(title="Maas Seedance Adapter")


@app.get("/health")
def health(authorization: str | None = Header(default=None)) -> dict[str, bool]:
    require_auth(authorization)
    return {"ok": True}


@app.post("/v1/videos/generations")
def create_video_generation(
    request: VideoGenerationRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, str]:
    require_auth(authorization)
    payload: dict[str, Any] = {"content": build_content(request)}
    if request.generate_audio is not None:
        payload["generate_audio"] = request.generate_audio
    if request.ratio:
        payload["ratio"] = request.ratio
    if request.resolution is not None:
        payload["resolution"] = request.resolution
    if request.duration is not None:
        payload["duration"] = request.duration
    if request.watermark is not None:
        payload["watermark"] = request.watermark

    logger.info(
        "MAAS request_data before SDK call: %s",
        json.dumps(payload, ensure_ascii=False),
    )

    # #region debug-point A-E:python-before-sdk
    _report_debug_urls("py_api/maas_seedance_api.py:before-sdk", [
        *([("image_url", request.image_url)] if request.image_url else []),
        *([("last_frame_image_url", request.last_frame_image_url)] if request.last_frame_image_url else []),
        *((f"reference_images[{index}]", value) for index, value in enumerate(request.reference_images)),
        *((f"reference_videos[{index}]", value) for index, value in enumerate(request.reference_videos)),
        *((f"reference_audios[{index}]", value) for index, value in enumerate(request.reference_audios)),
    ])
    # #endregion

    _clear_sdk_create_task_response()
    try:
        task_id = client.create_video_generation_task(payload)
    except Exception as error:
        # SDK 1.1 raises AICCException after its secure HTTP client returns a
        # non-200 response. The captured response is converted below instead
        # of leaking an internal exception as HTTP 500.
        _raise_sdk_create_task_error(error)
    if not task_id:
        _raise_sdk_create_task_error()
    return {"id": str(task_id), "status": "processing"}


@app.get("/v1/videos/generations/{task_id}")
def get_video_generation(
    task_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_auth(authorization)
    task_info = client.query_video_generation_task(task_id)
    raw_status = task_info.get("status") if isinstance(task_info, dict) else None
    status = normalize_status(raw_status)
    response: dict[str, Any] = {
        "id": task_id,
        "status": status,
        "raw_status": raw_status,
    }
    if status == "succeeded":
        response["video_url"] = f"/v1/videos/generations/{task_id}/content"
    if status == "failed":
        failure = normalize_task_failure(task_info)
        response.update(failure)
        logger.warning(
            "MAAS Seedance task failed: task_id=%s raw_status=%s error_code=%s upstream_error_code=%s message=%s",
            task_id,
            raw_status,
            failure["error_code"],
            failure["upstream_error_code"],
            failure["error"],
        )
    return response


@app.get("/v1/videos/generations/{task_id}/content")
def download_video_generation(
    task_id: str,
    authorization: str | None = Header(default=None),
) -> FileResponse:
    require_auth(authorization)
    output_path = VIDEO_TMP_DIR / f"{task_id}.mp4"
    if not output_path.exists():
        with tempfile.NamedTemporaryFile(dir=VIDEO_TMP_DIR, suffix=".mp4", delete=False) as temp_file:
            temp_path = Path(temp_file.name)
        try:
            success = client.download_video(task_id, str(temp_path))
            if not success:
                raise HTTPException(status_code=502, detail="Maas Seedance video download failed")
            temp_path.replace(output_path)
        finally:
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)
    return FileResponse(output_path, media_type="video/mp4", filename=f"{task_id}.mp4")
