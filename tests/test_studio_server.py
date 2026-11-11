"""Real protocol and security checks; run with python -m unittest discover -s tests -p 'test_studio*.py'."""
from __future__ import annotations

import asyncio
import contextlib
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path

import httpx
import websockets
from fastapi.testclient import TestClient

from studio_runtime import StudioRuntime, import_relay_config, relay_url, safe_avatar_url
from studio_server import create_app


def member(user="u1", msg="m1", **kwargs):
    return dict(type="member", msg_id=msg, user={"id": user, "nickname": "观众 " + user, **kwargs}, data={})


def gift(user="u1", msg="g1", count=1, group="group1", end=False):
    return dict(type="gift", msg_id=msg, user={"id": user, "nickname": "观众 " + user},
                data={"gift_id": "star", "gift_name": "小星星", "repeat_count": count,
                      "group_id": group, "repeat_end": end})


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.now = 1000
        self.runtime = StudioRuntime(Path(self.temp.name) / "settings.json", clock=lambda: self.now)
        self.runtime.attach_display("owner")

    def tearDown(self):
        self.temp.cleanup()

    def test_entry_deduplication_and_cooldown(self):
        r = self.runtime
        self.assertTrue(r.receive_event(member()))
        first = r.active["id"]
        self.assertFalse(r.receive_event(member()))
        self.assertFalse(r.receive_event(member(msg="m2")))
        r.renderer_message("owner", dict(type="complete", job_id=first, assessment={"score": 92}))
        self.now += 601
        self.assertTrue(r.receive_event(member(msg="m3")))
        self.assertNotEqual(r.active["id"], first)
        self.assertEqual(r.counters["accepted"], 2)

    def test_sec_uid_fallback_and_disabled_entries(self):
        r = self.runtime
        event = member(user="", sec_uid="sec-1")
        self.assertTrue(r.receive_event(event))
        self.assertEqual(r.active["user_id"], "sec-1")
        r.config["print_on_entry"] = False
        self.assertFalse(r.receive_event(member("u2", "m2")))
        self.assertTrue(r.receive_event(gift("u2")))

    def test_gift_combo_delta_and_end_are_not_duplicated(self):
        r = self.runtime
        self.assertTrue(r.receive_event(gift(count=1)))
        self.assertTrue(r.receive_event(gift(msg="g2", count=5)))
        self.assertFalse(r.receive_event(gift(msg="g3", count=5, end=True)))
        self.assertFalse(r.receive_event(gift(msg="g2", count=5)))
        self.assertEqual(r.active["gift_count"], 5)
        self.assertEqual(r.counters["accepted"], 1)
        self.assertTrue(r.active["closeup"])

    def test_missing_group_uses_message_id(self):
        r = self.runtime
        r.receive_event(gift(group="0"))
        r.receive_event(gift(msg="independent", group="0", count=0))
        self.assertEqual(r.active["gift_count"], 2)

    def test_threshold_combines_group_and_does_not_print_below_threshold(self):
        r = self.runtime
        r.config["gift_min_count"] = 3
        self.assertFalse(r.receive_event(gift(count=2)))
        self.assertIsNone(r.active)
        self.assertTrue(r.receive_event(gift(msg="g2", count=3)))
        self.assertEqual(r.active["gift_count"], 3)
        self.assertFalse(r.receive_event(gift(msg="g3", count=3, end=True)))

    def test_gift_upgrades_queued_user_without_interrupting_active(self):
        r = self.runtime
        r.receive_event(member("active", "a"))
        active_id = r.active["id"]
        r.receive_event(member("second", "b"))
        r.receive_event(member("third", "c"))
        third_id = r.queue[1]["id"]
        r.receive_event(gift("third"))
        self.assertEqual(r.active["id"], active_id)
        self.assertEqual([job["user_id"] for job in r.queue], ["third", "second"])
        self.assertEqual(r.queue[0]["id"], third_id)
        r.receive_event(gift("active", "gift-active", group="active-group"))
        self.assertEqual(r.active["id"], active_id)
        self.assertTrue(r.active["is_gift"])

    def test_queue_limit_preserves_active_and_prioritizes_gift(self):
        r = self.runtime
        r.config["max_queue"] = 2
        for index in range(4):
            r.receive_event(member(str(index), str(index)))
        active = r.active["id"]
        self.assertEqual(len(r.queue), 2)
        self.assertEqual(r.counters["queue_dropped"], 1)
        r.receive_event(gift("vip"))
        self.assertEqual(r.active["id"], active)
        self.assertEqual([job["user_id"] for job in r.queue], ["vip", "1"])
        self.assertEqual(r.counters["queue_dropped"], 2)

    def test_pause_and_tray_exchange_block_next_and_stale_completion(self):
        r = self.runtime
        r.receive_event(member())
        r.receive_event(member("u2", "m2"))
        first = r.active["id"]
        r.command("pause")
        self.assertTrue(r.renderer_message("owner", dict(type="complete", job_id=first, assessment={"score": 93},
                                                         tray_exchanging=True, collector_count=24)))
        self.assertIsNone(r.active)
        r.command("resume")
        self.assertIsNone(r.active)
        r.renderer_message("owner", dict(type="tray_status", busy=False, count=0))
        self.assertEqual(r.active["user_id"], "u2")
        self.assertFalse(r.renderer_message("owner", dict(type="complete", job_id=first)))
        self.assertEqual(r.counters["completed"], 1)

    def test_owner_handoff_recovers_logical_elapsed_and_rejects_mirror_writes(self):
        r = self.runtime
        r.attach_display("mirror")
        r.receive_event(member())
        job = r.active["id"]
        self.assertFalse(r.renderer_message("mirror", dict(type="complete", job_id=job)))
        self.assertTrue(r.renderer_message("owner", dict(type="progress", job_id=job, elapsed=6.5,
            phase="engraving", avatar_status="actual", portrait_message="")))
        r.detach_display("owner")
        self.assertEqual(r.owner_id, "mirror")
        self.assertEqual(r.runtime["elapsed"], 6.5)
        self.assertEqual(r.runtime["avatar_status"], "actual")
        self.assertTrue(r.renderer_message("mirror", dict(type="complete", job_id=job, assessment={"score": 95})))

    def test_reset_rejects_old_epoch_and_resets_busy(self):
        r = self.runtime
        r.receive_event(member())
        old = r.active["id"]
        r.runtime["tray_exchanging"] = True
        r.command("reset")
        r.command("simulate_gift", "新观众")
        self.assertFalse(r.renderer_message("owner", dict(type="complete", job_id=old)))
        self.assertFalse(r.runtime["tray_exchanging"])
        self.assertEqual(r.active["nickname"], "新观众")
        self.assertEqual(r.commands[-1]["action"], "reset")

    def test_config_persistence_and_secret_redaction(self):
        r = self.runtime
        r.save_config(dict(view_token="secret-test", room_id="123", closeup_mode="all"))
        r.save_config(dict(view_token="", speed=2.5))
        self.assertEqual(r.config["view_token"], "secret-test")
        restored = StudioRuntime(r.config_path)
        self.assertEqual(restored.config["view_token"], "secret-test")
        self.assertNotIn("secret-test", json.dumps(r.snapshot()))
        self.assertTrue(r.public_config()["has_view_token"])
        r.save_config(dict(clear_view_token=True))
        self.assertFalse(r.public_config()["has_view_token"])
        for bad in [{"speed": float("nan")}, {"max_queue": 0}, {"relay_base": "ws://host/?token=secret"},
                    {"relay_base": "ws://user:secret@host"}, {"room_id": "../../escape"}, {"save_path": "other"}]:
            with self.assertRaises(ValueError):
                r.save_config(bad)

    def test_closeup_updates_current_and_pending_on_config_change(self):
        r = self.runtime
        r.receive_event(member())
        r.receive_event(gift("u2"))
        self.assertFalse(r.active["closeup"])
        self.assertTrue(r.queue[0]["closeup"])
        r.save_config(dict(closeup_mode="off"))
        self.assertFalse(r.active["closeup"])
        self.assertFalse(r.queue[0]["closeup"])
        r.save_config(dict(closeup_mode="all"))
        self.assertTrue(r.active["closeup"])

    def test_room_switch_has_independent_entry_and_gift_deduplication(self):
        r = self.runtime
        r.config["room_id"] = "room-one"
        self.assertTrue(r.receive_event(member()))
        self.assertTrue(r.receive_event(gift()))
        self.assertFalse(r.receive_event(gift()))
        first = r.active["id"]
        r.config["room_id"] = "room-two"
        self.assertTrue(r.receive_event(member()))
        self.assertTrue(r.receive_event(gift()))
        self.assertEqual(r.active["id"], first)
        self.assertEqual(len(r.queue), 1)
        self.assertEqual(r.queue[0]["room_id"], "room-two")
        self.assertTrue(r.queue[0]["is_gift"])
        self.assertEqual(r.queue[0]["gift_count"], 1)

    def test_gift_can_supply_missing_avatar_for_pending_entry(self):
        r = self.runtime
        r.receive_event(member("active", "a"))
        r.receive_event(member())
        queued_id = r.queue[0]["id"]
        event = gift()
        event["user"]["avatar_url"] = "https://p3.douyinpic.com/valid.png"
        self.assertTrue(r.receive_event(event))
        self.assertEqual(r.queue[0]["id"], queued_id)
        self.assertTrue(r.queue[0]["avatar_url"].startswith("/api/avatar/"))

    def test_speed_is_limited_to_the_supported_renderer_options(self):
        for speed in (1, 1.5, 1.8, 2, 2.5):
            self.runtime.save_config({"speed": speed})
            self.assertEqual(self.runtime.config["speed"], speed)
        for speed in (.25, 1.25, 3, 5):
            with self.assertRaises(ValueError):
                self.runtime.save_config({"speed": speed})

    def test_external_import_reads_consumer_fields_only_and_saved_config_wins(self):
        project = Path(self.temp.name) / "relay"
        project.mkdir()
        (project / ".env").write_text('ROOM_ID=123\nRELAY_WS_BASE=wss://relay.test/prefix\nVIEW_TOKEN="consumer-secret"\nDOUYIN_COOKIE=never-copy\nINGEST_TOKEN=never-copy-either\n', encoding="utf-8")
        imported = import_relay_config(project)
        self.assertTrue(imported["relay_enabled"])
        self.assertNotIn("DOUYIN_COOKIE", imported)
        self.assertEqual(relay_url({**self.runtime.config, **imported}),
                         "wss://relay.test/prefix/events/123?token=consumer-secret")
        imported_runtime = StudioRuntime(self.runtime.config_path, relay_project=project)
        self.assertEqual(imported_runtime.public_config()["relay_source"], "provided-project")
        imported_runtime.save_config(dict(room_id="456", relay_enabled=False))
        restored = StudioRuntime(self.runtime.config_path, relay_project=project)
        self.assertEqual(restored.config["room_id"], "456")
        self.assertFalse(restored.config["relay_enabled"])
        self.assertNotIn("never-copy", self.runtime.config_path.read_text(encoding="utf-8"))
        restored.save_config({"clear_view_token": True})
        cleared = StudioRuntime(self.runtime.config_path, relay_project=project)
        self.assertEqual(cleared.config["view_token"], "")
        (project / ".env").write_text("ROOM_ID=123456789\nRELAY_WS_BASE=ws://127.0.0.1:8002\nVIEW_TOKEN=change-me-view-token\n", encoding="utf-8")
        placeholder = import_relay_config(project)
        self.assertFalse(placeholder.get("relay_enabled", False))
        self.assertNotIn("view_token", placeholder)
        self.assertNotIn("room_id", placeholder)

    def test_avatar_allowlist_and_hash_proxy(self):
        r = self.runtime
        proxy = r.register_avatar("https://p3.douyinpic.com/avatar/test.png?x=1")
        self.assertTrue(proxy.startswith("/api/avatar/"))
        self.assertNotIn("douyinpic", proxy)
        for url in ["http://127.0.0.1/a", "http://169.254.169.254/a", "file:///etc/passwd",
                    "https://douyinpic.com.evil.test/a", "https://evil-douyinpic.com/a",
                    "https://user:pass@p3.douyinpic.com/a", "https://p3.douyinpic.com:123/a"]:
            self.assertIsNone(safe_avatar_url(url))


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "index.html").write_text("LIVE", encoding="utf-8")
        (self.root / "admin.html").write_text("ADMIN", encoding="utf-8")
        (self.root / "main.js").write_text("export {};", encoding="utf-8")
        for name in [".env", "studio_server.py"]:
            (self.root / name).write_text("DO-NOT-SERVE", encoding="utf-8")
        (self.root / ".local").mkdir()
        (self.root / ".local" / "studio-config.json").write_text('{"view_token":"do-not-serve"}')

    def tearDown(self):
        self.temp.cleanup()

    def app(self, **kwargs):
        return create_app(root=self.root, config_path=self.root / "settings.json", **kwargs)

    def test_static_allowlist_and_api_secret(self):
        with TestClient(self.app()) as client:
            self.assertEqual(client.get("/").text, "LIVE")
            self.assertEqual(client.get("/live").text, "LIVE")
            self.assertEqual(client.get("/admin").text, "ADMIN")
            self.assertEqual(client.get("/main.js").status_code, 200)
            for path in ["/.env", "/.local/studio-config.json", "/studio_server.py", "/.git/config", "/assets/", "/output/verification.json", "/%2e%2e/.env"]:
                self.assertEqual(client.get(path).status_code, 404, path)
            result = client.put("/api/config", json={"view_token": "secret-value"})
            self.assertEqual(result.status_code, 200)
            self.assertNotIn("secret-value", result.text)
            self.assertNotIn("secret-value", client.get("/api/state").text)

    def test_cross_origin_and_invalid_json_rejected(self):
        with TestClient(self.app()) as client:
            self.assertEqual(client.post("/api/command", json={"action": "reset"}, headers={"Origin": "https://evil.test"}).status_code, 403)
            self.assertEqual(client.get("/api/state", headers={"Host": "evil.test"}).status_code, 403)
            self.assertEqual(client.post("/api/command", content='{"action":"reset"}').status_code, 415)
            self.assertEqual(client.post("/api/command", content="[]", headers={"Content-Type": "application/json"}).status_code, 400)
            self.assertEqual(client.post("/api/command", json={"action": "bogus"}).status_code, 422)
            with self.assertRaises(Exception):
                with client.websocket_connect("/ws/studio?role=display", headers={"Origin": "https://evil.test"}):
                    pass

    def test_socket_owner_and_handoff_end_to_end(self):
        with TestClient(self.app()) as client:
            with client.websocket_connect("/ws/studio?role=display") as owner:
                initial = owner.receive_json()
                owner_id = initial["client_id"]
                self.assertTrue(initial["is_renderer"])
                with client.websocket_connect("/ws/studio?role=display") as mirror:
                    snapshot = mirror.receive_json()
                    mirror_id = snapshot["client_id"]
                    self.assertFalse(snapshot["is_renderer"])
                    owner.receive_json()
                    state = client.post("/api/command", json={"action": "simulate_entry", "nickname": "真实入场流程"}).json()
                    job = state["active"]["id"]
                    owner.receive_json(); mirror.receive_json()
                    mirror.send_json(dict(type="complete", job_id=job, assessment={"score": 99}))
                    self.assertEqual(client.get("/api/state").json()["counters"]["completed"], 0)
                    owner.send_json(dict(type="progress", job_id=job, elapsed=6.68, phase="engraving", avatar_status="actual"))
                    progress = owner.receive_json(); mirror.receive_json()
                    self.assertEqual(progress["state"]["runtime"]["elapsed"], 6.68)
                    owner.close()
                    transferred = mirror.receive_json()
                    self.assertTrue(transferred["is_renderer"])
                    self.assertEqual(transferred["state"]["display"]["owner_id"], mirror_id)
                    self.assertNotEqual(mirror_id, owner_id)
                    self.assertEqual(transferred["state"]["active"]["id"], job)
                    mirror.send_json(dict(type="complete", job_id=job, assessment={"score": 94, "clarity": 91}, work_seconds=10))
                    completed = mirror.receive_json()["state"]
                    self.assertEqual(completed["counters"]["completed"], 1)
                    self.assertEqual(completed["recent"][0]["assessment"]["clarity"], 91)

    def test_avatar_download_cache_redirect_and_limits(self):
        calls = []
        png = b"\x89PNG\r\n\x1a\n" + b"test-content"
        def remote(request):
            calls.append(str(request.url))
            if request.url.path == "/redirect":
                return httpx.Response(302, headers={"Location": "http://127.0.0.1/private"})
            if request.url.path == "/too-large":
                return httpx.Response(200, headers={"Content-Type": "image/png", "Content-Length": "3000000"}, content=b"x")
            if request.url.path == "/html":
                return httpx.Response(200, headers={"Content-Type": "text/html"}, content=b"bad")
            return httpx.Response(200, headers={"Content-Type": "image/png"}, content=png)
        app = self.app(avatar_transport=httpx.MockTransport(remote), avatar_dns=False)
        with TestClient(app) as client:
            runtime = app.state.runtime
            url = runtime.register_avatar("https://p3.douyinpic.com/valid")
            self.assertEqual(client.get(url).content, png)
            self.assertEqual(client.get(url).content, png)
            self.assertEqual(len(calls), 1)
            for path in ("redirect", "too-large", "html"):
                proxy = runtime.register_avatar("https://p3.douyinpic.com/" + path)
                self.assertEqual(client.get(proxy).status_code, 404)
            self.assertFalse(any("127.0.0.1" in url for url in calls))
            self.assertEqual(client.get("/api/avatar/unknown").status_code, 404)
            self.assertEqual(client.get("/api/avatar/unknown?url=http://127.0.0.1/").status_code, 404)


class RelayHarness:
    """An actual local relay WebSocket, on its own event loop."""
    def __init__(self):
        self.ready = threading.Event()
        self.connected = threading.Event()
        self.path = None
        self.connection = None
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()
        if not self.ready.wait(5):
            raise RuntimeError("test relay failed to start")

    def run(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        async def handler(connection):
            self.connection = connection
            self.path = connection.request.path
            self.connected.set()
            await connection.send(json.dumps({"type": "connected", "room_id": "123"}))
            await connection.wait_closed()
        async def start():
            self.server = await websockets.serve(handler, "127.0.0.1", 0)
            self.port = self.server.sockets[0].getsockname()[1]
        self.loop.run_until_complete(start())
        self.ready.set()
        self.loop.run_forever()
        self.loop.close()

    def send(self, event):
        if not self.connected.wait(5):
            raise RuntimeError("studio didn't connect")
        asyncio.run_coroutine_threadsafe(self.connection.send(json.dumps(event)), self.loop).result(5)

    def close(self):
        async def stop():
            self.server.close()
            await self.server.wait_closed()
        asyncio.run_coroutine_threadsafe(stop(), self.loop).result(5)
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(5)


class RelayIntegrationTests(unittest.TestCase):
    def test_real_relay_member_and_gift_reach_studio_websocket(self):
        relay = RelayHarness()
        try:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "settings.json"
                path.write_text(json.dumps({"relay_enabled": True, "relay_base": f"ws://127.0.0.1:{relay.port}/prefix", "room_id": "123", "view_token": "consumer-secret"}))
                app = create_app(config_path=path)
                with TestClient(app) as client:
                    with client.websocket_connect("/ws/studio?role=display") as display:
                        initial = display.receive_json()
                        if initial["state"]["relay"]["status"] != "connected":
                            self.assertEqual(display.receive_json()["state"]["relay"]["status"], "connected")
                        relay.send(member(avatar_url="https://p3.douyinpic.com/avatar.png"))
                        first = display.receive_json()["state"]
                        job_id = first["active"]["id"]
                        self.assertTrue(first["active"]["avatar_url"].startswith("/api/avatar/"))
                        self.assertFalse(first["active"]["closeup"])
                        relay.send(gift())
                        upgraded = display.receive_json()["state"]
                        self.assertEqual(upgraded["active"]["id"], job_id)
                        self.assertTrue(upgraded["active"]["closeup"])
                        self.assertEqual(upgraded["active"]["gift_name"], "小星星")
                        self.assertEqual(relay.path, "/prefix/events/123?token=consumer-secret")
                        self.assertNotIn("consumer-secret", json.dumps(upgraded))
        finally:
            relay.close()


if __name__ == "__main__":
    unittest.main()
