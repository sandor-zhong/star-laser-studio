"""Two-stage browser smoke check through the supplied local relay.

Open the studio display first. Run --phase entry, inspect the paused display,
then --phase gift. Only synthetic events are sent. Resume in the admin page.
"""
import argparse
import asyncio
import json
import time
from pathlib import Path
from types import SimpleNamespace

import httpx
from publish_local_relay import run as publish

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / ".local" / "pipeline-smoke.json"


async def check(args):
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8082", trust_env=False, timeout=5) as client:
        async def state():
            response = await client.get("/api/state");response.raise_for_status();return response.json()

        async def command(action):
            response = await client.post("/api/command", json={"action": action});response.raise_for_status();return response.json()

        async def until(predicate, timeout=30):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                current = await state()
                if predicate(current):return current
                await asyncio.sleep(.12)
            raise AssertionError("The browser did not acknowledge the expected state.")

        def event_options(kind, user):
            return SimpleNamespace(relay_project=args.relay_project, kind=kind, user_id=user, nickname="联调观众")

        before = await state()
        assert before["relay"]["status"] == "connected", "Start the supplied local relay first."
        assert before["display"]["connected"], "Open the studio display first."
        assert before["config"]["closeup_mode"] == "gifts" and before["config"]["print_on_entry"], "This check expects entry printing and gift-only closeup."
        if args.phase == "entry":
            assert not before["active"] and not before["queue"], "Do not interrupt an existing job."
            await command("pause")
            user = "local-pipeline-" + str(time.time_ns())
            await publish(event_options("entry", user))
            queued = await until(lambda s: any(job["user_id"] == user for job in s["queue"]))
            job = next(job for job in queued["queue"] if job["user_id"] == user)
            assert not job["closeup"] and not job["is_gift"]
            await command("resume")
            running = await until(lambda s: s["active"] and s["active"]["id"] == job["id"] and s["runtime"]["elapsed"] >= 4.1)
            paused = await command("pause")
            result = {"user": user, "job": job["id"], "accepted_before": before["counters"]["accepted"], "entry_print": True,
                      "entry_closeup": paused["active"]["closeup"], "elapsed": paused["runtime"]["elapsed"]}
            PROBE.parent.mkdir(exist_ok=True);PROBE.write_text(json.dumps(result), encoding="utf-8")
            print(json.dumps({key: value for key, value in result.items() if key not in {"user", "job"}}))
        else:
            saved = json.loads(PROBE.read_text(encoding="utf-8"))
            assert before["paused"] and before["active"] and before["active"]["id"] == saved["job"], "Finish the entry stage first."
            await publish(event_options("combo", saved["user"]))
            upgraded = await until(lambda s: s["active"] and s["active"]["id"] == saved["job"] and s["active"]["gift_count"] == 3)
            assert upgraded["active"]["closeup"] and upgraded["active"]["is_gift"]
            assert not upgraded["queue"] and upgraded["counters"]["accepted"] == saved["accepted_before"] + 1
            skipped = upgraded["counters"]["skipped"]
            await publish(event_options("entry", saved["user"]))
            final = await until(lambda s: s["counters"]["skipped"] > skipped)
            result = {"synthetic": True, "original_relay_protocol": True, "entry_print": True, "entry_closeup": saved["entry_closeup"],
                      "gift_upgraded_same_job": final["active"]["id"] == saved["job"], "gift_closeup": final["active"]["closeup"],
                      "gift_count": final["active"]["gift_count"], "duplicate_entry_skipped": True, "duplicate_prints": len(final["queue"])}
            assert result["duplicate_prints"] == 0
            (ROOT / "output" / "live-relay-smoke-verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", choices=["entry", "gift"], required=True)
    parser.add_argument("--relay-project", default="D:/PythonProjects/douyin-browser-ws-relay")
    asyncio.run(check(parser.parse_args()))
