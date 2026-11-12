"""Read-only diagnostics for the local live-room pipeline. Never prints keys."""
import json
import httpx


def health():
    result = {}
    with httpx.Client(timeout=2, trust_env=False) as client:
        for port, path in [(8002, "/health"), (8082, "/api/state"), (8757, "/api/rooms")]:
            try:
                response = client.get(f"http://127.0.0.1:{port}{path}")
                value = response.json()
                item = {"http": response.status_code, "available": True}
                if port == 8082:
                    item.update(relay=value.get("relay"), room=value.get("config", {}).get("room_id"),
                                display=value.get("display"), active=bool(value.get("active")),
                                counters=value.get("counters"))
                elif port == 8757:
                    item["rooms"] = [{key: room.get(key) for key in ("roomId", "status", "error", "messageCount")}
                                     for room in value.get("rooms", [])]
                result[str(port)] = item
            except Exception as error:
                result[str(port)] = {"available": False, "error": type(error).__name__}
    return result


if __name__ == "__main__":
    print(json.dumps(health(), ensure_ascii=False, indent=2))
