"""Observe actual DyHub messages and studio progress, storing counts only."""
import argparse
import asyncio
import json
import time
from collections import Counter
from pathlib import Path

import httpx
import websockets

ROOT = Path(__file__).resolve().parents[1]


async def observe(room, seconds):
    counts = Counter()
    avatar_samples = Counter()
    async with httpx.AsyncClient(timeout=4, trust_env=False) as http:
        initial = (await http.get("http://127.0.0.1:8082/api/state")).json()
        assert initial["config"]["room_id"] == room, "Studio is configured for another room."
        started = time.monotonic()
        url = f"ws://127.0.0.1:8757/ws?roomId={room}&types=chat,gift,member,like,follow"
        async with websockets.connect(url, ping_interval=20, proxy=None) as connection:
            while time.monotonic() - started < seconds:
                try:
                    raw = await asyncio.wait_for(connection.recv(), min(3, seconds - (time.monotonic() - started)))
                    value = json.loads(raw)
                    for event in value if isinstance(value, list) else [value]:
                        if isinstance(event, dict) and event.get("type") in {"chat", "gift", "member", "like", "follow"}:
                            counts[event["type"]] += 1
                except asyncio.TimeoutError:
                    pass
                state = (await http.get("http://127.0.0.1:8082/api/state")).json()
                if state.get("active"):
                    avatar_samples[state["runtime"].get("avatar_status", "unknown")] += 1
        final = (await http.get("http://127.0.0.1:8082/api/state")).json()
        rooms = (await http.get("http://127.0.0.1:8757/api/rooms")).json().get("rooms", [])
        room_state = next((item for item in rooms if item.get("roomId") == room), {})
        result = {
            "room_id": room, "synthetic": False, "observed_seconds": round(time.monotonic() - started, 2),
            "collector_status": room_state.get("status"), "relay_status": final["relay"]["status"],
            "actual_event_counts": dict(counts), "avatar_status_samples": dict(avatar_samples),
            "studio_before": initial["counters"], "studio_after": final["counters"],
            "completed_during_observation": final["counters"]["completed"] - initial["counters"]["completed"],
            "queue_length": len(final["queue"]),
            "recent_actual_avatar_count": sum(item.get("avatar_status") == "actual" for item in final["recent"]),
            "real_gift_observed": bool(counts["gift"]),
        }
        output = ROOT / "output" / "actual-live-room-verification.json"
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--room", required=True)
    parser.add_argument("--seconds", type=float, default=60)
    args = parser.parse_args()
    asyncio.run(observe(args.room, max(1, min(180, args.seconds))))
