"""Synthetic local fixture for the browser tests; no Douyin connection or credentials.

Run from the project root:
    python -B tests/studio_browser_fixture.py
"""
from __future__ import annotations

import json
import struct
import sys
import zlib
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import httpx
import uvicorn
from fastapi import HTTPException, Request

from studio_runtime import DEFAULT_CONFIG
from studio_server import create_app, trusted_local


TEST_AVATAR_URL = "https://p3.douyinpic.com/browser-test-avatar.png"
FIXTURE_CONFIG = PROJECT_ROOT / ".local" / "browser-fixture" / "studio-config.json"


def fixture_png() -> bytes:
    """A small, deterministic RGB target, distinct from the fallback artwork."""
    width = height = 64
    rows = []
    for y in range(height):
        pixels = bytearray()
        for x in range(width):
            if 20 <= x <= 43 and 16 <= y <= 47:
                color = (242, 88, 153)  # Pink center on a blue/cyan test portrait.
            else:
                color = (20 + x * 2, 85 + y * 2, 210)
            pixels.extend(color)
        rows.append(b"\x00" + pixels)

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (struct.pack(">I", len(payload)) + kind + payload
                + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b""))


AVATAR_PNG = fixture_png()


def avatar_response(request: httpx.Request) -> httpx.Response:
    if request.method == "GET" and str(request.url) == TEST_AVATAR_URL:
        return httpx.Response(200, content=AVATAR_PNG, headers={"Content-Type": "image/png"})
    return httpx.Response(404, content=b"Synthetic fixture URL only")


app = create_app(config_path=FIXTURE_CONFIG, root=PROJECT_ROOT, relay_project=None,
                 avatar_transport=httpx.MockTransport(avatar_response), avatar_dns=False)
runtime = app.state.runtime
service = app.state.studio
# Do not inherit settings saved by a previous interactive fixture run.
runtime.config = {**DEFAULT_CONFIG, "relay_enabled": False, "room_id": "browser-test", "view_token": ""}
runtime.receive_event({
    "type": "member", "source": "browser_fixture", "room_id": "browser-test",
    "msg_id": "browser-entry", "user": {
        "id": "browser-user", "nickname": "头像链路测试", "avatar_url": TEST_AVATAR_URL,
    }, "data": {},
})


@app.post("/test/event")
async def event(request: Request):
    # The application's shared middleware also rejects nonlocal/cross-origin requests.
    if not trusted_local(request):
        raise HTTPException(403, "Synthetic fixture is local and same-origin only")
    if request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
        raise HTTPException(415, "Use application/json")
    body = await request.body()
    if len(body) > 16384:
        raise HTTPException(413, "Fixture event is too large")
    try:
        value = json.loads(body)
        if not isinstance(value, dict):
            raise ValueError()
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "Expected a JSON event object") from None
    accepted = runtime.receive_event(value)
    await service.broadcast()
    return {"accepted": accepted, "state": runtime.snapshot()}


if __name__ == "__main__":
    print("Browser fixture ready: http://127.0.0.1:8083/?live=1", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=8083, access_log=False, log_level="warning")
