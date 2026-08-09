import os
import tempfile
import ipaddress
import json
import logging
import threading
import urllib.request
from pathlib import Path
from typing import Any
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
    image_url: str
    last_frame_image_url: str | None = None
    reference_images: list[str] = Field(default_factory=list)
    reference_videos: list[str] = Field(default_factory=list)
    reference_audios: list[str] = Field(default_factory=list)
    duration: int | None = None
    ratio: str | None = None
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
        ("image_url", request.image_url),
        *([("last_frame_image_url", request.last_frame_image_url)] if request.last_frame_image_url else []),
        *((f"reference_images[{index}]", value) for index, value in enumerate(request.reference_images)),
        *((f"reference_videos[{index}]", value) for index, value in enumerate(request.reference_videos)),
        *((f"reference_audios[{index}]", value) for index, value in enumerate(request.reference_audios)),
    ])
    # #endregion

    task_id = client.create_video_generation_task(payload)
    if not task_id:
        raise HTTPException(status_code=502, detail="Maas Seedance did not return task id")
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
        response["error"] = task_info.get("error") or task_info.get("message") or "Maas Seedance task failed"
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
