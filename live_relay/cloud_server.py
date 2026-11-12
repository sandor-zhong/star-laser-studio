"""运行在阿里云：接收采集器上报并广播到游戏客户端。单进程示例。"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
from collections import OrderedDict
from typing import Any
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect


load_dotenv(Path(__file__).resolve().parents[1] / '.local' / 'live.env')
logger = logging.getLogger("cloud_relay")
write_token = os.getenv("INGEST_TOKEN", "")
read_token = os.getenv("VIEW_TOKEN", "")
configured_room = os.getenv("ROOM_ID", "")
readers: dict[str, set[WebSocket]] = {}
seen: OrderedDict[str, None] = OrderedDict()
app = FastAPI(title="Douyin Browser WebSocket Relay")


def authorized(expected: str, actual: str) -> bool:
    return bool(expected) and hmac.compare_digest(expected, actual)


def valid_room(room_id: str) -> bool:
    return bool(configured_room) and room_id == configured_room


@app.get("/health")
async def health():
    return {"ok": True, "configured": bool(write_token and read_token and configured_room)}


@app.websocket("/ingest/{room_id}")
async def ingest(websocket: WebSocket, room_id: str):
    auth_header = websocket.headers.get("authorization", "")
    credential = auth_header.removeprefix("Bearer ") if auth_header.startswith("Bearer ") else ""
    if not valid_room(room_id) or not authorized(write_token, credential):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            if len(raw) > 64_000:
                continue
            try:
                event: dict[str, Any] = json.loads(raw)
                if not isinstance(event, dict):
                    continue
                if event.get("type") not in {"comment", "gift", "member", "follow", "share", "social", "like"}:
                    continue
                if not isinstance(event.get("user"), dict) or not isinstance(event.get("data"), dict):
                    continue
                event["room_id"] = room_id
                # 重复 WS 重连或采集端重复上报时防止重复动画。
                msg_id = str(event.get("msg_id") or "")
                dedupe_key = f"{room_id}:{event['type']}:{msg_id}" if msg_id else ""
                if dedupe_key and dedupe_key in seen:
                    continue
                if dedupe_key:
                    seen[dedupe_key] = None
                    if len(seen) > 20_000:
                        seen.popitem(last=False)
                targets = list(readers.get(room_id, set()))
                if targets:
                    payload = json.dumps(event, ensure_ascii=False)
                    results = await asyncio.gather(
                        *(asyncio.wait_for(ws.send_text(payload), timeout=1) for ws in targets),
                        return_exceptions=True,
                    )
                    for ws, result in zip(targets, results):
                        if isinstance(result, BaseException):
                            readers[room_id].discard(ws)
            except (ValueError, TypeError):
                logger.debug("收到不合法的 JSON 事件，已丢弃")
    except WebSocketDisconnect:
        pass


@app.websocket("/events/{room_id}")
async def events(websocket: WebSocket, room_id: str):
    # Electron 本机测试可使用 URL token；公网生产建议改成短时票据。
    token = websocket.query_params.get("token", "")
    if not valid_room(room_id) or not authorized(read_token, token):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    connections = readers.setdefault(room_id, set())
    connections.add(websocket)
    await websocket.send_json({"type": "connected", "room_id": room_id})
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        connections.discard(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("live_relay.cloud_server:app", host="127.0.0.1", port=8002, reload=False, workers=1)
