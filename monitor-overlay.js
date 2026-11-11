// Cyan floating-camera HUD. The caller owns its outer frame and renders the
// tilted material first; this module paints only the feed annotations.
import { getRasterSample, RASTER_ROWS } from './scan-path.js';

const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const FONT = '"Microsoft YaHei", "Segoe UI", sans-serif';
const PHASES = new Set(['loading', 'engraving', 'finishing', 'rating', 'unloading', 'idle', 'tray-exchange']);

function clean(value) {
  return String(value ?? '').replace(/[\r\n\t]/g, ' ').trim();
}

function fitText(ctx, value, maximumWidth) {
  const text = clean(value);
  if (ctx.measureText(text).width <= maximumWidth) return text;
  const letters = Array.from(text);
  while (letters.length && ctx.measureText(`${letters.join('')}…`).width > maximumWidth) letters.pop();
  return letters.length ? `${letters.join('')}…` : '';
}

// One deterministic display model: scores cannot leak before the rating phase,
// and a cleared feed cannot retain the previous record's name or assessment.
export function getMonitorOverlayData({
  nickname = '', phase = 'idle', progress = 0, assessment = null,
  scoreProgress = 0, paused = false,
} = {}) {
  const state = PHASES.has(phase) ? phase : 'idle';
  const rating = state === 'rating', inactive = state === 'idle' || state === 'tray-exchange';
  const printProgress = inactive || state === 'loading' ? 0 : state === 'engraving' ? clamp(progress) : 1;
  const raster = getRasterSample(printProgress);
  const completedRows = raster.complete ? RASTER_ROWS
    : raster.row + raster.lanes.filter(lane => lane.complete).length;
  const score = !inactive && (rating || state === 'unloading') && Number.isFinite(assessment?.score)
    ? Math.round(clamp(assessment.score / 100) * 100) : null;
  const reveal = score === null ? 0 : rating ? clamp(scoreProgress) : 1;
  const displayScore = score === null ? null : Math.round(score * (1 - (1 - reveal) ** 3));
  const statuses = {
    loading: '等待上料', engraving: '逐行雕刻', finishing: '雕刻头归位', rating: '作品评分',
    unloading: '成品出料', idle: '待机', 'tray-exchange': '收料盘更换中',
  };
  const name = inactive ? '' : clean(nickname);
  const percent = Math.floor(printProgress * 100);
  const pillValue = score !== null ? `${displayScore}分` : rating ? '评分待更新'
    : state === 'unloading' ? '成品已出料' : `${percent}%`;
  const comment = rating && score !== null
    ? clean(assessment.comment).split(/[，。；]/u)[0] || '图像效果已评估' : '';
  return {
    phase: state, nickname: name, paused: Boolean(paused),
    phaseStatus: statuses[state], status: `${statuses[state]}${paused ? ' · 已暂停' : ''}`,
    progress: printProgress, percent, completedRows, totalRows: RASTER_ROWS,
    score, displayScore, scoreProgress: reveal, comment,
    pillValue: inactive ? '' : pillValue,
    pillText: inactive ? state === 'idle' ? '等待下一件作品' : '收料盘更换中'
      : `${name || '当前作品'} | ${pillValue}`,
  };
}

/**
 * Draw in a 1024 x 512 feed, respecting the caller's transform and opacity.
 * No full-width footer: title at (64,40), three quiet readouts at x840,
 * and a compact warm-gold capsule at bottom-right, y450..500.
 */
export function drawMonitorOverlay(ctx, {
  width = 1024, height = 512, ...options
} = {}) {
  if (!ctx || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  const data = getMonitorOverlayData(options);

  ctx.save();
  ctx.scale(width / 1024, height / 512);
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath(); ctx.rect(0, 0, 1024, 512); ctx.clip();
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // Fine, low-opacity references keep the portrait readable through the grid.
  ctx.strokeStyle = '#80d9d718'; ctx.lineWidth = .65; ctx.beginPath();
  for (let x = 36; x < 1006; x += 86) { ctx.moveTo(x, 76); ctx.lineTo(x, 438); }
  for (let y = 84; y < 438; y += 56) { ctx.moveTo(18, y); ctx.lineTo(1006, y); }
  ctx.stroke();
  ctx.fillStyle = '#c4eeea'; ctx.font = `600 36px ${FONT}`;
  ctx.fillText('激光特写', 64, 45);
  ctx.fillStyle = '#9bcfcf'; ctx.font = `500 25px ${FONT}`;
  ctx.fillText('LIVE CAM', 225, 44);
  ctx.fillStyle = '#63d7d2a6'; ctx.fillRect(64, 62, 68, 2);

  // Keep the actual scan measurements in the same light, compact arrangement
  // as the reference feed, leaving the material as the visual subject.
  const compactStatuses = {
    loading: '上料中', engraving: '雕刻中', finishing: '归位中',
    rating: '评分中', unloading: '出料中', idle: '待机', 'tray-exchange': '换盘中',
  };
  const status = data.paused ? '已暂停'
    : data.phase === 'rating' ? data.comment || '评分待更新' : compactStatuses[data.phase];
  const rows = [`进度  ${data.percent}%`, `扫描  ${data.completedRows}/${data.totalRows}`, `状态  ${status}`];
  ctx.font = `400 24px ${FONT}`;
  rows.forEach((row, index) => {
    const baseline = 145 + index * 56;
    ctx.fillStyle = '#e2efeb'; ctx.fillText(fitText(ctx, row, 160), 840, baseline);
    if (index < rows.length - 1) {
      ctx.fillStyle = '#a0dedb24'; ctx.fillRect(840, baseline + 18, 160, 1);
    }
  });

  // The only dark region at the bottom is this compact, content-sized capsule.
  ctx.font = `500 32px ${FONT}`;
  const suffix = ` | ${data.pillValue}`;
  const name = fitText(ctx, data.nickname || '当前作品', Math.max(0, 372 - ctx.measureText(suffix).width));
  const text = data.nickname || !['idle', 'tray-exchange'].includes(data.phase)
    ? `${name}${suffix}` : fitText(ctx, data.pillText, 372);
  const pillWidth = Math.min(420, ctx.measureText(text).width + 48), pillX = 952 - pillWidth;
  ctx.fillStyle = '#071817d4'; ctx.beginPath(); ctx.roundRect(pillX, 450, pillWidth, 50, 25); ctx.fill();
  ctx.strokeStyle = '#e8bf72cc'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffe3a0'; ctx.fillText(text, 928, 484);
  ctx.shadowColor = '#ffd88c'; ctx.shadowBlur = 9; ctx.fillStyle = '#ffe0a1';
  ctx.fillRect(pillX - 48, 478, 30, 3); ctx.fillRect(972, 478, 30, 3);
  ctx.restore();
}
