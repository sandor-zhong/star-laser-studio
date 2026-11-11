"""Local-only live studio server. Consume the user's relay; never start a collector."""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import ipaddress
import json
import os
import socket
import time
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import uvicorn
import websockets
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, Response

from studio_runtime import StudioRuntime, relay_url, safe_avatar_url


ROOT = Path(__file__).resolve().parent
LOOPBACK_NAMES = {"127.0.0.1", "localhost", "::1", "testserver"}
MAX_AVATAR_BYTES = 2 * 1024 * 1024


def trusted_local(scope):
    peer = scope.client.host if scope.client else ""
    if peer not in {"testclient", "testserver"}:
        try:
            if not ipaddress.ip_address(peer).is_loopback:
                return False
        except ValueError:
            return False
    try:
        host = urlsplit("http://" + scope.headers.get("host", "")).hostname
        if host not in LOOPBACK_NAMES:
            return False
        origin = scope.headers.get("origin")
        if origin:
            parts = urlsplit(origin)
            request_host = scope.headers.get("host", "").lower()
            if parts.scheme not in {"http", "https"} or parts.netloc.lower() != request_host or parts.hostname not in LOOPBACK_NAMES:
                return False
        if scope.headers.get("sec-fetch-site") == "cross-site":
            return False
    except ValueError:
        return False
    return True


class StudioService:
    def __init__(self, runtime, *, relay_connect=None, avatar_transport=None, avatar_dns=True):
        self.runtime = runtime
        self.clients = {}
        self.relay_task = None
        self.relay_connect = relay_connect or websockets.connect
        self.http = httpx.AsyncClient(timeout=httpx.Timeout(8, connect=4), follow_redirects=False,
                                      transport=avatar_transport, trust_env=False)
        self.avatar_cache = OrderedDict()
        self.avatar_cache_bytes = 0
        self.avatar_dns = avatar_dns
        self.avatar_locks = {}

    async def start(self):
        await self.restart_relay()

    async def stop(self):
        if self.relay_task:
            self.relay_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.relay_task
        await self.http.aclose()

    async def restart_relay(self):
        if self.relay_task:
            self.relay_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.relay_task
            self.relay_task = None
        config = self.runtime.config
        if not config["relay_enabled"]:
            self.runtime.relay.update(status="disabled", message="直播中继未启用，可先使用模拟事件预览")
        elif not config["room_id"] or not config["view_token"]:
            self.runtime.relay.update(status="error", message="请配置房间 ID 和 VIEW_TOKEN")
        else:
            self.runtime.relay.update(status="connecting", message="正在连接直播中继")
            self.relay_task = asyncio.create_task(self.consume_relay())

    async def consume_relay(self):
        delay = 1
        while True:
            try:
                async with self.relay_connect(relay_url(self.runtime.config), open_timeout=8,
                                               ping_interval=20, ping_timeout=20, max_size=64000) as connection:
                    self.runtime.relay.update(status="connected", message="直播中继已连接，等待入场或礼物事件")
                    self.runtime.log("info", "已连接直播事件中继")
                    await self.broadcast()
                    delay = 1
                    async for raw in connection:
                        try:
                            event = json.loads(raw)
                        except (ValueError, TypeError):
                            continue
                        if self.runtime.receive_event(event):
                            await self.broadcast()
                        elif isinstance(event, dict) and event.get("type") in {"member", "gift"}:
                            # Counter/last-event changes are still visible when a request was deduplicated.
                            await self.broadcast()
                raise ConnectionError("relay closed")
            except asyncio.CancelledError:
                raise
            except Exception as error:
                code = getattr(getattr(error, "rcvd", None), "code", None) or getattr(error, "code", None)
                auth = code == 1008 or getattr(getattr(error, "response", None), "status_code", None) in {401, 403}
                message = "直播中继拒绝连接，请检查房间 ID 和 VIEW_TOKEN" if auth else "直播中继连接中断，正在自动重试"
                self.runtime.relay.update(status="error" if auth else "reconnecting", message=message)
                # Do not stringify transport exceptions: their URL can include the consumer secret.
                self.runtime.log("warning", message)
                await self.broadcast()
                await asyncio.sleep(delay)
                delay = min(30, delay * 2)

    async def broadcast(self):
        if not self.clients:
            return
        state = self.runtime.snapshot()
        clients = list(self.clients.items())
        async def send(client_id, connection):
            await asyncio.wait_for(connection.send_json(dict(type="snapshot", state=state,
                client_id=client_id, is_renderer=client_id == self.runtime.owner_id)), 2)
        results = await asyncio.gather(*(send(key, value) for key, value in clients), return_exceptions=True)
        lost = False
        for (client_id, connection), result in zip(clients, results):
            if isinstance(result, BaseException) and self.clients.get(client_id) is connection:
                self.clients.pop(client_id, None)
                self.runtime.detach_display(client_id)
                lost = True
                with contextlib.suppress(Exception):
                    await connection.close()
        if lost and self.clients:
            # Ownership transfer must reach remaining displays promptly.
            await self.broadcast()

    async def avatar(self, key):
        if key not in self.runtime.avatars:
            raise HTTPException(404, "头像不存在或已过期")
        cached = self.avatar_cache.get(key)
        if cached and time.monotonic() - cached[0] < 3600:
            self.avatar_cache.move_to_end(key)
            return cached[1], cached[2]
        lock = self.avatar_locks.setdefault(key, asyncio.Lock())
        try:
            async with lock:
                cached = self.avatar_cache.get(key)
                if cached and time.monotonic() - cached[0] < 3600:
                    return cached[1], cached[2]
                url = self.runtime.avatars[key]
                for _ in range(4):
                    safe_url = safe_avatar_url(url)
                    if not safe_url or safe_url != url:
                        raise HTTPException(404, "头像来源不可用")
                    if self.avatar_dns:
                        host = urlsplit(url).hostname
                        try:
                            addresses = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
                            if not addresses or any(not ipaddress.ip_address(entry[4][0]).is_global for entry in addresses):
                                raise HTTPException(404, "头像来源不可用")
                        except OSError:
                            raise HTTPException(404, "头像来源不可用") from None
                    try:
                        async with self.http.stream("GET", url, headers={"Accept": "image/png,image/jpeg,image/webp", "User-Agent": "StarLaserStudio/1.0"}) as response:
                            if response.status_code in {301, 302, 303, 307, 308}:
                                redirect = response.headers.get("location", "")
                                url = str(response.url.join(redirect))
                                continue
                            if response.status_code != 200:
                                raise HTTPException(404, "头像下载失败，显示端将使用备用图")
                            mime = response.headers.get("content-type", "").split(";", 1)[0].lower()
                            if mime not in {"image/png", "image/jpeg", "image/webp"}:
                                raise HTTPException(404, "头像格式不受支持")
                            try:
                                if int(response.headers.get("content-length", "0")) > MAX_AVATAR_BYTES:
                                    raise HTTPException(404, "头像文件过大")
                            except ValueError:
                                pass
                            chunks, total = [], 0
                            async for chunk in response.aiter_bytes():
                                total += len(chunk)
                                if total > MAX_AVATAR_BYTES:
                                    raise HTTPException(404, "头像文件过大")
                                chunks.append(chunk)
                            data = b"".join(chunks)
                            valid = ((mime == "image/png" and data.startswith(b"\x89PNG\r\n\x1a\n"))
                                     or (mime == "image/jpeg" and data.startswith(b"\xff\xd8\xff"))
                                     or (mime == "image/webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP"))
                            if not valid:
                                raise HTTPException(404, "头像内容无效")
                            self._cache_avatar(key, data, mime)
                            return data, mime
                    except httpx.HTTPError:
                        raise HTTPException(404, "头像下载失败，显示端将使用备用图") from None
                raise HTTPException(404, "头像跳转次数过多")
        finally:
            if not lock.locked():
                self.avatar_locks.pop(key, None)

    def _cache_avatar(self, key, data, mime):
        previous = self.avatar_cache.pop(key, None)
        if previous:
            self.avatar_cache_bytes -= len(previous[1])
        self.avatar_cache[key] = (time.monotonic(), data, mime)
        self.avatar_cache_bytes += len(data)
        while len(self.avatar_cache) > 64 or self.avatar_cache_bytes > 16 * 1024 * 1024:
            _, old = self.avatar_cache.popitem(last=False)
            self.avatar_cache_bytes -= len(old[1])


def create_app(*, config_path=None, relay_project=None, root=None, relay_connect=None,
               avatar_transport=None, avatar_dns=True):
    static_root = Path(root or ROOT).resolve()
    runtime = StudioRuntime(config_path or ROOT / ".local" / "studio-config.json", relay_project=relay_project)
    service = StudioService(runtime, relay_connect=relay_connect, avatar_transport=avatar_transport,
                            avatar_dns=avatar_dns)

    @asynccontextmanager
    async def lifespan(_app):
        await service.start()
        try:
            yield
        finally:
            await service.stop()

    app = FastAPI(title="星光雕刻直播工作台", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.studio = service
    app.state.runtime = runtime

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        if not trusted_local(request):
            return JSONResponse({"detail": "只允许本机同源访问"}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/avatar/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/state")
    async def get_state():
        return runtime.snapshot()

    @app.get("/api/config")
    async def get_config():
        return runtime.public_config()

    async def json_body(request):
        if request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
            raise HTTPException(415, "请使用 application/json")
        body = await request.body()
        if len(body) > 16384:
            raise HTTPException(413, "请求内容过长")
        try:
            value = json.loads(body)
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except ValueError:
            raise HTTPException(400, "JSON 对象无效") from None

    @app.put("/api/config")
    async def put_config(request: Request):
        update = await json_body(request)
        before = tuple(runtime.config[key] for key in ("relay_enabled", "relay_base", "room_id", "view_token"))
        try:
            runtime.save_config(update)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        except OSError:
            raise HTTPException(500, "本地配置保存失败") from None
        after = tuple(runtime.config[key] for key in ("relay_enabled", "relay_base", "room_id", "view_token"))
        if before != after:
            await service.restart_relay()
        await service.broadcast()
        return runtime.public_config()

    @app.post("/api/command")
    async def command(request: Request):
        data = await json_body(request)
        try:
            runtime.command(data.get("action"), data.get("nickname"))
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        if data.get("action") == "reconnect":
            await service.restart_relay()
        await service.broadcast()
        return runtime.snapshot()

    @app.get("/api/avatar/{key}")
    async def avatar(key: str):
        data, mime = await service.avatar(key)
        return Response(data, media_type=mime, headers={"Cache-Control": "private, max-age=3600"})

    @app.websocket("/ws/studio")
    async def studio_socket(connection: WebSocket):
        if not trusted_local(connection) or connection.query_params.get("role", "display") not in {"admin", "display"}:
            await connection.close(code=1008)
            return
        await connection.accept()
        client_id = uuid.uuid4().hex
        service.clients[client_id] = connection
        display = connection.query_params.get("role", "display") == "display"
        if display:
            runtime.attach_display(client_id)
        await service.broadcast()
        try:
            while True:
                raw = await connection.receive_text()
                if len(raw) > 16384:
                    continue
                try:
                    data = json.loads(raw)
                except ValueError:
                    continue
                if display and runtime.renderer_message(client_id, data):
                    await service.broadcast()
        except WebSocketDisconnect:
            pass
        finally:
            service.clients.pop(client_id, None)
            runtime.detach_display(client_id)
            await service.broadcast()

    @app.get("/{path:path}")
    async def static_file(path: str):
        if path in {"", "live"}:
            path = "index.html"
        elif path in {"admin", "admin/"}:
            path = "admin.html"
        target = static_root / path
        allowed = (path in {"index.html", "styles.css", "admin.html", "admin.css"}
                   or ("/" not in path and path.endswith(".js") and not path.startswith("."))
                   or (path.startswith("assets/") and target.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".svg", ".woff2"})
                   or path == "output/structure-concept-v3.png")
        try:
            resolved = target.resolve()
            inside = resolved.is_relative_to(static_root)
        except (ValueError, OSError):
            inside = False
        if not allowed or not inside or any(part.startswith(".") for part in Path(path).parts) or not target.is_file():
            raise HTTPException(404, "文件不存在")
        return FileResponse(target, headers={"Cache-Control": "no-cache"})

    return app


app = create_app(relay_project=os.environ.get("STUDIO_RELAY_PROJECT"))


def main():
    parser = argparse.ArgumentParser(description="启动本机抖音头像雕刻工作台")
    parser.add_argument("--host", default="127.0.0.1", choices=["127.0.0.1", "localhost", "::1"])
    parser.add_argument("--port", type=int, default=8082)
    parser.add_argument("--relay-project", default=os.environ.get("STUDIO_RELAY_PROJECT"))
    args = parser.parse_args()
    application = create_app(relay_project=args.relay_project)
    # A relay consumer URL contains its token. Access/debug transport logs are deliberately disabled.
    uvicorn.run(application, host=args.host, port=args.port, access_log=False, log_level="warning")


if __name__ == "__main__":
    main()
