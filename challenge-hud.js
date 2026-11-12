// Readable, broadcast-sized scoring and ranking annotations. Random scores are
// assigned by the job lifecycle; painting this HUD never rolls a new score.
import { getRasterSample, RASTER_ROWS } from './scan-path.js';

const FONT = '"Microsoft YaHei", "Segoe UI", sans-serif';
const PHASES = new Set(['loading', 'engraving', 'finishing', 'rating', 'unloading', 'idle', 'tray-exchange']);
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const clean = value => String(value ?? '').replace(/[\r\n\t]/g, ' ').trim();
const scoreValue = value => Number.isFinite(value) ? Math.round(Math.min(100000, Math.max(0, value))) : null;
const formatScore = value => value.toLocaleString('en-US');

export function getChallengeBoardData({
  active = null, phase = 'idle', progress = 0, scoreProgress = 0,
  paused = false, ranking = [], completedCount = 0,
} = {}) {
  const state = PHASES.has(phase) ? phase : 'idle';
  const hasActive = Boolean(active) && !['idle', 'tray-exchange'].includes(state);
  const revealAllowed = hasActive && ['engraving','finishing','rating','unloading'].includes(state);
  const score = revealAllowed ? scoreValue(active.assessment?.score) : null;
  const reveal = score === null ? 0 : state === 'engraving' ? clamp(progress) : 1;
  // Flooring prevents an integer result from reaching its final value early.
  const displayScore = score === null ? null : reveal >= 1 ? score : Math.floor(score * reveal);
  const printProgress = !hasActive || state === 'loading' ? 0
    : state === 'engraving' ? clamp(progress) : 1;
  const raster = getRasterSample(printProgress);
  const completedRows = raster.complete ? RASTER_ROWS
    : raster.row + raster.lanes.filter(lane => lane.complete).length;
  const phaseText = {
    loading: '夹紧定位', engraving: '雕刻·同步评分', finishing: '雕刻评分完成', rating: '评分完成·展示',
    unloading: '成品出料', idle: '等待观众入场', 'tray-exchange': '收料盘更换中',
  }[state];
  const leaders = (Array.isArray(ranking) ? ranking : [])
    .map((record, index) => ({ record, index, score: scoreValue(record?.assessment?.score) }))
    .filter(record => record.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 10)
    .map(({ record, score: result }, index) => ({
      nickname: clean(record.nickname), portrait: record.portrait ?? null,
      score: result, scoreText: formatScore(result), rank: index + 1,
    }));
  return {
    phase: state, hasActive, nickname: hasActive ? clean(active.nickname) : '',
    score, displayScore, scoreText: displayScore === null ? null : formatScore(displayScore),
    scoreProgress: reveal, stars: displayScore === null || displayScore === 0 ? 0
      : Math.min(5, Math.ceil(displayScore / 20000)),
    percent: Math.floor(printProgress * 100), progress: printProgress, completedRows,
    totalRows: RASTER_ROWS, status: paused ? '已暂停' : phaseText,
    completedCount: Number.isFinite(completedCount) ? Math.max(0, Math.floor(completedCount)) : 0,
    ranking: leaders,
  };
}

function fitText(ctx, text, width) {
  const source = clean(text);
  if (ctx.measureText(source).width <= width) return source;
  const letters = Array.from(source);
  while (letters.length && ctx.measureText(`${letters.join('')}…`).width > width) letters.pop();
  return letters.length ? `${letters.join('')}…` : '';
}

function star(ctx, x, y, radius, filled, color = '#ffdc73') {
  ctx.beginPath();
  for (let index = 0; index < 10; index++) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const r = index % 2 ? radius * .44 : radius;
    const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
    if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? color : '#473c29'; ctx.fill();
  ctx.strokeStyle = filled ? '#ffedba' : '#85704a'; ctx.lineWidth = .8; ctx.stroke();
}

function trophy(ctx, x, y, size = 1, color = '#ffda6e') {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(-10, -11); ctx.lineTo(10, -11); ctx.lineTo(8, 2);
  ctx.quadraticCurveTo(0, 12, -8, 2); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(-17, -8); ctx.quadraticCurveTo(-17, 6, -6, 5);
  ctx.moveTo(10, -8); ctx.lineTo(17, -8); ctx.quadraticCurveTo(17, 6, 6, 5); ctx.stroke();
  ctx.fillRect(-1.5, 8, 3, 8); ctx.fillRect(-8, 16, 16, 3);
  ctx.restore();
}

function framedPanel(ctx, x, y, width, height, radius) {
  ctx.save();
  const fill = ctx.createLinearGradient(x, y, x + width, y + height);
  fill.addColorStop(0, '#19160df0'); fill.addColorStop(.48, '#111d20e6'); fill.addColorStop(1, '#20190aeb');
  ctx.fillStyle = fill;
  ctx.shadowColor = '#ffc64e'; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
  const outline = ctx.createLinearGradient(x, y, x + width, y + height);
  outline.addColorStop(0, '#ffe6a0'); outline.addColorStop(.35, '#c7882b');
  outline.addColorStop(.7, '#66d9da'); outline.addColorStop(1, '#ffc75b');
  ctx.strokeStyle = outline; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#f1c16c54'; ctx.lineWidth = .7;
  ctx.beginPath(); ctx.roundRect(x + 6, y + 6, width - 12, height - 12, Math.max(2, radius - 5)); ctx.stroke();
  ctx.restore();
}

function avatar(ctx, portrait, x, y, radius, color) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#15262b'; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  let drawn = false;
  if (portrait) {
    const width = portrait.naturalWidth || portrait.width, height = portrait.naturalHeight || portrait.height;
    if (width > 0 && height > 0) {
      const size = Math.min(width, height);
      try {
        ctx.drawImage(portrait, (width - size) / 2, (height - size) / 2, size, size,
          x - radius, y - radius, radius * 2, radius * 2);
        drawn = true;
      } catch { /* A not-yet-loaded portrait retains its quiet placeholder. */ }
    }
  }
  if (!drawn) star(ctx, x, y, radius * .42, true, '#7b9a9c');
  ctx.restore();
  ctx.strokeStyle = color; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
}

function drawScorePanel(ctx, data) {
  const x = 710, y = 545, width = 340, height = 485;
  framedPanel(ctx, x, y, width, height, 23);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  trophy(ctx, x + 42, y + 36, .7);
  ctx.fillStyle = '#fff0c7'; ctx.font = `600 25px ${FONT}`;
  ctx.fillText('头像挑战评分', x + 191, y + 45);
  ctx.font = `400 17px ${FONT}`; ctx.fillStyle = '#d3c39c';
  ctx.fillText(fitText(ctx, data.nickname || '等待下一位观众', 286), x + width / 2, y + 77);

  if (data.scoreText !== null) {
    const scoreWidth = 284;
    let size = 61;
    ctx.font = `700 ${size}px ${FONT}`;
    while (size > 28 && ctx.measureText(data.scoreText).width > scoreWidth) ctx.font = `700 ${--size}px ${FONT}`;
    ctx.shadowColor = '#ff9d16'; ctx.shadowBlur = 20; ctx.fillStyle = '#ffdd6c';
    ctx.fillText(data.scoreText, x + width / 2, y + 146);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe8ac'; ctx.font = `500 18px ${FONT}`; ctx.fillText('分', x + width - 26, y + 146);
  } else {
    ctx.fillStyle = '#ffe0a0'; ctx.font = `600 31px ${FONT}`;
    ctx.fillText(data.hasActive ? '评分待揭晓' : '等待新作品', x + width / 2, y + 139);
    // A restrained pulsing line uses real progress, without previewing a score.
    ctx.fillStyle = '#f4c16442'; ctx.fillRect(x + 65, y + 153, 210, 2);
    ctx.fillStyle = '#ffe6a5'; ctx.fillRect(x + 65, y + 153, 18 + data.progress * 192, 2);
  }

  ctx.save(); ctx.shadowColor = '#ffb728'; ctx.shadowBlur = data.stars ? 8 : 0;
  for (let index = 0; index < 5; index++) star(ctx, x + 99 + index * 36, y + 187, 14, index < data.stars);
  ctx.restore();
  ctx.strokeStyle = '#c2934566'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(x + 25, y + 215); ctx.lineTo(x + width - 25, y + 215); ctx.stroke();

  const rows = [
    ['扫描进度', `${data.completedRows}/${data.totalRows}`],
    ['加工状态', data.status],
    ['累计完成', `${data.completedCount} 件`],
  ];
  rows.forEach(([label, value], index) => {
    const baseline = y + 252 + index * 45;
    ctx.fillStyle = '#e8ca7c'; ctx.beginPath(); ctx.arc(x + 32, baseline - 7, 4, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.font = `400 20px ${FONT}`; ctx.fillStyle = '#d7ded7';
    ctx.fillText(label, x + 47, baseline);
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff0c3';
    ctx.fillText(fitText(ctx, value, 151), x + width - 26, baseline);
  });
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffc960'; ctx.font = `500 18px ${FONT}`;
  ctx.beginPath(); ctx.roundRect(x + 24, y + 367, width - 48, 35, 17); ctx.strokeStyle = '#dca446a6'; ctx.stroke();
  ctx.fillText('随机积分 · 0–100,000', x + width / 2, y + 391);
  ctx.textAlign = 'left'; ctx.font = `500 21px ${FONT}`; ctx.fillStyle = '#e6f5f1';
  ctx.fillText(data.status, x + 27, y + 432);
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffe7a3'; ctx.fillText(`${data.percent}%`, x + width - 27, y + 432);
  ctx.fillStyle = '#51412a'; ctx.beginPath(); ctx.roundRect(x + 27, y + 448, width - 54, 8, 4); ctx.fill();
  if (data.progress > 0) {
    const bar = ctx.createLinearGradient(x + 27, 0, x + width - 27, 0);
    bar.addColorStop(0, '#e4951d'); bar.addColorStop(1, '#fff0a4');
    ctx.fillStyle = bar; ctx.shadowColor = '#ffbc39'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.roundRect(x + 27, y + 448, (width - 54) * data.progress, 8, 4); ctx.fill(); ctx.shadowBlur = 0;
  }
}

function drawRanking(ctx, data) {
  const x = 45, y = 80, width = 990, height = 210;
  ctx.save();ctx.fillStyle='#031b24ee';ctx.strokeStyle='#6defff';ctx.lineWidth=2;
  ctx.shadowColor='#11d9ff';ctx.shadowBlur=19;
  ctx.beginPath();ctx.roundRect(x,y,width,height,25);ctx.fill();ctx.stroke();ctx.restore();
  trophy(ctx, x + 37, y + 26, .75);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 30px ${FONT}`; ctx.fillStyle = '#f1f5e9';
  ctx.fillText('本场头像排行榜', x + 65, y + 36);
  ctx.font = `500 25px ${FONT}`; ctx.fillStyle = '#f1d683'; ctx.fillText('(Top 10)', x + 320, y + 36);
  ctx.textAlign = 'right'; ctx.font = `400 18px ${FONT}`; ctx.fillStyle = '#b7c9c5';
  ctx.fillText('随机积分', x + width - 26, y + 34);
  ctx.strokeStyle = '#add0c743'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(x + 24, y + 49); ctx.lineTo(x + width - 24, y + 49); ctx.stroke();
  ctx.textAlign = 'center';
  if (!data.ranking.length) {
    ctx.font = `400 25px ${FONT}`; ctx.fillStyle = '#a6bab5';
    ctx.fillText('等待第一件作品完成', x + width / 2, y + 130);
    return;
  }
  const slot = (width - 36) / 10;
  data.ranking.forEach((record, index) => {
    const cx = x + 18 + slot * (index + .5), cy = y + 130;
    const medal = ['#ffda69', '#d1e3e7', '#e0a06b'][index] || '#79b8bc';
    ctx.save();
    if (index === 0) { ctx.shadowColor = '#ffc243'; ctx.shadowBlur = 11; }
    avatar(ctx, record.portrait, cx, cy, 37, medal); ctx.shadowBlur = 0;
    if (index < 3) {
      ctx.fillStyle = medal; ctx.strokeStyle = '#34280b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - 14, cy - 39); ctx.lineTo(cx - 16, cy - 56);
      ctx.lineTo(cx - 6, cy - 48); ctx.lineTo(cx, cy - 59); ctx.lineTo(cx + 6, cy - 48);
      ctx.lineTo(cx + 16, cy - 56); ctx.lineTo(cx + 14, cy - 39); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2e2a1b'; ctx.font = `700 16px ${FONT}`; ctx.fillText(record.rank, cx, cy - 41);
    } else {
      ctx.beginPath(); ctx.arc(cx, cy - 36, 11, 0, Math.PI * 2); ctx.fillStyle = '#102329'; ctx.fill();
      ctx.strokeStyle = medal; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = `500 14px ${FONT}`; ctx.fillStyle = '#e9dfad'; ctx.fillText(record.rank, cx, cy - 31);
    }
    let size = 21; ctx.font = `600 ${size}px ${FONT}`;
    while (size > 12 && ctx.measureText(record.scoreText).width > slot - 8) ctx.font = `600 ${--size}px ${FONT}`;
    ctx.fillStyle = index === 0 ? '#ffe677' : '#f1dc94'; ctx.fillText(record.scoreText, cx, y + 190);
    ctx.restore();
  });
}

/** Draw over a 1080 × 1920 broadcast; restores every caller Canvas state. */
export function drawChallengeHud(ctx, options = {}) {
  if (!ctx) return;
  const data = getChallengeBoardData(options);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  drawScorePanel(ctx, data); drawRanking(ctx, data);
  ctx.restore();
}
