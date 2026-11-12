"""Live-room print queue and configuration, independent of the renderer and transport."""
from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import secrets
import time
import uuid
from collections import OrderedDict
from pathlib import Path
from urllib.parse import quote, urlencode, urlsplit, urlunsplit


DEFAULT_CONFIG = {
    "relay_enabled": False, "relay_base": "ws://127.0.0.1:8002", "room_id": "",
    "view_token": "", "print_on_entry": True, "entry_cooldown_seconds": 600,
    "gift_priority": True, "gift_min_count": 1, "max_queue": 120, "speed": 1.8,
    "closeup_mode": "gifts",
}
AVATAR_DOMAINS = ("douyinpic.com", "byteimg.com", "ibyteimg.com", "pstatp.com",
                  "toutiaoimg.com", "douyinstatic.com", "bytedance.com")
CHALLENGE_MAX_SCORE = 100000
LIVE_EVENT_TYPES = {'comment', 'member', 'gift', 'like', 'follow', 'share', 'social'}


def create_challenge_assessment():
    """One entertainment score per workpiece; unrelated to its image or person."""
    return dict(score=secrets.randbelow(CHALLENGE_MAX_SCORE + 1), label="随机作品分",
                mode="random", min=0, max=CHALLENGE_MAX_SCORE)


def ensure_challenge_assessment(job):
    """Preserve a valid server score and initialize legacy jobs only once."""
    assessment = job.get("assessment")
    if (not isinstance(assessment, dict) or assessment.get("mode") != "random"
            or type(assessment.get("score")) is not int
            or not 0 <= assessment["score"] <= CHALLENGE_MAX_SCORE):
        job["assessment"] = create_challenge_assessment()
    else:
        job["assessment"] = dict(score=assessment["score"], label="随机作品分",
                                 mode="random", min=0, max=CHALLENGE_MAX_SCORE)
    return job["assessment"]


def safe_avatar_url(value):
    """Accept only known portrait CDNs; clients never choose proxy target URLs."""
    if not isinstance(value, str) or len(value) > 4096:
        return None
    try:
        parts = urlsplit(value)
        host = (parts.hostname or "").lower().rstrip(".")
        if parts.scheme not in {"https", "http"} or parts.username or parts.password:
            return None
        if parts.port not in {None, 80, 443} or not any(host == d or host.endswith("." + d) for d in AVATAR_DOMAINS):
            return None
        return urlunsplit(("https", host, parts.path or "/", parts.query, ""))
    except ValueError:
        return None


def _text(value, limit=100):
    return str(value or "").strip()[:limit]


def _number(value, low, high, default, integer=False):
    if isinstance(value, bool):
        raise ValueError("数值配置不能使用布尔值")
    try:
        number = float(value)
    except (ValueError, TypeError):
        raise ValueError("数值配置无效") from None
    if not math.isfinite(number) or not low <= number <= high:
        raise ValueError(f"数值应在 {low:g}–{high:g} 之间")
    if integer and number != int(number):
        raise ValueError("该配置必须是整数")
    return int(number) if integer else number


def validate_config(current, update):
    if not isinstance(update, dict):
        raise ValueError("配置必须是对象")
    ignored = {"has_view_token", "configured", "relay_source", "clear_view_token"}
    if set(update) - set(DEFAULT_CONFIG) - ignored:
        raise ValueError("存在不支持的配置字段")
    result = dict(current)
    for name, value in update.items():
        if name in ignored:
            continue
        if name in {"relay_enabled", "print_on_entry", "gift_priority"}:
            if not isinstance(value, bool):
                raise ValueError(f"{name} 必须为布尔值")
        elif name == "relay_base":
            value = _text(value, 2048).rstrip("/")
            try:
                parts = urlsplit(value)
                if parts.scheme not in {"ws", "wss"} or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
                    raise ValueError()
                parts.port
            except ValueError:
                raise ValueError("Relay 地址应为 ws:// 或 wss://，不包含凭据或查询参数") from None
        elif name == "room_id":
            value = _text(value, 128)
            if value and (not value.isascii() or not all(c.isalnum() or c in "_-" for c in value)):
                raise ValueError("房间 ID 只能包含字母、数字、下划线和短横线")
        elif name == "view_token":
            value = _text(value, 2048)
            if not value:
                continue  # Password inputs may submit blank to preserve the saved secret.
        elif name == "entry_cooldown_seconds":
            value = _number(value, 0, 86400, 600, True)
        elif name == "gift_min_count":
            value = _number(value, 1, 100000, 1, True)
        elif name == "max_queue":
            value = _number(value, 1, 500, 120, True)
        elif name == "speed":
            value = _number(value, 1, 2.5, 1.8)
            if value not in {1, 1.5, 1.8, 2, 2.5}:
                raise ValueError("生产速率应为 1、1.5、1.8、2 或 2.5")
        elif name == "closeup_mode" and value not in {"gifts", "all", "off"}:
            raise ValueError("特写模式应为 gifts、all 或 off")
        result[name] = value
    if update.get("clear_view_token") is True:
        result["view_token"] = ""
    return result


def import_relay_config(project):
    """Read only the three consumer settings from a user-provided relay project."""
    if not project:
        return {}
    allowed = {"ROOM_ID", "RELAY_WS_BASE", "VIEW_TOKEN"}
    values = {}
    path = Path(project) / ".env"
    try:
        with path.open(encoding="utf-8-sig") as handle:
            for line in handle:
                key, separator, value = line.strip().partition("=")
                if separator and key.strip() in allowed:
                    value = value.strip()
                    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                        value = value[1:-1]
                    values[key.strip()] = value
    except OSError:
        return {}
    result = {target: values[source] for source, target in (
        ("ROOM_ID", "room_id"), ("RELAY_WS_BASE", "relay_base"), ("VIEW_TOKEN", "view_token")
    ) if values.get(source)}
    # The example file is deliberately not considered configured.
    placeholders = ("your_", "your-", "replace", "example", "changeme", "change-me", "请", "填")
    result = {key: value for key, value in result.items()
              if not any(p in value.lower() for p in placeholders)}
    if result.get("room_id") == "123456789":
        result.pop("room_id")
    if all(result.get(k) for k in ("room_id", "relay_base", "view_token")):
        result["relay_enabled"] = True
    try:
        return {key: value for key, value in validate_config(DEFAULT_CONFIG, result).items()
                if key in result}
    except ValueError:
        return {}


def relay_url(config):
    parts = urlsplit(config["relay_base"])
    path = parts.path.rstrip("/") + "/events/" + quote(config["room_id"], safe="")
    return urlunsplit((parts.scheme, parts.netloc, path,
                       urlencode({"token": config["view_token"]}), ""))


class StudioRuntime:
    def __init__(self, config_path, *, relay_project=None, clock=time.time):
        self.config_path = Path(config_path)
        self.clock = clock
        self.config = dict(DEFAULT_CONFIG)
        imported = import_relay_config(relay_project)
        self.relay_source = "provided-project" if imported else "local"
        self.config.update(imported)
        try:
            saved = json.loads(self.config_path.read_text(encoding="utf-8"))
            # On disk an empty token is intentional (the admin cleared it). The
            # HTTP update convention, where blank means preserve, must not revive
            # a previously imported token after restarting the server.
            if isinstance(saved, dict) and saved.get("view_token") == "":
                saved = {**saved, "clear_view_token": True}
            self.config = validate_config(self.config, saved)
            self.relay_source = "local"
        except (OSError, ValueError, TypeError):
            pass
        self.queue = []
        self.active = None
        self.paused = False
        self.counters = dict(events=0, accepted=0, completed=0, skipped=0, queue_dropped=0)
        self.logs = []
        self.recent = []
        self.live_events = []
        self.ranking = []
        self.commands = []
        self.runtime = dict(elapsed=0, phase="idle", collector_count=0, tray_exchanging=False,
                            avatar_status="loading", portrait_message="")
        self.relay = dict(status="disabled", message="尚未连接直播中继", last_event_at=None)
        self.displays = []
        self.avatars = OrderedDict()
        self.seen = OrderedDict()
        self.entry_seen = OrderedDict()
        self.gift_groups = OrderedDict()
        self.log("info", "直播工作台已启动；等待直播事件或后台模拟")

    @property
    def owner_id(self):
        return self.displays[0] if self.displays else None

    def public_config(self):
        result = {key: value for key, value in self.config.items() if key != "view_token"}
        result.update(has_view_token=bool(self.config["view_token"]),
                      configured=bool(self.config["room_id"] and self.config["view_token"]),
                      relay_source=self.relay_source)
        return result

    def snapshot(self):
        for job in [self.active, *self.queue]:
            if job:
                ensure_challenge_assessment(job)
        return copy.deepcopy(dict(config=self.public_config(), relay=self.relay, queue=self.queue,
            active=self.active, paused=self.paused, counters=self.counters, logs=self.logs,
            recent=self.recent, ranking=self.ranking, live_events=self.live_events,
            display={"connected": len(self.displays), "owner_id": self.owner_id},
            runtime=self.runtime, commands=self.commands))

    def log(self, level, message):
        self.logs.append(dict(time=self.clock(), level=level, message=message))
        del self.logs[:-100]

    def save_config(self, update):
        updated = validate_config(self.config, update)
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.config_path.with_suffix(".tmp")
        data = json.dumps(updated, ensure_ascii=False, indent=2)
        temporary.write_text(data, encoding="utf-8")
        try:
            os.chmod(temporary, 0o600)
        except OSError:
            pass
        temporary.replace(self.config_path)
        self.config = updated
        self.relay_source = "local"
        for job in [self.active, *self.queue]:
            if job:
                job["closeup"] = self.closeup(job["is_gift"])
        overflow = len(self.queue) - updated["max_queue"]
        if overflow > 0:
            del self.queue[-overflow:]
            self.counters["queue_dropped"] += overflow
        self.log("info", "直播配置已保存")

    def closeup(self, gift):
        return self.config["closeup_mode"] == "all" or (gift and self.config["closeup_mode"] == "gifts")

    def register_avatar(self, value):
        url = safe_avatar_url(value)
        if not url:
            return None
        key = hashlib.sha256(url.encode()).hexdigest()[:32]
        self.avatars[key] = url
        self.avatars.move_to_end(key)
        protected = {record.get('avatar_url', '').removeprefix('/api/avatar/')
                     for record in [self.active, *self.queue, *self.recent, *self.ranking, *self.live_events]
                     if record and record.get('avatar_url')}
        while len(self.avatars) > 1024:
            victim = next((item for item in self.avatars if item not in protected), None)
            if victim is None:
                break
            del self.avatars[victim]
        return "/api/avatar/" + key

    @staticmethod
    def _remember(memory, key, value=True, limit=10000):
        memory[key] = value
        memory.move_to_end(key)
        while len(memory) > limit:
            memory.popitem(last=False)

    def _activate(self):
        if not self.active and self.queue and not self.paused and not self.runtime["tray_exchanging"] and self.owner_id:
            self.active = self.queue.pop(0)
            ensure_challenge_assessment(self.active)
            self.runtime.update(elapsed=0, phase="loading", avatar_status="loading", portrait_message="")
            self.log("info", f"开始打印：{self.active['nickname']}")

    def attach_display(self, client_id):
        if client_id not in self.displays:
            self.displays.append(client_id)
        self._activate()

    def detach_display(self, client_id):
        if client_id in self.displays:
            self.displays.remove(client_id)
        # The active job and its logical elapsed time survive renderer handoff.
        self._activate()

    def _enqueue(self, user, kind, source, gift_name="", gift_count=0, room_id=None):
        user_id = _text(user.get("id") or user.get("sec_uid"), 200)
        if not user_id:
            self.counters["skipped"] += 1
            return False
        nickname = _text(user.get("nickname"), 40) or "直播观众"
        room_id = self.config["room_id"] if room_id is None else room_id
        existing = next((job for job in [self.active, *self.queue]
                         if job and job["user_id"] == user_id and job.get("room_id", "") == room_id), None)
        if existing:
            if kind != "gift":
                self.counters["skipped"] += 1
                return False
            ensure_challenge_assessment(existing)
            existing.update(is_gift=True, kind="gift", closeup=self.closeup(True),
                            gift_name=gift_name, gift_count=existing["gift_count"] + gift_count)
            if not existing.get("avatar_url"):
                existing["avatar_url"] = self.register_avatar(user.get("avatar_url"))
            if existing in self.queue and self.config["gift_priority"]:
                self.queue.remove(existing)
                insertion = next((i for i, job in enumerate(self.queue) if not job["is_gift"]), len(self.queue))
                self.queue.insert(insertion, existing)
            self.log("info", f"礼物特写已安排：{nickname}，{gift_name} ×{gift_count}")
            return True
        if len(self.queue) >= self.config["max_queue"]:
            # A gift may displace the last ordinary pending job, never an active job.
            victim = next((i for i in range(len(self.queue) - 1, -1, -1) if not self.queue[i]["is_gift"]), None)
            self.counters["queue_dropped"] += 1
            if kind != "gift" or not self.config["gift_priority"] or victim is None:
                self.log("warning", "等待队列已满，本次打印请求未排入")
                return False
            self.queue.pop(victim)
        job = dict(id=uuid.uuid4().hex, user_id=user_id, nickname=nickname,
                   avatar_url=self.register_avatar(user.get("avatar_url")), kind=kind,
                   is_gift=kind == "gift", closeup=self.closeup(kind == "gift"), gift_name=gift_name,
                   gift_count=gift_count, created_at=self.clock(), source=source, room_id=room_id,
                   assessment=create_challenge_assessment())
        if kind == "gift" and self.config["gift_priority"]:
            insertion = next((i for i, pending in enumerate(self.queue) if not pending["is_gift"]), len(self.queue))
            self.queue.insert(insertion, job)
        else:
            self.queue.append(job)
        self.counters["accepted"] += 1
        self.log("info", f"已排队：{nickname}" + (f"，{gift_name} ×{gift_count}" if kind == "gift" else "，入场头像"))
        self._activate()
        return True

    def receive_event(self, event):
        if not isinstance(event, dict) or event.get("type") not in LIVE_EVENT_TYPES:
            return False
        user, data = event.get("user"), event.get("data")
        if not isinstance(user, dict) or not isinstance(data, dict):
            return False
        room = str(event.get("room_id") or "")
        if room and self.config["room_id"] and room != self.config["room_id"]:
            return False
        self.counters["events"] += 1
        self.relay["last_event_at"] = self.clock()
        kind, msg_id = event["type"], _text(event.get("msg_id"), 200)
        room = room or self.config["room_id"]
        if msg_id:
            key = (room, kind, msg_id)
            if key in self.seen:
                self.counters["skipped"] += 1
                return False
            self._remember(self.seen, key)
        # Show received business events even when they do not request a print.
        # Keep a bounded, sanitized feed; never forward the raw upstream object.
        def safe_count(value):
            try:
                return max(0, min(100000000, int(value or 0)))
            except (ValueError, TypeError, OverflowError):
                return 0
        self.live_events.insert(0, dict(type=kind, room_id=room, msg_id=msg_id,
            received_at=self.clock(), nickname=_text(user.get('nickname'), 40) or '直播观众',
            user_id=_text(user.get('id') or user.get('sec_uid'), 200),
            avatar_url=self.register_avatar(user.get('avatar_url')),
            content=_text(data.get('content'), 500) if kind == 'comment' else '',
            gift_name=_text(data.get('gift_name'), 50) if kind == 'gift' else '',
            count=safe_count(data.get('repeat_count') if kind == 'gift' else data.get('count'))))
        del self.live_events[100:]
        if kind not in {'member', 'gift'}:
            return True
        user_id = _text(user.get("id") or user.get("sec_uid"), 200)
        if not user_id:
            self.counters["skipped"] += 1
            return False
        if kind == "member":
            last = self.entry_seen.get((room, user_id))
            if not self.config["print_on_entry"] or (last is not None and self.clock() - last < self.config["entry_cooldown_seconds"]):
                self.counters["skipped"] += 1
                return False
            accepted = self._enqueue(user, "entry", "relay", room_id=room)
            if accepted:
                self._remember(self.entry_seen, (room, user_id), self.clock())
            return accepted
        group_id = _text(data.get("group_id"), 200)
        if group_id in {"", "0"}:
            group_id = "msg:" + (msg_id or uuid.uuid4().hex)
        key = (room, user_id, _text(data.get("gift_id"), 200), group_id)
        previous = self.gift_groups.get(key, {"count": 0, "enqueued": 0})
        try:
            cumulative = max(1, min(100000, int(data.get("repeat_count") or 1)))
        except (ValueError, TypeError, OverflowError):
            cumulative = 1
        count = max(previous["count"], cumulative)
        delta = count - previous["enqueued"]
        record = dict(count=count, enqueued=previous["enqueued"])
        self._remember(self.gift_groups, key, record)
        if count < self.config["gift_min_count"] or delta <= 0:
            self.counters["skipped"] += 1
            return False
        accepted = self._enqueue(user, "gift", "relay", _text(data.get("gift_name"), 50) or "直播礼物", delta, room_id=room)
        if accepted:
            record["enqueued"] = count
        return accepted

    def command(self, action, nickname=None):
        if action == "pause":
            self.paused = True
        elif action == "resume":
            self.paused = False
            self._activate()
        elif action == "clear_queue":
            self.queue.clear()
        elif action == "reset":
            self.queue.clear()
            self.active = None
            self.paused = False
            self.runtime.update(elapsed=0, phase="idle", collector_count=0, tray_exchanging=False,
                                avatar_status="loading", portrait_message="")
            self._issue_command(action)
        elif action == "tray_exchange":
            # The renderer waits for the current physical cycle to complete before exchange.
            self._issue_command(action)
        elif action == "reconnect":
            pass  # Transport service restarts the connection after this mutation.
        elif action in {"simulate_entry", "simulate_gift"}:
            self._enqueue({"id": "simulation:" + uuid.uuid4().hex,
                           "nickname": _text(nickname, 40) or ("礼物测试观众" if action == "simulate_gift" else "入场测试观众")},
                          "gift" if action == "simulate_gift" else "demo", "simulation",
                          "测试小星星" if action == "simulate_gift" else "", 1 if action == "simulate_gift" else 0)
        else:
            raise ValueError("不支持的操作")
        self.log("info", {"pause": "已暂停生产", "resume": "已恢复生产", "clear_queue": "已清空等待队列",
                           "reset": "已重置生产现场", "tray_exchange": "已请求更换收料盘", "reconnect": "已请求重新连接中继"}.get(action, "模拟事件已发送"))

    def _issue_command(self, action):
        self.commands.append({"id": uuid.uuid4().hex, "action": action})
        del self.commands[:-10]

    def renderer_message(self, client_id, message):
        if client_id != self.owner_id or not isinstance(message, dict):
            return False
        kind = message.get("type")
        if kind == "tray_status":
            self.runtime["tray_exchanging"] = bool(message.get("busy"))
            self.runtime["collector_count"] = self._count(message.get("count"), self.runtime["collector_count"])
            self._activate()
            return True
        if kind not in {"progress", "complete"} or not self.active or message.get("job_id") != self.active["id"]:
            return False
        if kind == "progress":
            try:
                elapsed = float(message.get("elapsed", self.runtime["elapsed"]))
                if not math.isfinite(elapsed) or elapsed < 0 or elapsed > 3600:
                    return False
            except (ValueError, TypeError):
                return False
            self.runtime.update(elapsed=elapsed, phase=_text(message.get("phase"), 40) or "working")
            if message.get("avatar_status") in {"actual", "fallback", "loading"}:
                self.runtime["avatar_status"] = message["avatar_status"]
            if isinstance(message.get("portrait_message"), str):
                self.runtime["portrait_message"] = _text(message["portrait_message"], 160)
        self.runtime["collector_count"] = self._count(message.get("collector_count"), self.runtime["collector_count"])
        if "tray_exchanging" in message:
            self.runtime["tray_exchanging"] = bool(message["tray_exchanging"])
        if kind == "complete":
            # Rendering clients report physical completion, never choose a score.
            # Gift upgrades and renderer handoff keep the assessment assigned at enqueue.
            clean = copy.deepcopy(ensure_challenge_assessment(self.active))
            score = clean["score"]
            finished = {**self.active, "assessment": clean, "completed_at": self.clock(),
                        "avatar_status": self.runtime["avatar_status"],
                        "portrait_message": self.runtime["portrait_message"]}
            try:
                seconds = float(message.get("work_seconds", 0))
                finished["work_seconds"] = max(0, min(3600, seconds)) if math.isfinite(seconds) else 0
            except (ValueError, TypeError):
                finished["work_seconds"] = 0
            self.recent.insert(0, finished)
            del self.recent[30:]
            # The session leaderboard survives the rolling recent-history limit.
            # Python's stable sort keeps the first completion ahead on equal scores.
            self.ranking = [job for job in self.ranking if job["id"] != finished["id"]]
            self.ranking.append(copy.deepcopy(finished))
            self.ranking.sort(key=lambda job: job["assessment"]["score"], reverse=True)
            del self.ranking[10:]
            self.counters["completed"] += 1
            self.log("info", f"打印完成：{self.active['nickname']}，评分 {score:g}")
            self.active = None
            self.runtime.update(elapsed=0, phase="tray_exchange" if self.runtime["tray_exchanging"] else "idle")
            self._activate()
        return True

    @staticmethod
    def _count(value, default):
        try:
            return max(0, min(1000, int(value))) if value is not None else default
        except (ValueError, TypeError, OverflowError):
            return default
