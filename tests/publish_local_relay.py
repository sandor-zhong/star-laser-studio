"""Send synthetic events through the supplied LOCAL relay for a smoke check.

This never connects to Douyin or sends a real gift. It reads the local relay's
ingest credential without printing it; remote relay destinations are refused.
"""
import argparse
import asyncio
import ipaddress
import json
import time
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

from dotenv import dotenv_values
import websockets


async def run(args):
    values = dotenv_values(Path(args.relay_project) / ".env")
    base = urlsplit(values.get("RELAY_WS_BASE", ""))
    if base.scheme != "ws" or base.username or base.password or base.query:
        raise SystemExit("This probe is restricted to a local ws:// relay.")
    if base.hostname != "localhost":
        try:
            local = ipaddress.ip_address(base.hostname).is_loopback
        except ValueError:
            local = False
        if not local:
            raise SystemExit("Remote relay probes are disabled.")
    room = values.get("ROOM_ID", "")
    token = values.get("INGEST_TOKEN", "")
    if not room or not token:
        raise SystemExit("The local relay is not configured.")
    url = urlunsplit((base.scheme, base.netloc, base.path.rstrip("/") + "/ingest/" + quote(room, safe=""), "", ""))
    stamp = str(time.time_ns())
    counts = [1, 3, 3] if args.kind == "combo" else [1]
    async with websockets.connect(url, additional_headers={"Authorization": "Bearer " + token}) as connection:
        for index, count in enumerate(counts):
            event = {
                "type": "member" if args.kind == "entry" else "gift", "source": "local_integration_test",
                "room_id": room, "msg_id": f"probe-{stamp}-{index}", "timestamp": int(time.time() * 1000),
                "user": {"id": args.user_id, "nickname": args.nickname, "avatar_url": ""},
                "data": {} if args.kind == "entry" else {
                    "gift_id": "local-test-star", "gift_name": "联调小星星", "repeat_count": count,
                    "group_id": "probe-group-" + stamp, "repeat_end": index == len(counts) - 1,
                },
            }
            await connection.send(json.dumps(event, ensure_ascii=False))
        await asyncio.sleep(.2)
    print(json.dumps({"published": len(counts), "kind": args.kind, "synthetic": True}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relay-project", default="D:/PythonProjects/douyin-browser-ws-relay")
    parser.add_argument("--kind", choices=["entry", "gift", "combo"], default="entry")
    parser.add_argument("--user-id", default="local-browser-smoke")
    parser.add_argument("--nickname", default="联调观众")
    asyncio.run(run(parser.parse_args()))
