"""自动直连：使用 DyHub 轻量采集服务，转成 V0.1 统一 JSON 并转发云端。

DyHub 源码与锁文件已放在本项目 vendor/dyhub，来源与组件许可见 THIRD-PARTY-NOTICES.md。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
from urllib.parse import urlencode, urlsplit
from pathlib import Path

import httpx
import websockets
from dotenv import load_dotenv

from .relay_publisher import RelayPublisher, brief


load_dotenv(Path(__file__).resolve().parents[1] / '.local' / 'live.env')
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("dyhub_bridge")

EVENT_MAP = {"chat": "comment", "gift": "gift", "member": "member", "like": "like", "follow": "follow"}


def normalize_dyhub(source: dict, room_id: str) -> dict | None:
    typ = EVENT_MAP.get(source.get("type"))
    if typ is None:
        return None
    received_room = str(source.get("roomId") or room_id)
    if received_room != room_id:
        return None
    user = source.get("user") or {}
    data = source.get("data") or {}
    if not isinstance(user, dict) or not isinstance(data, dict):
        return None
    if typ == "comment":
        payload = {"content": data.get("content", "")}
    elif typ == "gift":
        payload = {
            "gift_id": str(data.get("giftId") or ""),
            "gift_name": data.get("giftName", ""),
            "gift_image_url": data.get("giftIcon", ""),
            "diamond_count": data.get("diamondCount", 0),
            "repeat_count": data.get("repeatCount", 1),
            "combo_count": data.get("comboCount", 0),
            "group_id": str(data.get("groupId") or ""),
            "repeat_end": bool(data.get("repeatEnd", False)),
        }
    elif typ == "member":
        payload = {"member_count": data.get("memberCount", 0)}
    elif typ == "like":
        payload = {"count": data.get("count", 0), "total": data.get("total", 0)}
    else:
        payload = {"action": data.get("action", 1)}
    return {
        "type": typ,
        "source": "dyhub_lightweight",
        "room_id": room_id,
        "msg_id": str(source.get("id") or ""),
        "timestamp": source.get("ts"),
        "user": {
            "id": str(user.get("id") or ""),
            "sec_uid": user.get("secUid") or "",
            "nickname": user.get("nickname") or "",
            "avatar_url": user.get("avatar") or "",
        },
        "data": payload,
    }


async def register_room(room_id: str, api: str) -> None:
    """要求已运行的 DyHub 轻量内核连接该直播间。"""
    parsed = urlsplit(api)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("DYHUB_API 必须是本机服务地址，不要暴露 DyHub 管理接口")
    # 本机服务不应经由 Clash/系统代理；trust_env=False 也避免 SOCKS 依赖问题。
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        # Fresh bundled installs have no local account record. Create an empty
        # anonymous profile; this does not log in or copy anyone's credentials.
        accounts = await client.get(f"{api.rstrip('/')}/api/accounts")
        accounts.raise_for_status()
        if not accounts.json().get('accounts'):
            created = await client.post(f"{api.rstrip('/')}/api/accounts", json={'name': '直播工坊'})
            created.raise_for_status()
        resp = await client.post(f"{api.rstrip('/')}/api/rooms/connect", json={"roomId": room_id})
        # 若已连接，同一房间可能报重复/冲突，继续进入订阅状态。
        if resp.status_code not in {200, 201, 202, 409}:
            raise RuntimeError(f"DyHub 房间连接请求失败，HTTP {resp.status_code}: {resp.text[:300]}")
        log.info("已向 DyHub 提交直播间连接请求")


async def listen_dyhub(room_id: str, publisher: RelayPublisher) -> None:
    api = os.getenv("DYHUB_API", "http://127.0.0.1:8757")
    url = os.getenv("DYHUB_WS", "ws://127.0.0.1:8757/ws")
    parsed = urlsplit(url)
    if parsed.scheme != "ws" or parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("DYHUB_WS 必须是本机 ws:// 地址；云端仍使用独立 WSS 鉴权")
    delay = 1
    while True:
        try:
            await register_room(room_id, api)
            query = urlencode({"roomId": room_id, "types": "chat,gift,member,like,follow"})
            async with websockets.connect(f"{url}?{query}", ping_interval=20, proxy=None) as ws:
                log.info("已订阅 DyHub 事件，等待直播间实时消息")
                delay = 1
                async for raw in ws:
                    try:
                        data = json.loads(raw)
                    except ValueError:
                        continue
                    if isinstance(data, dict):
                        data = [data]
                    if not isinstance(data, list):
                        continue
                    for row in data:
                        if not isinstance(row, dict):
                            continue
                        event = normalize_dyhub(row, room_id)
                        if event:
                            publisher.submit(event)
                            print(brief(event), flush=True)
        except (OSError, httpx.HTTPError, RuntimeError, websockets.exceptions.WebSocketException) as exc:
            log.warning("DyHub 通道故障 %s；%s 秒后重试", type(exc).__name__, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)


async def main() -> None:
    parser = argparse.ArgumentParser(description="自动直连模式：DyHub 轻量 WS -> Python -> 阿里云")
    parser.add_argument("--room", default=os.getenv("ROOM_ID", ""))
    args = parser.parse_args()
    if not args.room.strip().isdigit():
        raise SystemExit("ROOM_ID 应为直播链接末尾的数字 web_rid")
    publisher = RelayPublisher(args.room.strip())
    forward_task = asyncio.create_task(publisher.run())
    try:
        await listen_dyhub(args.room.strip(), publisher)
    finally:
        forward_task.cancel()
        try:
            await forward_task
        except asyncio.CancelledError:
            pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, ValueError) as exc:
        if isinstance(exc, ValueError):
            raise SystemExit(str(exc)) from None
