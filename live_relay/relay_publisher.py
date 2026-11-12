"""从任意采集源异步转发事件到自己云端的 /ingest WebSocket。"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from urllib.parse import quote, urlsplit

import websockets

log = logging.getLogger("relay_publisher")


class RelayPublisher:
    def __init__(self, room_id: str) -> None:
        self.room_id = room_id
        self.token = os.getenv("INGEST_TOKEN", "")
        self.base_url = os.getenv("RELAY_WS_BASE", "")
        if not self.token or not self.base_url or "your-domain.example" in self.base_url:
            raise ValueError("请配置 RELAY_WS_BASE、INGEST_TOKEN")
        if not self.base_url.startswith(("wss://", "ws://127.0.0.1:", "ws://localhost:")):
            raise ValueError("远程转发必须使用 wss://")
        self.queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=3000)
        self.dropped = 0

    def submit(self, event: dict) -> None:
        try:
            self.queue.put_nowait(event)
        except asyncio.QueueFull:
            self.dropped += 1
            if self.dropped == 1 or self.dropped % 100 == 0:
                log.warning("队列溢出，累计丢弃 %s 条", self.dropped)

    async def run(self) -> None:
        url = f"{self.base_url.rstrip('/')}/ingest/{quote(self.room_id, safe='')}"
        delay = 1
        pending = None
        while True:
            try:
                async with websockets.connect(
                    url,
                    additional_headers={"Authorization": f"Bearer {self.token}"},
                    ping_interval=20,
                    ping_timeout=20,
                    proxy=None if urlsplit(url).hostname in {"127.0.0.1", "localhost"} else True,
                ) as ws:
                    log.info("已连接配置的 WebSocket 事件网关")
                    delay = 1
                    while True:
                        if pending is None:
                            pending = await self.queue.get()
                        await ws.send(json.dumps(pending, ensure_ascii=False))
                        self.queue.task_done()
                        pending = None
            except (OSError, websockets.exceptions.WebSocketException) as exc:
                log.warning("云端转发断开 %s，%s 秒后重试", type(exc).__name__, delay)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)


def brief(event: dict) -> str:
    name = event.get("user", {}).get("nickname") or "未知用户"
    data = event.get("data", {})
    typ = event.get("type")
    if typ == "comment":
        return f"[弹幕] {name}: {data.get('content', '')}"
    if typ == "gift":
        return f"[礼物] {name}: {data.get('gift_name', '')} ×{data.get('repeat_count', 1)}"
    return f"[{typ}] {name}"
