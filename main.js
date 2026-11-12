import { LaserScene } from "./photo-scene.js";
import { PRODUCTION_TIMING as TOOL_TIMING, getProductionClockPose as getToolPose } from "./production-cycle.js";
import { DEMO_NAMES, hashText, makeAvatar, portraitDataUrl } from "./art.js";
import { DEFAULT_SPEED, normalizeSpeed, cycleDuration, advanceProductionTime } from "./production-speed.js";

const $ = (id) => document.getElementById(id);
const liveMode = new URLSearchParams(window.location.search).has("live");
if (liveMode) document.body.classList.add("live-mode");
const syncChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("starlight-v01")
    : null;
const TYPE = {
  comment: { label: "评论入场", icon: "💬", points: 10 },
  like: { label: "点亮小心心", icon: "🩷", points: 5 },
  rose: { label: "玫瑰礼物", icon: "🌹", points: 30 },
  crown: { label: "皇冠礼物", icon: "👑", points: 100 },
};
const TOTAL_SECONDS = TOOL_TIMING.total;
const SPEED_STORAGE_KEY = "starlight-production-speed";
function storedSpeed() {
  try { return normalizeSpeed(localStorage.getItem(SPEED_STORAGE_KEY)); }
  catch { return DEFAULT_SPEED; }
}
let speed = storedSpeed();
const MAX_QUEUE = 120;
const queue = [];
const seen = new Set();
const ranks = new Map();
const completed = [];
let received = 0;
let done = 0;
let current = null,
  elapsed = 0,
  paused = false,
  lastFrame = performance.now(),
  lastUi = 0,
  autoTimer = null,
  sequence = 0;
let scene;
let trayWasBusy=false,observedExchanges=0;

try {
  scene = new LaserScene($("scene"));
} catch (err) {
  console.error("Workshop unavailable:", err);
  $("scene").innerHTML =
    '<div style="position:absolute;top:35%;left:15%;right:15%;color:#b3e9f3;text-align:center;padding:24px;background:#081a2fcf;border:1px solid #60a2a5;border-radius:12px">场景载入失败，请刷新重试。</div>';
}

function randomName() {
  return DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
}
function makeEvent(type, name) {
  const nickname = (name || $("nickname").value.trim() || randomName()).slice(
    0,
    12,
  );
  return {
    id: `demo-${Date.now()}-${++sequence}`,
    type,
    nickname,
    seed: hashText(nickname),
    points: TYPE[type].points,
  };
}
function enqueue(raw, remote = false) {
  if (!raw || !TYPE[raw.type]) return false;
  const id = String(raw.id ?? `manual-${Date.now()}-${++sequence}`);
  if (seen.has(id)) {
    log(`跳过重复事件 ${id}`);
    return false;
  }
  if (queue.length >= MAX_QUEUE) {
    log(`队列已满：最多等待 ${MAX_QUEUE} 人`);
    return false;
  }
  seen.add(id);
  const nickname = String(raw.nickname || randomName()).slice(0, 12);
  const entry = {
    id,
    type: raw.type,
    nickname,
    seed: Number.isInteger(raw.seed) ? raw.seed : hashText(nickname),
    points: TYPE[raw.type].points,
  };
  queue.push(entry);
  received++;
  log(
    `${TYPE[entry.type].icon} ${nickname} · ${TYPE[entry.type].label}`,
    entry.type === "rose" || entry.type === "crown",
  );
  $("tickerText").textContent =
    `${TYPE[entry.type].icon} ${nickname} 加入了星光雕刻队列`;
  updateCounters();
  if (!remote) syncChannel?.postMessage({ kind: "event", entry });
  return true;
}
function log(message, gift = false) {
  const line = document.createElement("div");
  line.className = `log-line${gift ? " gift" : ""}`;
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  line.append(time, document.createTextNode(message));
  $("eventLog").prepend(line);
  while ($("eventLog").children.length > 60)
    $("eventLog").lastElementChild.remove();
}
function startNext() {
  if (!scene || queue.length === 0 || current || !scene.canStart()) return;
  current = queue.shift();
  current.workSeconds = 0;
  elapsed = 0;
  const avatar = makeAvatar(current.nickname, current.seed);
  current.avatar = avatar.toDataURL("image/png");
  scene.prepare(avatar,{nickname:current.nickname});
  current.assessment=scene.assessment;
  $("activeAvatar").src = current.avatar;
  $("activeName").textContent = current.nickname;
  $("jobState").textContent = "LOADING · 圆盘入位";
  $("percent").textContent = "0%";
  $("progressFill").style.width = "0%";
  updateCounters();
}
function finishJob() {
  if (!current) return;
  scene.complete();
  completed.unshift(current);
  done++;
  if (completed.length > 36) completed.length = 36;
  const old = ranks.get(current.nickname) || {
    score: 0,
    seed: current.seed,
    finished: 0,
  };
  old.score += current.points;
  old.finished++;
  ranks.set(current.nickname, old);
  log(`✦ ${current.nickname} 的作品完成 · 随机作品分 ${current.assessment.score}（${current.workSeconds.toFixed(1)} 秒）`);
  $("tickerText").textContent =
    `✧ 恭喜「${current.nickname}」领取第 ${done} 枚星光勋章`;
  current = null;
  paintRecent();
  paintRanks();
  updateCounters();
}
function updateCounters() {
  $("queueCount").textContent = queue.length.toString();
  $("panelQueue").textContent = queue.length.toString();
  $("panelDone").textContent = done.toString();
  $("panelTotal").textContent = received.toString();
  $("finishedCount").textContent = String(done).padStart(4, "0");
  $("collectorCount").textContent = `已送出 ${scene?.exchangedCount ?? 0} 件`;
  $("clearCollector").hidden=true;
}
function paintRecent() {
  const container = $("recentList");
  container.replaceChildren();
  for (const record of completed.slice(0, 6)) {
    const card = document.createElement("div");
    card.className = "medal-card";
    const medal = document.createElement("div");
    medal.className = "medal-image";
    const img = document.createElement("img");
    img.alt = `${record.nickname} 的彩色头像勋章`;
    img.src = record.avatar;
    medal.append(img);
    const label = document.createElement("div");
    label.className = "medal-name";
    label.textContent = record.nickname;
    card.append(medal, label);
    container.append(card);
  }
  if (!completed.length) {
    const empty = document.createElement("div");
    empty.className = "empty-belt";
    empty.textContent = "第一枚专属于你的星光勋章，即将诞生 ✨";
    container.append(empty);
  }
}
function paintRanks() {
  const sorted = [...ranks.entries()]
    .sort(
      (a, b) =>
        b[1].score - a[1].score ||
        b[1].finished - a[1].finished ||
        a[0].localeCompare(b[0], "zh-CN"),
    )
    .slice(0, 10);
  const board = $("leaderboard");
  board.replaceChildren();
  for (let i = 0; i < 10; i++) {
    const div = document.createElement("div");
    div.className = `rank-row${sorted[i] ? "" : " rank-empty"}`;
    const rank = document.createElement("span");
    rank.className = `rank${i < 3 ? " top" : ""}`;
    rank.textContent = String(i + 1).padStart(2, "0");
    const img = document.createElement("img");
    img.className = "rank-icon";
    img.alt = "";
    img.src = sorted[i]
      ? portraitDataUrl(sorted[i][0], sorted[i][1].seed)
      : portraitDataUrl(`guest-${i}`, hashText(`guest-${i}`));
    const name = document.createElement("span");
    name.className = "rank-text";
    name.textContent = sorted[i]?.[0] || "等待入场";
    const score = document.createElement("span");
    score.className = "rank-score";
    score.textContent = sorted[i] ? String(sorted[i][1].score) : "--";
    div.append(rank, img, name, score);
    board.append(div);
  }
}
function updateProgress() {
  const value = Math.max(
    0,
    Math.min(100, Math.floor((elapsed / TOTAL_SECONDS) * 100)),
  );
  $("percent").textContent = `${value}%`;
  $("progressFill").style.width = `${value}%`;
  const phase = getToolPose(elapsed).phase;
  const labels = {
    'approach-source':'取料臂接近料仓','lower-source':'吸盘下降',
    'grip-source':'吸附毛坯','lift-source':'提起毛坯',
    'transfer-to-fixture':'移向夹具','lower-to-fixture':'毛坯落入定位座',
    'release-fixture':'释放毛坯','retract-from-fixture':'吸盘退回',
    'park-for-print':'取料臂避让','clamp':'定位座真空吸附',
    'head-load':'雕刻头定位','scan':'逐行雕刻',
    'head-retract':'关光抬头','head-return':'雕刻头归位','show-finished':'随机积分揭晓',
    'unclamp':'定位座解除吸附','approach-fixture':'取料臂接近成品',
    'lower-for-pickup':'吸盘下降','grip-finished':'吸附成品',
    'lift-finished':'提起成品','transfer-to-belt':'移向传送带',
    'lower-to-belt':'成品落到皮带','release-belt':'释放成品',
    'retract-from-belt':'吸盘抬起','park-after-unload':'取料臂归位',
    'belt-index':'皮带向画面底部步进','chute-delivery':'成品沿皮带送出屏幕',
    'settle':'成品送出完成',
  };
  $("jobState").textContent = labels[phase] || phase;
}
function animate(now) {
  // Cap a resumed/slow frame so the visible mechanism never skips an operation.
  const wallDelta = Math.max(0, (now - lastFrame) / 1000);
  const delta = Math.min(0.067, wallDelta);
  lastFrame = now;
  if (!paused && scene) {
    if (!current) startNext();
    if (current) {
      const nextElapsed = Math.min(TOTAL_SECONDS, advanceProductionTime(elapsed, wallDelta, speed));
      current.workSeconds += (nextElapsed - elapsed) / speed;
      elapsed = nextElapsed;
      scene.updateEngraving(elapsed);
      if (now - lastUi > 45) {
        updateProgress();
        lastUi = now;
      }
      if (elapsed >= TOTAL_SECONDS) {
        finishJob();
        startNext();
      }
    } else if (now - lastUi > 450) {
      const full = !scene.canStart(),tray=scene.trayState();
      $("activeName").textContent = tray.busy?"收料盘更换中":full ? "收料盘已满" : "等待下一位星光旅人";
      const trayLabels={withdraw:'满盘沿导轨退出',handoff:'屏外更换空收料盘',return:'空盘沿导轨返回',dock:'空盘归位确认'};
      $("jobState").textContent = tray.busy?trayLabels[tray.phase]:full ? "等待换盘完成" : "STANDBY · 待机";
      $("percent").textContent = "0%";
      $("progressFill").style.width = "0%";
      lastUi = now;
    }
  }
  if (scene) {
    scene.update(delta, now / 1000);
    const tray=scene.trayState();
    if(tray.busy!==trayWasBusy||tray.exchanges!==observedExchanges){
      if(tray.busy&&!trayWasBusy)log(`收料盘开始更换 · ${scene.collectorCount} 枚成品随盘退出`);
      if(tray.exchanges>observedExchanges)log('空收料盘已归位，继续加工');
      trayWasBusy=tray.busy;observedExchanges=tray.exchanges;updateCounters();
    } else if(tray.busy&&now-lastUi<50)updateCounters();
  }
  requestAnimationFrame(animate);
}
function reset(remote = false) {
  queue.length = 0;
  seen.clear();
  ranks.clear();
  completed.length = 0;
  received = 0;
  done = 0;
  current = null;
  elapsed = 0;
  sequence = 0;
  scene?.reset();
  trayWasBusy=false;observedExchanges=0;
  $("activeName").textContent = "等待下一位星光旅人";
  $("activeAvatar").removeAttribute("src");
  $("jobState").textContent = "STANDBY · 待机";
  $("percent").textContent = "0%";
  $("progressFill").style.width = "0%";
  $("tickerText").textContent = "已重置。发送任意模拟礼物或评论，开始雕刻。";
  $("eventLog").replaceChildren();
  paintRecent();
  paintRanks();
  updateCounters();
  log("演示已重置");
  if (!remote) syncChannel?.postMessage({ kind: "reset" });
}
function setPaused(value) {
  paused = value;
  if (scene) scene.paused = value;
  $("pauseButton").textContent = paused ? "▶ 继续" : "Ⅱ 暂停";
  $("pauseButton").style.background = paused ? "#e6ba71" : "#bdcd98";
  log(paused ? "动画已暂停" : "动画已继续");
}
function updateSpeedControls() {
  $("productionSpeed").value = String(speed);
  $("cycleDuration").textContent = `完整加工流程约 ${cycleDuration(TOTAL_SECONDS, speed).toFixed(1)} 秒 / 件`;
  $("autoInterval").textContent = `约每 ${(cycleDuration(TOTAL_SECONDS, speed) + .5).toFixed(1)} 秒进入 1 位，最多保留 2 位等待`;
}
function restartAutoTimer() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
  if (!$("autoSwitch").checked) return;
  autoTimer = setInterval(() => {
    if (!paused && scene && queue.length < 2) {
      enqueue(makeEvent("comment", randomName()));
    }
  }, (cycleDuration(TOTAL_SECONDS, speed) + .5) * 1000);
}
function setSpeed(value, { broadcast = true } = {}) {
  const next = normalizeSpeed(value), changed = next !== speed;
  speed = next;
  try { localStorage.setItem(SPEED_STORAGE_KEY, String(speed)); } catch {}
  updateSpeedControls();
  restartAutoTimer();
  if (changed) log(`加工速度 ${speed}× · 约 ${cycleDuration(TOTAL_SECONDS, speed).toFixed(1)} 秒 / 件`);
  if (broadcast) syncChannel?.postMessage({ kind: "speed", speed });
  return speed;
}
function batch(n) {
  for (let i = 0; i < n; i++) {
    const type =
      i % 8 === 0
        ? "crown"
        : i % 4 === 0
          ? "rose"
          : i % 3 === 0
            ? "like"
            : "comment";
    enqueue(makeEvent(type, randomName()));
  }
}

document
  .querySelectorAll("[data-event]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      enqueue(makeEvent(button.dataset.event)),
    ),
  );
$("randomName").addEventListener("click", () => {
  $("nickname").value = randomName();
});
$("batch10").addEventListener("click", () => batch(10));
$("batch30").addEventListener("click", () => batch(30));
$("pauseButton").addEventListener("click", () => setPaused(!paused));
$("productionSpeed").addEventListener("change", e => setSpeed(e.target.value));
function requestTrayExchange(remote=false){
  const result=scene?.requestTrayExchange()??{status:'empty'};
  updateCounters();
  if(result.status==='queued')log('已安排换盘，当前作品落料完成后执行');
  if(result.status==='empty')log('收料盘为空，无需更换');
  if(!remote&&['queued','started'].includes(result.status))syncChannel?.postMessage({kind:'tray-exchange'});
  return result;
}
$("clearCollector").addEventListener("click",()=>requestTrayExchange());
$("resetButton").addEventListener("click", () => {
  if (confirm("清空所有模拟队列、排行榜和作品，重新开始吗？")) reset();
});
if (syncChannel)
  syncChannel.onmessage = (e) => {
    if (e.data?.kind === "event") enqueue(e.data.entry, true);
    if (e.data?.kind === "reset") reset(true);
    if (e.data?.kind === "speed") setSpeed(e.data.speed, { broadcast: false });
    if (e.data?.kind === "tray-exchange") requestTrayExchange(true);
  };
$("autoSwitch").addEventListener("change", (e) => {
  restartAutoTimer();
  log(e.target.checked ? "自动观众已开启" : "自动观众已关闭");
});
$("nickname").addEventListener("keydown", (e) => {
  if (e.key === "Enter") enqueue(makeEvent("comment"));
});
setInterval(
  () =>
    ($("clock").textContent = new Date().toLocaleTimeString("zh-CN", {
      hour12: false,
    })),
  1000,
);

// Adapter seam: later connect an APPROVED official event source to this method.
// Example in browser console: window.LaserStudio.enqueue({id:'evt-1',type:'rose',nickname:'测试观众'});
window.LaserStudio = {
  enqueue,
  state: () => ({
    queue: queue.length,
    processing: current?.nickname || null,
    completed: done,
    received,
    paused,
    speed,
    cycleSeconds: cycleDuration(TOTAL_SECONDS, speed),
    lastScore: completed[0]?.assessment?.score ?? null,
    collectorCount: scene?.collectorCount ?? 0,
    collectorCapacity: scene?.collectorCapacity ?? 24,
    trayExchanging: scene?.trayState().busy ?? false,
    exchangedCount: scene?.exchangedCount ?? 0,
  }),
  diagnostics: () => scene?.diagnostics(),
  setSpeed,
  reset,
};

paintRanks();
updateSpeedControls();
updateCounters();
log("写实工坊已就绪");
requestAnimationFrame(animate);
setTimeout(() => {
  if (received === 0) {
    batch(5);
    log("已加入 5 位演示观众，可在右侧继续操作");
  }
}, 500);

const controlsButton = $("openControls");
function showControls(open) {
  document.body.classList.toggle("controls-open", open);
  $("studioPanel").hidden = !open;
  controlsButton.setAttribute("aria-expanded", String(open));
  controlsButton.setAttribute("aria-label", open ? "关闭工坊控制台" : "打开工坊控制台");
  if (open) $("nickname").focus(); else controlsButton.focus();
}
controlsButton.addEventListener("click", () => showControls($("studioPanel").hidden));
$("closeBackdrop").addEventListener("click", () => showControls(false));
document.addEventListener("keydown", e => { if(e.key === "Escape") showControls(false); });
