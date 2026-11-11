import { LaserScene } from './photo-scene.js';
import { makeAvatar, hashText } from './art.js';
import { TOOL_TIMING, getToolPose } from './scan-path.js';
import { normalizeSpeed, advanceProductionTime } from './production-speed.js';

const TOTAL = TOOL_TIMING.total;
const clampTime = value => Math.max(0, Math.min(TOTAL, Number(value) || 0));
const isCloseup = (job, config) => Boolean(job && (config.closeup_mode === 'all' || (config.closeup_mode === 'gifts' && job.is_gift)));

async function loadPortrait(job) {
  if (!job.avatar_url) return { image: makeAvatar(job.nickname, hashText(job.user_id || job.nickname)), status: 'fallback', message: job.source === 'simulation' ? '测试事件使用示例头像' : '事件未提供头像，使用示例头像' };
  try {
    const url = new URL(job.avatar_url, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/avatar/')) throw new Error('unsupported avatar');
    const image = new Image();image.decoding = 'async';
    const loaded = new Promise((resolve, reject) => { image.onload = resolve;image.onerror = reject; });
    image.src = url.href;
    let timer;
    try { await Promise.race([loaded, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 9000); })]); }
    finally { clearTimeout(timer); }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('empty avatar');
    const canvas = document.createElement('canvas');canvas.width = canvas.height = 768;
    const ctx = canvas.getContext('2d');ctx.imageSmoothingQuality = 'high';
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.save();ctx.beginPath();ctx.arc(384, 384, 384, 0, Math.PI * 2);ctx.clip();
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 768, 768);ctx.restore();
    // Verify that the same-origin image remains readable for the score model.
    ctx.getImageData(0, 0, 1, 1);
    return { image: canvas, status: 'actual', message: '使用观众实际头像' };
  } catch {
    return { image: makeAvatar(job.nickname, hashText(job.user_id || job.nickname)), status: 'fallback', message: '真实头像加载失败，使用示例头像' };
  }
}

export async function startStudioClient(initialState) {
  const scene = new LaserScene(document.getElementById('scene'), { demoStock: false });
  let state = initialState, socket, connected = false, renderer = false, generation = 0;
  let current = null, loadingId = null, loadedPortrait = null, elapsed = 0, completeSent = false, committed = false;
  let lastFrame = performance.now(), lastReport = 0, retry = 0, reconnectTimer, trayBusy = false;
  let avatarStatus = 'loading', portraitMessage = '', commandsHydrated = false;
  const commandIds = new Set();
  scene.setCloseup(false);

  const controls = document.getElementById('openControls');
  controls.setAttribute('aria-label', '打开直播后台');controls.title = '打开直播后台';
  controls.addEventListener('click', () => window.open('/admin/', 'star-laser-admin', 'noopener'));
  const info = document.createElement('p');info.className = 'studio-connection';info.setAttribute('role', 'status');
  document.body.append(info);

  function send(message) {
    if (connected && socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(message));return true; }
    return false;
  }
  function diagnostics() {
    const physical = scene.diagnostics();
    return { ...physical, server: { connected, renderer, job_id: current?.id ?? null, user_id: current?.user_id ?? null, nickname: current?.nickname ?? null, is_gift: Boolean(current?.is_gift), closeup: scene.closeupEnabled, avatar_status: avatarStatus, portrait_message: portraitMessage, queue: state.queue.length, completed: state.counters?.completed ?? 0 } };
  }
  function report(now, force = false) {
    if (!renderer || !current || completeSent || (!force && now - lastReport < 450)) return;
    lastReport = now;
    send({ type: 'progress', job_id: current.id, elapsed, phase: loadingId ? 'loading-avatar' : getToolPose(elapsed).phase,
      collector_count: scene.collectorCount, tray_exchanging: scene.trayState().busy, avatar_status: avatarStatus, portrait_message: portraitMessage });
  }
  function resetLocal() {
    generation++;current = null;loadingId = null;loadedPortrait = null;elapsed = 0;completeSent = false;committed = false;
    scene.reset();scene.setCloseup(false);trayBusy = false;avatarStatus = 'loading';portraitMessage = '';
  }
  async function prepare(job, resumeTime) {
    const version = ++generation;loadingId = job.id;loadedPortrait = null;current = { ...job };elapsed = clampTime(resumeTime);completeSent = false;committed = false;
    avatarStatus = 'loading';portraitMessage = '正在读取观众头像';
    scene.setCloseup(isCloseup(current, state.config));report(performance.now(), true);
    const portrait = await loadPortrait(job);
    if (version !== generation || state.active?.id !== job.id) return;
    // A fresh renderer reconstructs the active piece at the server's last
    // acknowledged position; it does not create an extra queued print.
    loadedPortrait = portrait;installPortrait();
  }
  function installPortrait() {
    // Never clear a full or moving collector to make room for a new job.
    // It waits until the same physical tray has returned and docked.
    if (!loadedPortrait || !scene.canStart()) return;
    const portrait = loadedPortrait;loadedPortrait = null;
    if (!scene.prepare(portrait.image, { nickname: current.nickname })) return;
    avatarStatus = portrait.status;portraitMessage = portrait.message;
    scene.updateEngraving(elapsed);loadingId = null;lastFrame = performance.now();report(lastFrame, true);
  }
  function commitLocal() {
    if (committed || !scene.inventory.active) return;
    scene.updateEngraving(TOTAL);scene.complete();committed = true;
  }
  function updateJob() {
    const active = state.active;
    if (!active) {
      if (current && !loadingId) commitLocal();
      generation++;current = null;loadingId = null;loadedPortrait = null;completeSent = false;elapsed = 0;
      scene.setCloseup(false);return;
    }
    if (current?.id === active.id) {
      current = { ...current, ...active };scene.setCloseup(isCloseup(current, state.config));
      if (!renderer) elapsed = clampTime(state.runtime?.elapsed);
      return;
    }
    if (current && !loadingId) commitLocal();
    void prepare(active, state.runtime?.elapsed ?? 0);
  }
  function applySnapshot(message) {
    const wasRenderer = renderer;state = message.state;renderer = Boolean(message.is_renderer);
    if (!commandsHydrated) {
      for (const command of state.commands || []) commandIds.add(command.id);
      commandsHydrated = true;
    } else {
      for (const command of state.commands || []) {
        if (commandIds.has(command.id)) continue;
        commandIds.add(command.id);
        if (command.action === 'reset') resetLocal();
        if (command.action === 'tray_exchange' && renderer) scene.requestTrayExchange();
      }
    }
    if (commandIds.size > 100) { const recent = [...commandIds].slice(-30);commandIds.clear();recent.forEach(id => commandIds.add(id)); }
    if (!wasRenderer && renderer && current?.id === state.active?.id) elapsed = Math.max(elapsed, clampTime(state.runtime?.elapsed));
    updateJob();
    if (renderer && completeSent && current?.id === state.active?.id) sendCompletion();
    info.textContent = `${connected ? renderer ? '后台已连接 · 主显示端' : '后台已连接 · 只读镜像' : '后台连接中'} · ${state.relay?.status === 'connected' ? '抖音转发在线' : '抖音转发未连接'} · ${state.queue.length} 位等待`;
  }
  function sendCompletion() {
    if (!renderer || !current || loadingId) return;
    const tray = scene.trayState();
    send({ type: 'complete', job_id: current.id, assessment: scene.assessment, work_seconds: TOTAL / normalizeSpeed(state.config.speed), collector_count: scene.collectorCount, tray_exchanging: tray.busy });
  }
  function connect() {
    clearTimeout(reconnectTimer);
    const url = new URL('/ws/studio', location.href);url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';url.searchParams.set('role', 'display');
    socket = new WebSocket(url);
    socket.onopen = () => { connected = true;retry = 0; };
    socket.onmessage = event => {
      try { const message = JSON.parse(event.data);if (message.type === 'snapshot' && message.state?.config) applySnapshot(message); }
      catch (error) { console.warn('工作室消息无法读取', error.name); }
    };
    socket.onerror = () => { /* onclose owns reconnect and the visible state. */ };
    socket.onclose = () => {
      connected = false;renderer = false;scene.paused = true;
      info.textContent = '后台连接中断，画面已暂停，正在重连…';
      reconnectTimer = setTimeout(connect, Math.min(15000, 1000 * 2 ** Math.min(retry++, 4)));
    };
  }
  function animate(now) {
    const wallDelta = Math.max(0, (now - lastFrame) / 1000);lastFrame = now;
    const frozen = !connected || state.paused;
    scene.paused = Boolean(frozen);
    if (loadedPortrait) installPortrait();
    if (current && !loadingId && !completeSent) {
      if (renderer && !frozen) elapsed = Math.min(TOTAL, advanceProductionTime(elapsed, wallDelta, normalizeSpeed(state.config.speed)));
      scene.updateEngraving(elapsed);
      if (renderer && elapsed >= TOTAL) { commitLocal();completeSent = true;sendCompletion(); }
    }
    scene.update(Math.min(.067, wallDelta), now / 1000);
    const busy = scene.trayState().busy;
    if (renderer && busy !== trayBusy) send({ type: 'tray_status', busy, count: scene.collectorCount });
    trayBusy = busy;
    report(now);
    if (now - (animate.lastDiagnostic || 0) > 400) {
      const value = diagnostics();scene.canvas.dataset.diagnostics = JSON.stringify(value);
      scene.canvas.setAttribute('aria-label', current ? `${current.nickname} · ${current.is_gift ? '礼物' : '入场'}头像加工 · ${Math.floor(elapsed / TOTAL * 100)}%${scene.closeupEnabled ? ' · 特写开启' : ''}` : '1080乘1920激光雕刻工作站，等待直播观众');
      animate.lastDiagnostic = now;
    }
    requestAnimationFrame(animate);
  }
  // Diagnostic methods are retained for local integration tools. Events and
  // mutations are exclusively owned by the authenticated local service.
  window.LaserStudio = { state: () => ({ connected, renderer, processing: current?.nickname || null, queue: state.queue.length, completed: state.counters?.completed || 0, paused: state.paused, speed: state.config.speed }), diagnostics };
  window.addEventListener('pagehide', () => { clearTimeout(reconnectTimer);socket?.close(); });
  connect();requestAnimationFrame(animate);
}
