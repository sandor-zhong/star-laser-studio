"""Run the complete local pipeline using only this project's source and environment."""
from __future__ import annotations

import argparse
import contextlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
from urllib.parse import urlsplit

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent
LOCAL = ROOT / '.local'
ENV_FILE = LOCAL / 'live.env'
DYHUB = ROOT / 'vendor' / 'dyhub'


def room_number(value):
    text = str(value or '').strip()
    if re.fullmatch(r'[0-9]+', text):
        return text
    parts = urlsplit(text)
    pattern = r'/([0-9]+)/?' if parts.hostname == 'live.douyin.com' else r'/root/live/([0-9]+)/?'
    match = re.fullmatch(pattern, parts.path)
    if parts.scheme in {'http', 'https'} and parts.hostname in {'live.douyin.com', 'www.douyin.com', 'douyin.com'} and match:
        return match[1]
    raise ValueError('请提供数字房间号或完整抖音直播间网址，不支持短分享链接。')


def initialize(room=''):
    LOCAL.mkdir(exist_ok=True)
    if not ENV_FILE.exists():
        values = {'ROOM_ID': room_number(room) if room else '',
                  'INGEST_TOKEN': secrets.token_urlsafe(32), 'VIEW_TOKEN': secrets.token_urlsafe(32),
                  'DYHUB_COOKIE': ''}
        ENV_FILE.write_text('\n'.join(f'{k}={v}' for k, v in values.items()) + '\n', encoding='utf-8')
        with contextlib.suppress(OSError):
            ENV_FILE.chmod(0o600)
    return dict(dotenv_values(ENV_FILE, interpolate=False))


def prepare_config(values, room, relay_port, config_path=None):
    """Keep print settings, but explicitly align the room and both gateway credentials."""
    path = Path(config_path or LOCAL / 'studio-config.json')
    from studio_runtime import DEFAULT_CONFIG, validate_config
    config = dict(DEFAULT_CONFIG)
    if path.exists():
        saved = json.loads(path.read_text(encoding='utf-8-sig'))
        if not isinstance(saved, dict):
            raise ValueError('工作室配置应为 JSON 对象')
        config.update(validate_config(config, saved))
    config.update(relay_enabled=True, room_id=room,
                  relay_base=f'ws://127.0.0.1:{relay_port}', view_token=values['VIEW_TOKEN'])
    pending = path.with_suffix('.tmp')
    pending.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    with contextlib.suppress(OSError):
        pending.chmod(0o600)
    pending.replace(path)
    return config


def port_free(port):
    with socket.socket() as listener:
        try:
            listener.bind(('127.0.0.1', port))
            return True
        except OSError:
            return False


def runtime_dir(args):
    result = Path(args.state_dir).resolve() if args.state_dir else LOCAL
    if not result.is_relative_to(ROOT):
        raise ValueError('运行数据目录必须位于本项目内。')
    return result


def request_stop(args):
    directory = runtime_dir(args)
    try:
        running = json.loads((directory / 'live-run.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise ValueError('该数据目录没有本启动器管理的运行记录。') from None
    (directory / 'stop-request').write_text(running['run_id'], encoding='ascii')
    print('已请求关闭这次启动的服务；原启动终端将显示完成。')


def diagnose(args):
    result = {'services': {}, 'room': None, 'recent_event_count': 0}
    with httpx.Client(timeout=3, trust_env=False) as client:
        for name, port, endpoint in [('studio', args.studio_port, '/api/state'),
                                     ('relay', args.relay_port, '/health'),
                                     ('collector', args.collector_port, '/api/rooms')]:
            try:
                response = client.get(f'http://127.0.0.1:{port}{endpoint}')
                response.raise_for_status()
                value = response.json()
                info = {'available': True, 'port': port}
                if name == 'studio':
                    result.update(room=value['config']['room_id'], recent_event_count=len(value.get('live_events', [])))
                    info.update(relay_status=value['relay']['status'], counters=value['counters'],
                                display_connected=value['display']['connected'],
                                last_event_at=value['relay']['last_event_at'])
                elif name == 'collector':
                    info['rooms'] = [{k: r.get(k) for k in ('roomId', 'status', 'messageCount', 'error')}
                                     for r in value.get('rooms', [])]
                else:
                    info['configured'] = value.get('configured', False)
                result['services'][name] = info
            except (httpx.HTTPError, ValueError, KeyError) as error:
                result['services'][name] = {'available': False, 'port': port, 'error': type(error).__name__}
    result['note'] = '服务已连接不等于已收到真实互动；请检查后台近期直播事件和采集房间状态。'
    return result


def run(args):
    ports = [args.studio_port, args.relay_port, args.collector_port]
    if len(set(ports)) != 3:
        raise ValueError('三个服务需要使用不同端口。')
    for port in ports:
        if not port_free(port):
            raise ValueError(f'端口 {port} 已被占用。请先关闭旧服务，或指定另一组端口；不会自动结束其他进程。')
    node = shutil.which('node')
    if not node or not (DYHUB / 'dist/index.js').is_file() or not (DYHUB / 'node_modules').is_dir():
        raise ValueError('请先运行 setup.ps1，安装依赖并构建采集器。')
    values = initialize()
    room = room_number(args.room or values.get('ROOM_ID'))
    for key in ('VIEW_TOKEN', 'INGEST_TOKEN'):
        if not values.get(key):
            raise ValueError(f'.local/live.env 缺少 {key}。')
    state_dir = runtime_dir(args)
    state_dir.mkdir(parents=True, exist_ok=True)
    config_path = state_dir / 'studio-config.json'
    prepare_config(values, room, args.relay_port, config_path)
    env = {**os.environ, **{k: v for k, v in values.items() if v is not None}}
    env.pop('STUDIO_RELAY_PROJECT', None)
    env.update(ROOM_ID=room, RELAY_WS_BASE=f'ws://127.0.0.1:{args.relay_port}',
               DYHUB_API=f'http://127.0.0.1:{args.collector_port}',
               DYHUB_WS=f'ws://127.0.0.1:{args.collector_port}/ws',
               DYHUB_COLLECTOR='lightweight', DYHUB_HOST='127.0.0.1', DYHUB_PORT=str(args.collector_port),
               PYTHONUTF8='1', PYTHONIOENCODING='utf-8:backslashreplace')
    logs = state_dir / 'logs'
    logs.mkdir(exist_ok=True)
    run_id = secrets.token_hex(16)
    manifest = state_dir / 'live-run.json'
    stop_request = state_dir / 'stop-request'
    manifest.write_text(json.dumps({'run_id':run_id, 'pid':os.getpid(), 'ports':ports}), encoding='utf-8')
    processes, handles = [], []
    def start(name, command, cwd=ROOT):
        handle = (logs / f'{name}.log').open('ab', buffering=0)
        handles.append(handle)
        process = subprocess.Popen(command, cwd=cwd, env=env, stdout=handle, stderr=handle,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        processes.append((name, process))
        return process
    def wait_http(process, port, path):
        deadline = time.monotonic() + 30
        with httpx.Client(timeout=1, trust_env=False) as client:
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError('服务提前退出，请查看 .local/logs。')
                try:
                    if client.get(f'http://127.0.0.1:{port}{path}').is_success:
                        return
                except httpx.HTTPError:
                    pass
                time.sleep(.2)
        raise RuntimeError(f'端口 {port} 启动超时，请查看 .local/logs。')
    try:
        gateway = start('relay', [sys.executable, '-X', 'utf8', '-B', '-m', 'uvicorn',
                        'live_relay.cloud_server:app', '--host', '127.0.0.1', '--port', str(args.relay_port), '--no-access-log'])
        wait_http(gateway, args.relay_port, '/health')
        collector = start('collector', [node, str(DYHUB / 'dist/index.js')], DYHUB)
        wait_http(collector, args.collector_port, '/api/rooms')
        studio = start('studio', [sys.executable, '-X', 'utf8', '-B', 'studio_server.py', '--port', str(args.studio_port), '--config-path', str(config_path)])
        wait_http(studio, args.studio_port, '/api/state')
        start('bridge', [sys.executable, '-X', 'utf8', '-B', '-m', 'live_relay.dyhub_bridge', '--room', room])
        print(f'后台：http://127.0.0.1:{args.studio_port}/admin/', flush=True)
        print(f'直播：http://127.0.0.1:{args.studio_port}/?live=1', flush=True)
        print(f'房间 {room}：采集连接已发起。请在后台确认真实事件。Ctrl+C 关闭本次四个服务。', flush=True)
        while True:
            if stop_request.exists() and stop_request.read_text(encoding='ascii') == run_id:
                print('正在关闭本次启动的服务…', flush=True)
                break
            for name, process in processes:
                if process.poll() is not None:
                    raise RuntimeError(f'{name} 已退出，请查看 .local/logs/{name}.log。')
            time.sleep(.5)
    finally:
        for _, process in reversed(processes):
            if process.poll() is None:
                if os.name == 'nt':
                    # Windows venv python.exe is a redirector with a child
                    # interpreter. Stop the whole tree owned by this Popen.
                    subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
                else:
                    process.terminate()
        for _, process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        for handle in handles:
            handle.close()
        with contextlib.suppress(OSError):
            manifest.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['init', 'run', 'check', 'stop'])
    parser.add_argument('--room', default='')
    parser.add_argument('--state-dir', default='', help='Optional separate run state under the project')
    for name, default in [('studio', 8082), ('relay', 8002), ('collector', 8757)]:
        parser.add_argument(f'--{name}-port', type=int, default=default)
    args = parser.parse_args()
    if any(not 1 <= getattr(args, f'{name}_port') <= 65535 for name in ('studio', 'relay', 'collector')):
        parser.error('端口必须在 1–65535 范围内。')
    try:
        if args.action == 'init':
            initialize(args.room)
            print('本地配置已就绪：.local/live.env；未覆盖已有配置。')
        elif args.action == 'check':
            print(json.dumps(diagnose(args), ensure_ascii=False, indent=2))
        elif args.action == 'stop':
            request_stop(args)
        else:
            run(args)
    except KeyboardInterrupt:
        print('本次启动的服务已停止。')
    except (ValueError, RuntimeError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
