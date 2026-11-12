"""Bundled collector mapping, reception, configuration and gateway checks (synthetic)."""
import importlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import httpx

import live_launcher as launcher
from live_relay.dyhub_bridge import normalize_dyhub, register_room
from studio_runtime import StudioRuntime


class LiveReceptionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.runtime = StudioRuntime(Path(self.directory.name) / 'config.json')
        self.runtime.config['room_id'] = '123'
        self.runtime.attach_display('display')

    def tearDown(self):
        self.directory.cleanup()

    def source(self, kind='chat', ident='m1'):
        return {'type': kind, 'id': ident, 'roomId': '123', 'user': {
            'id': 'u1', 'nickname': '<script>观众</script>', 'avatar': 'https://p3.douyinpic.com/avatar.jpg'},
            'data': {'content': '你好，打印头像', 'giftName': '小星星', 'repeatCount': 1}}

    def test_comment_reaches_feed_with_original_text_and_proxy_avatar_without_printing(self):
        event = normalize_dyhub(self.source(), '123')
        self.assertEqual(event['type'], 'comment')
        self.assertTrue(self.runtime.receive_event(event))
        snapshot = self.runtime.snapshot()
        self.assertEqual(snapshot['live_events'][0]['content'], '你好，打印头像')
        self.assertTrue(snapshot['live_events'][0]['avatar_url'].startswith('/api/avatar/'))
        self.assertIsNone(snapshot['active'])
        self.assertEqual(snapshot['counters']['events'], 1)
        self.assertEqual(snapshot['counters']['accepted'], 0)
        self.assertFalse(self.runtime.receive_event(event))
        self.assertEqual(len(self.runtime.live_events), 1)

    def test_member_and_gift_still_print_same_avatar_and_keep_score(self):
        self.runtime.receive_event(normalize_dyhub(self.source('member'), '123'))
        original = dict(self.runtime.active)
        self.runtime.receive_event(normalize_dyhub(self.source('gift', 'gift1'), '123'))
        self.assertEqual(self.runtime.active['id'], original['id'])
        self.assertEqual(self.runtime.active['assessment'], original['assessment'])
        self.assertEqual(self.runtime.active['avatar_url'], original['avatar_url'])
        self.assertTrue(self.runtime.active['is_gift'])
        self.assertEqual([e['type'] for e in self.runtime.live_events], ['gift', 'member'])

    def test_all_supported_nonprinting_events_and_room_filter(self):
        for kind in ['like', 'follow']:
            self.assertTrue(self.runtime.receive_event(normalize_dyhub(self.source(kind, kind), '123')))
        self.assertIsNone(self.runtime.active)
        wrong = self.source(); wrong['roomId'] = '456'
        self.assertIsNone(normalize_dyhub(wrong, '123'))
        event = normalize_dyhub(self.source(), '123'); event['room_id'] = '456'
        self.assertFalse(self.runtime.receive_event(event))
        self.assertEqual(len(self.runtime.live_events), 2)

    def test_event_feed_is_bounded_and_cannot_evict_active_avatar(self):
        self.runtime.receive_event(normalize_dyhub(self.source('member'), '123'))
        active_key = self.runtime.active['avatar_url'].split('/')[-1]
        for i in range(1050):
            item = self.source('chat', str(i))
            item['user']['avatar'] = f'https://p3.douyinpic.com/{i}.jpg'
            item['data']['content'] = 'x' * 1000
            self.runtime.receive_event(normalize_dyhub(item, '123'))
        self.assertEqual(len(self.runtime.live_events), 100)
        self.assertEqual(len(self.runtime.live_events[0]['content']), 500)
        self.assertLessEqual(len(self.runtime.avatars), 1024)
        self.assertIn(active_key, self.runtime.avatars)


class LauncherTests(unittest.TestCase):
    def test_room_input_rejects_foreign_host_and_short_links(self):
        for value in ['278339149230', 'https://live.douyin.com/278339149230', 'https://www.douyin.com/root/live/278339149230?a=1']:
            self.assertEqual(launcher.room_number(value), '278339149230')
        for value in ['', 'https://evil.test/root/live/123', 'https://v.douyin.com/abc', '123abc']:
            with self.assertRaises(ValueError): launcher.room_number(value)

    def test_init_never_overwrites_secrets_and_prepare_keeps_print_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); env = root / 'live.env'
            with patch.object(launcher, 'LOCAL', root), patch.object(launcher, 'ENV_FILE', env):
                values = launcher.initialize('123')
                self.assertEqual(values, launcher.initialize('456'))
                self.assertNotEqual(values['INGEST_TOKEN'], values['VIEW_TOKEN'])
                path = root / 'config.json'
                path.write_text(json.dumps({'speed': 2.5, 'print_on_entry': False, 'room_id': 'old'}))
                result = launcher.prepare_config(values, '456', 8102, path)
                self.assertEqual(result['room_id'], '456')
                self.assertEqual(result['speed'], 2.5)
                self.assertFalse(result['print_on_entry'])
                self.assertEqual(result['relay_base'], 'ws://127.0.0.1:8102')
                self.assertEqual(result['view_token'], values['VIEW_TOKEN'])

    def test_bundled_gateway_filters_room_and_broadcasts_comments(self):
        with patch.dict('os.environ', {'ROOM_ID':'123', 'INGEST_TOKEN':'test-write', 'VIEW_TOKEN':'test-read'}):
            import live_relay.cloud_server as gateway
            importlib.reload(gateway)
            with TestClient(gateway.app) as client:
                self.assertTrue(client.get('/health').json()['configured'])
                with client.websocket_connect('/events/123?token=test-read') as reader:
                    self.assertEqual(reader.receive_json()['type'], 'connected')
                    with client.websocket_connect('/ingest/123', headers={'Authorization':'Bearer test-write'}) as writer:
                        event = normalize_dyhub({'type':'chat', 'id':'gateway-chat', 'roomId':'123',
                            'user':{'id':'u', 'nickname':'网关测试'}, 'data':{'content':'网关弹幕'}}, '123')
                        writer.send_json(event)
                        self.assertEqual(reader.receive_json()['data']['content'], '网关弹幕')


class FreshCollectorTests(unittest.IsolatedAsyncioTestCase):
    async def test_registration_creates_only_missing_local_profile(self):
        for existing in ([], [{'id':'existing'}]):
            calls = []
            def respond(request):
                calls.append((request.method, request.url.path))
                return httpx.Response(200, json={'accounts':existing} if request.method == 'GET' else {'ok':True})
            client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
            with patch('live_relay.dyhub_bridge.httpx.AsyncClient', return_value=client):
                await register_room('123', 'http://127.0.0.1:8857')
            self.assertEqual(('POST','/api/accounts') in calls, not bool(existing))
            self.assertEqual(calls[-1], ('POST','/api/rooms/connect'))


if __name__ == '__main__':
    unittest.main()
