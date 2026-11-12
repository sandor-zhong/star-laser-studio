import { extractRoomInput } from './room-input.js';
import { formatChallengeScore, normalizeChallengeAssessment } from './challenge-score.js';
import { PRODUCTION_TIMING as T } from './production-cycle.js';

const $ = (id) => document.getElementById(id);
const form = $('config-form');
const fields = $('config-fields');
const formStatus = $('form-status');
const commandButtons = [...document.querySelectorAll('[data-command], #pause-button, #reset-button, #simulation-form button')];
const configNames = ['relay_enabled', 'relay_base', 'room_id', 'print_on_entry', 'entry_cooldown_seconds', 'gift_priority', 'gift_min_count', 'max_queue', 'speed', 'closeup_mode'];
const numberNames = new Set(['entry_cooldown_seconds', 'gift_min_count', 'max_queue', 'speed']);
const checkboxNames = new Set(['relay_enabled', 'print_on_entry', 'gift_priority']);
const phaseLabels = { idle:'等待观众', ready:'准备加工', 'loading-avatar':'正在读取头像', loading:'夹紧定位', load:'夹紧定位', feeding:'夹紧定位', pickup:'取料', clamping:'夹紧材料', scanning:'激光雕刻', engraving:'激光雕刻', printing:'激光雕刻', rating:'成品评分', scoring:'成品评分', unloading:'成品下料', unload:'成品下料', transferring:'搬运成品', conveying:'成品传送', collecting:'收料', complete:'本轮完成', completed:'本轮完成', tray_exchange:'更换收料盘', paused:'已暂停' };
Object.assign(phaseLabels, {
  'approach-source':'机械臂移至料仓', 'lower-source':'下降取料', 'grip-source':'吸附原料', 'lift-source':'提升原料',
  'transfer-to-fixture':'搬运原料', 'lower-to-fixture':'放入加工位', 'release-fixture':'释放原料',
  'retract-from-fixture':'机械臂抬升', 'park-for-print':'机械臂归位', clamp:'夹紧材料', 'head-load':'定位激光',
  scan:'雕刻与同步评分', 'head-retract':'激光头抬升', 'head-return':'激光头归位', 'show-finished':'成品展示 · 评分完成',
  unclamp:'松开材料', 'approach-fixture':'机械臂移至成品', 'lower-for-pickup':'下降取成品', 'grip-finished':'吸附成品',
  'lift-finished':'提升成品', 'transfer-to-belt':'搬运至传送带', 'lower-to-belt':'放下成品', 'release-belt':'释放成品',
  'retract-from-belt':'机械臂抬升', 'park-after-unload':'机械臂归位', 'belt-index':'皮带步进', 'chute-delivery':'连续送出', settle:'本轮完成',
});
const relayLabels = { disabled:'未启用', connecting:'正在连接', connected:'已连接', reconnecting:'正在重连', error:'连接异常' };
let latestState = null;
let savedConfig = null;
let dirty = false;
let saving = false;
let commandPending = false;
let hydrated = false;
let socket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let pollPending = false;
let syncSource = 'loading';
let lastRenderedLists = { queue:'', recent:'', logs:'' };
let lastActiveAvatar = '';
const recentScoreLabel = $('recent-title').closest('.panel-heading')?.querySelector('.small-label');
if (recentScoreLabel) recentScoreLabel.textContent = '随机作品分 · 0–100,000';

function feedback(id, message = '', error = false) {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle('error', error);
}

function notice(message = '', error = false) {
  const element = $('page-notice');
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('error', error);
}

function indicator(id, status) {
  $(id).className = `status-dot${status ? ` ${status}` : ''}`;
}

function syncStatus(source, message) {
  syncSource = source;
  $('sync-label').textContent = message;
  const dot = $('sync-status').querySelector('.status-dot');
  dot.className = `status-dot ${source === 'websocket' ? 'connected' : source === 'error' ? 'error' : 'connecting'}`;
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { cache:'no-store', ...options, headers:{ 'Content-Type':'application/json', ...options.headers }, signal:controller.signal });
    let body = null;
    try { body = await response.json(); } catch { /* A failed or empty response is handled below. */ }
    if (!response.ok) {
      const detail = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : typeof body?.detail === 'string' ? body.detail : `请求失败（${response.status}）`;
      throw new Error(detail);
    }
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求超时，请检查本地服务是否正在运行。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function setFormStatus() {
  formStatus.className = `form-status${dirty ? ' dirty' : hydrated ? ' saved' : ''}`;
  formStatus.textContent = saving ? '正在保存…' : dirty ? '有未保存的修改' : hydrated ? '已与服务同步' : '读取配置中';
  $('save-button').disabled = !hydrated || saving || !dirty;
  $('save-button').textContent = saving ? '保存中…' : '保存配置';
  $('discard-button').disabled = !hydrated || saving || !dirty;
  fields.disabled = !hydrated || saving;
  form.elements.namedItem('view_token').disabled = !hydrated || saving || form.elements.namedItem('clear_view_token').checked;
}

function hydrateForm(config, force = false) {
  if (!config || typeof config !== 'object') return;
  savedConfig = { ...config };
  if (config.relay_source) $('relay-source').textContent = `接入配置来源：${String(config.relay_source)}。开启接入前，请确认中继已连接到此直播间。`;
  $('token-status').textContent = config.has_view_token ? '已保存密钥' : '尚未设置';
  $('token-status').classList.toggle('warm', Boolean(config.has_view_token));
  if (dirty && !force) return;
  for (const name of configNames) {
    if (!(name in config)) continue;
    const input = form.elements.namedItem(name);
    if (checkboxNames.has(name)) input.checked = Boolean(config[name]);
    else input.value = String(config[name] ?? '');
  }
  form.elements.namedItem('view_token').value = '';
  form.elements.namedItem('clear_view_token').checked = false;
  hydrated = true;
  dirty = false;
  setFormStatus();
}

function formatTime(value, options = {}) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, ...options }).format(date);
}

function count(value) {
  return Number.isFinite(Number(value)) ? new Intl.NumberFormat('zh-CN').format(Number(value)) : '—';
}

function shortName(job) {
  return String(job?.nickname || '未命名观众');
}

function sourceText(job) {
  const event = job.is_gift || job.kind === 'gift' ? `${job.gift_name || '礼物'} × ${count(job.gift_count || 1)}` : job.kind === 'demo' ? '演示任务' : '观众入场';
  return `${job.source === 'simulation' ? '模拟 · ' : ''}${event}`;
}

function avatarImage(container, job) {
  container.replaceChildren();
  const fallback = () => { container.textContent = [...shortName(job)][0] || '✦'; };
  if (!job?.avatar_url) { fallback(); return; }
  let url;
  try { url = new URL(job.avatar_url, location.origin); } catch { fallback(); return; }
  // Avatars are served through the local proxy; never fetch a viewer-supplied URL directly.
  if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) { fallback(); return; }
  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => { if (container.contains(image)) fallback(); }, { once:true });
  image.src = url.href;
  container.append(image);
}

function emptyList(list, text) {
  const row = document.createElement('li');
  row.className = 'empty-state';
  row.textContent = text;
  list.replaceChildren(row);
}

function identity(job) {
  const div = document.createElement('div');
  div.className = 'job-identity';
  const name = document.createElement('strong');
  name.textContent = shortName(job);
  name.title = shortName(job);
  const description = document.createElement('p');
  description.textContent = sourceText(job);
  div.append(name, description);
  return div;
}

function renderQueue(queue = []) {
  const key = JSON.stringify(queue);
  if (key === lastRenderedLists.queue) return;
  lastRenderedLists.queue = key;
  const list = $('queue-list');
  if (!queue.length) { emptyList(list, '队列为空，等待观众入场或礼物事件。'); return; }
  const fragment = document.createDocumentFragment();
  queue.forEach((job, index) => {
    const row = document.createElement('li');
    row.className = 'job-row';
    const number = document.createElement('span');
    number.className = 'job-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatarImage(avatar, job);
    row.append(number, avatar, identity(job));
    if (job.is_gift || job.kind === 'gift') {
      const badge = document.createElement('span');
      badge.className = 'job-kind';
      badge.textContent = job.closeup ? '礼物 · 聚焦' : '礼物';
      row.append(badge);
    }
    const time = document.createElement('time');
    time.className = 'job-time';
    time.textContent = formatTime(job.created_at, { second:undefined });
    row.append(time);
    fragment.append(row);
  });
  list.replaceChildren(fragment);
}

function renderRecent(recent = []) {
  const key = JSON.stringify(recent);
  if (key === lastRenderedLists.recent) return;
  lastRenderedLists.recent = key;
  const list = $('recent-list');
  if (!recent.length) { emptyList(list, '完成的头像和随机作品分将显示在这里（0–100,000 分）。'); return; }
  const fragment = document.createDocumentFragment();
  recent.slice(0, 12).forEach((job) => {
    const row = document.createElement('li');
    row.className = 'recent-row';
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatarImage(avatar, job);
    const score = document.createElement('span');
    score.className = 'recent-score';
    const assessment = normalizeChallengeAssessment(job.assessment);
    score.textContent = assessment ? formatChallengeScore(assessment.score) : '—';
    score.title = '随机作品分 · 总分范围 0–100,000 分';
    score.setAttribute('aria-label', assessment ? `随机作品分 ${formatChallengeScore(assessment.score)} 分，总分范围 0 至 100,000 分` : '随机作品分尚未生成');
    const unit = document.createElement('small');
    unit.textContent = '分';
    score.append(unit);
    row.append(avatar, identity(job), score);
    fragment.append(row);
  });
  list.replaceChildren(fragment);
}

function renderLogs(logs = []) {
  const key = JSON.stringify(logs);
  if (key === lastRenderedLists.logs) return;
  lastRenderedLists.logs = key;
  const list = $('logs-list');
  if (!logs.length) { emptyList(list, '暂无运行日志。'); return; }
  const fragment = document.createDocumentFragment();
  logs.slice(-80).reverse().forEach((log) => {
    const row = document.createElement('li');
    const level = ['error', 'warning', 'warn'].includes(log.level) ? log.level === 'warn' ? 'warning' : log.level : '';
    row.className = `log-row ${level}`;
    const time = document.createElement('time');
    time.textContent = formatTime(log.time);
    const message = document.createElement('span');
    message.textContent = String(log.message || '');
    row.append(time, message);
    fragment.append(row);
  });
  list.replaceChildren(fragment);
}

function renderLiveEvents(events = []) {
  const key = JSON.stringify(events);
  if (lastRenderedLists.liveEvents === key) return;
  lastRenderedLists.liveEvents = key;
  const list = $('live-events-list');
  if (!events.length) { emptyList(list, '等待直播间推送真实互动…'); return; }
  const labels = {comment:'弹幕', member:'入场', gift:'礼物', like:'点赞', follow:'关注', share:'分享', social:'互动'};
  const fragment = document.createDocumentFragment();
  for (const event of events.slice(0, 100)) {
    const row = document.createElement('li'); row.className = 'live-event-row';
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatarImage(avatar,event);
    const name = document.createElement('strong'); name.textContent = event.nickname || '直播观众';
    const tag = document.createElement('span'); tag.className = 'job-kind'; tag.textContent = labels[event.type] || '互动';
    const message = document.createElement('span'); message.className = 'live-event-content';
    message.textContent = event.type === 'comment' ? event.content : event.type === 'gift' ? `${event.gift_name || '直播礼物'} ×${event.count}` : event.type === 'like' ? `点赞 ×${event.count}` : labels[event.type] || '互动';
    const time = document.createElement('time'); time.textContent = formatTime(event.received_at);
    row.append(avatar,name,tag,message,time); fragment.append(row);
  }
  list.replaceChildren(fragment);
}

function stageFromElapsed(elapsed) {
  if (!Number.isFinite(elapsed)) return '加工进行中';
  if (elapsed < T.scanStart) return '加工位定位';
  if (elapsed < T.scanEnd) return '雕刻与同步评分';
  if (elapsed < T.displayStart) return '激光头归位';
  if (elapsed < T.displayEnd) return '成品展示 · 评分完成';
  if (elapsed < T.beltRelease) return '快速抓取成品';
  if (elapsed < T.total) return '成品沿传送带送出';
  return '本轮完成';
}

function renderState(state) {
  if (!state || typeof state !== 'object') return;
  latestState = state;
  renderLiveEvents(Array.isArray(state.live_events) ? state.live_events : []);
  hydrateForm(state.config);
  const relay = state.relay || {};
  $('relay-status').textContent = relayLabels[relay.status] || '状态未知';
  $('relay-message').textContent = String(relay.message || (relay.status === 'disabled' ? '在工坊配置中启用直播事件接入' : '等待中继连接状态'));
  indicator('relay-indicator', relay.status === 'connected' ? 'connected' : relay.status === 'error' ? 'error' : ['connecting', 'reconnecting'].includes(relay.status) ? 'connecting' : '');
  const displayConnected = Boolean(state.display?.connected);
  $('display-status').textContent = displayConnected ? '画面已连接' : '等待显示端';
  $('display-message').textContent = displayConnected ? '固定竖屏 · 1080 × 1920' : '打开直播画面或将地址加入 OBS 浏览器来源';
  indicator('display-indicator', displayConnected ? 'connected' : 'warning');
  const queue = Array.isArray(state.queue) ? state.queue : [];
  $('queue-count').textContent = count(queue.length);
  $('queue-heading-count').textContent = count(queue.length);
  $('queue-capacity').textContent = `最多 ${count(state.config?.max_queue ?? savedConfig?.max_queue)} 人 · ${state.paused ? '加工已暂停' : '按顺序连续加工'}`;
  $('completed-count').textContent = count(state.counters?.completed ?? 0);
  const collector = state.runtime?.collector_count;
  $('tray-count').textContent = '连续传送至画面外 · 无收料盘';
  const job = state.active;
  const phase = state.runtime?.phase;
  const elapsed = Number(state.runtime?.elapsed);
  const activeProgress = Number(state.runtime?.progress);
  const progress = job ? Math.max(0, Math.min(100, Number.isFinite(activeProgress) && state.runtime.progress !== null ? (activeProgress <= 1 ? activeProgress * 100 : activeProgress) : Number.isFinite(elapsed) ? elapsed / T.total * 100 : 0)) : 0;
  $('active-name').textContent = job ? shortName(job) : state.runtime?.tray_exchanging ? '正在更换收料盘' : '等待下一位观众';
  $('active-description').textContent = job ? `${sourceText(job)}${job.closeup ? ' · 聚焦光效已启用' : ''}` : displayConnected ? '收到符合条件的直播事件后开始加工' : '请先打开直播画面';
  const avatarStatus = state.runtime?.avatar_status;
  const avatarStatusElement = $('active-avatar-status');
  avatarStatusElement.hidden = !job || !avatarStatus;
  avatarStatusElement.classList.toggle('warning', avatarStatus === 'fallback');
  avatarStatusElement.textContent = avatarStatus === 'fallback' ? '示例头像（真实头像未能读取）' : avatarStatus === 'loading' ? '正在读取观众头像…' : avatarStatus === 'actual' ? '使用观众真实头像' : '';
  avatarStatusElement.title = String(state.runtime?.portrait_message || '');
  const avatarKey = job ? `${job.id}|${job.avatar_url}|${job.nickname}` : '';
  if (avatarKey !== lastActiveAvatar || !$('active-avatar').childNodes.length) {
    lastActiveAvatar = avatarKey;
    if (job) avatarImage($('active-avatar'), job);
    else $('active-avatar').textContent = '✦';
  }
  const kind = $('active-kind');
  kind.hidden = !job;
  kind.textContent = job?.is_gift || job?.kind === 'gift' ? '送礼任务' : job?.kind === 'demo' ? '演示任务' : '入场任务';
  kind.classList.toggle('entry', !job?.is_gift && job?.kind !== 'gift');
  $('production-state').textContent = state.paused ? '已暂停' : state.runtime?.tray_exchanging ? '换盘中' : job ? '加工中' : '待机';
  $('production-state').classList.toggle('warm', Boolean(state.paused));
  $('active-phase').textContent = state.paused ? '加工已暂停' : job ? phaseLabels[phase] || stageFromElapsed(elapsed) : state.runtime?.tray_exchanging ? '换入空收料盘' : '等待加工任务';
  $('active-progress').textContent = job ? `${Math.round(progress)}%${Number.isFinite(elapsed) ? ` · ${Math.max(0, elapsed).toFixed(1)}s` : ''}` : '—';
  $('progress-fill').style.width = `${progress}%`;
  $('progress-track').setAttribute('aria-valuenow', String(Math.round(progress)));
  $('pause-button').textContent = state.paused ? '继续加工' : '暂停加工';
  for (const button of commandButtons) button.disabled = commandPending;
  $('events-count').textContent = count(state.counters?.events ?? 0);
  $('accepted-count').textContent = count(state.counters?.accepted ?? 0);
  $('skipped-count').textContent = count(state.counters?.skipped ?? 0);
  $('dropped-count').textContent = count(state.counters?.queue_dropped ?? 0);
  $('last-event').textContent = relay.last_event_at ? `最近事件 ${formatTime(relay.last_event_at)}` : '尚未收到直播事件';
  $('updated-at').textContent = `最后同步 ${formatTime(Date.now())}`;
  renderQueue(queue);
  renderRecent(Array.isArray(state.recent) ? state.recent : []);
  renderLogs(Array.isArray(state.logs) ? state.logs : []);
}

async function refreshState({ quiet = false } = {}) {
  if (pollPending) return;
  pollPending = true;
  try {
    const response = await api('/api/state');
    renderState(response?.state || response);
    if (socket?.readyState !== WebSocket.OPEN) syncStatus('polling', '实时连接重试中 · 已获取状态');
    if (!quiet) notice();
  } catch (error) {
    if (socket?.readyState !== WebSocket.OPEN) syncStatus('error', '控制台连接中断');
    if (!quiet || !latestState) notice(`无法读取工坊状态：${error.message} 请通过本地工坊服务打开此页面。`, true);
  } finally { pollPending = false; }
}

function connectSocket() {
  clearTimeout(reconnectTimer);
  const url = new URL('/ws/studio', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('role', 'admin');
  syncStatus('connecting', reconnectAttempt ? '正在恢复实时连接' : '正在连接控制台');
  try { socket = new WebSocket(url); } catch { scheduleReconnect(); return; }
  socket.addEventListener('open', () => { reconnectAttempt = 0; syncStatus('websocket', '控制台实时同步'); notice(); });
  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'snapshot' && message.state) renderState(message.state);
      else if (message.type === 'error') notice(String(message.message || message.error || '实时服务报告异常'), true);
    } catch { /* Ignore unsupported frames without affecting the last valid snapshot. */ }
  });
  socket.addEventListener('error', () => { syncStatus('error', '实时连接异常 · 正在重试'); });
  socket.addEventListener('close', () => { scheduleReconnect(); void refreshState({ quiet:true }); });
}

function scheduleReconnect() {
  syncStatus('polling', '实时连接已断开 · 自动重连中');
  clearTimeout(reconnectTimer);
  const delay = Math.min(15000, 1000 * 2 ** Math.min(reconnectAttempt++, 4));
  reconnectTimer = setTimeout(connectSocket, delay);
}

form.addEventListener('input', () => { dirty = true; feedback('config-feedback'); setFormStatus(); });
form.addEventListener('change', () => {
  dirty = true;
  if (form.elements.namedItem('clear_view_token').checked) form.elements.namedItem('view_token').value = '';
  feedback('config-feedback');
  setFormStatus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving || !hydrated || !form.reportValidity()) return;
  const payload = {};
  for (const name of configNames) {
    const input = form.elements.namedItem(name);
    payload[name] = checkboxNames.has(name) ? input.checked : numberNames.has(name) ? Number(input.value) : input.value.trim();
  }
  payload.room_id = extractRoomInput(payload.room_id);
  payload.view_token = form.elements.namedItem('view_token').value.trim();
  payload.clear_view_token = form.elements.namedItem('clear_view_token').checked;
  saving = true;
  setFormStatus();
  feedback('config-feedback', '正在保存配置…');
  try {
    const response = await api('/api/config', { method:'PUT', body:JSON.stringify(payload) });
    // Do not keep the submitted secret in form state after a successful save.
    form.elements.namedItem('view_token').value = '';
    form.elements.namedItem('clear_view_token').checked = false;
    dirty = false;
    const returnedConfig = response?.config || response?.state?.config || (response && 'relay_base' in response ? response : null);
    if (response?.state) renderState(response.state);
    else if (returnedConfig) hydrateForm(returnedConfig, true);
    else hydrateForm(await api('/api/config'), true);
    feedback('config-feedback', '配置已保存。中继连接状态会在上方实时更新。');
    void refreshState({ quiet:true });
  } catch (error) {
    feedback('config-feedback', `保存失败：${error.message}`, true);
  } finally { saving = false; setFormStatus(); }
});

$('discard-button').addEventListener('click', () => { hydrateForm(savedConfig, true); feedback('config-feedback', '已还原服务端保存的配置。'); });

async function sendCommand(action, extra = {}, feedbackId = 'command-feedback') {
  if (commandPending || !latestState) return;
  commandPending = true;
  for (const button of commandButtons) button.disabled = true;
  feedback(feedbackId, '正在执行…');
  try {
    const response = await api('/api/command', { method:'POST', body:JSON.stringify({ action, ...extra }) });
    if (response?.state || response?.config) renderState(response.state || response);
    const messages = { pause:'工坊已暂停。', resume:'工坊已继续加工。', clear_queue:'等待队列已清空，当前加工继续完成。', tray_exchange:'已提交换盘请求，工坊会在合适的阶段执行。', reconnect:'已请求重新连接中继。', reset:'工坊已重置。', simulate_entry:'已发送模拟入场事件，请查看队列和直播画面。', simulate_gift:'已发送模拟礼物事件，请查看任务优先级和聚焦光效。' };
    feedback(feedbackId, messages[action] || '操作完成。');
    void refreshState({ quiet:true });
  } catch (error) { feedback(feedbackId, `操作失败：${error.message}`, true); }
  finally { commandPending = false; for (const button of commandButtons) button.disabled = !latestState; }
}

document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => { void sendCommand(button.dataset.command); }));
$('pause-button').addEventListener('click', () => { void sendCommand(latestState?.paused ? 'resume' : 'pause'); });
$('reset-button').addEventListener('click', () => { $('reset-confirmation').hidden = false; $('cancel-reset').focus(); });
$('cancel-reset').addEventListener('click', () => { $('reset-confirmation').hidden = true; $('reset-button').focus(); });
$('confirm-reset').addEventListener('click', () => { $('reset-confirmation').hidden = true; void sendCommand('reset'); });
$('simulation-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const action = event.submitter?.value;
  if (!['simulate_entry', 'simulate_gift'].includes(action)) return;
  const nickname = $('simulation-nickname').value.trim() || '测试观众';
  void sendCommand(action, { nickname }, 'simulation-feedback');
});

const obsUrl = new URL('/?live=1', location.origin).href;
$('obs-url').textContent = obsUrl;
$('copy-fallback').value = obsUrl;
$('copy-obs').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(obsUrl);
    $('copy-obs').textContent = '已复制';
    setTimeout(() => { $('copy-obs').textContent = '复制地址'; }, 1800);
  } catch {
    $('copy-fallback').hidden = false;
    $('copy-fallback').focus();
    $('copy-fallback').select();
    feedback('command-feedback', '地址已选中，请按 Ctrl+C 复制。');
  }
});

window.addEventListener('online', () => { if (socket?.readyState !== WebSocket.OPEN && socket?.readyState !== WebSocket.CONNECTING) connectSocket(); void refreshState({ quiet:true }); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshState({ quiet:true }); });
setInterval(() => { if (socket?.readyState !== WebSocket.OPEN && !document.hidden) void refreshState({ quiet:true }); }, 5000);

async function initialize() {
  connectSocket();
  const results = await Promise.allSettled([api('/api/state'), api('/api/config')]);
  if (results[0].status === 'fulfilled') renderState(results[0].value?.state || results[0].value);
  if (results[1].status === 'fulfilled') hydrateForm(results[1].value?.config || results[1].value);
  if (results.every((result) => result.status === 'rejected')) {
    notice('未能连接本地工坊服务。请先启动服务，再从服务提供的后台地址打开此页面。', true);
    if (syncSource !== 'websocket') syncStatus('error', '控制台连接失败 · 自动重试中');
  } else if (results[1].status === 'rejected' && !hydrated) {
    feedback('config-feedback', `无法读取配置：${results[1].reason.message}`, true);
  }
}

void initialize();
