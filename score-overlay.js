// Draw after the scene: this overlay uses output pixels, independently of camera
// transforms. progress is the 0..1 counting animation; the caller owns its clock.
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const metric = value => Math.round(clamp(Number(value) / 100) * 100);

export function drawScoreOverlay(ctx, assessment, progress, {
  width = 1080, height = 1920, nickname = '',
} = {}) {
  if (!ctx || !assessment) return;
  const p = clamp(progress), eased = 1 - (1 - p) ** 3;
  const score = Math.round(metric(assessment.score) * eased);
  const scale = Math.min(width / 1080, height / 1920);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, (width - 1080 * scale) / 2, (height - 1920 * scale) / 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha *= clamp(p * 5);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // A soft wash helps the lettering over metal without adding a boxed panel.
  const wash = ctx.createLinearGradient(0, 1270, 0, 1740);
  wash.addColorStop(0, '#10120f00'); wash.addColorStop(.35, '#10120f65');
  wash.addColorStop(.75, '#10120f50'); wash.addColorStop(1, '#10120f00');
  ctx.fillStyle = wash; ctx.fillRect(72, 1270, 936, 470);
  const rule = ctx.createLinearGradient(300, 0, 780, 0);
  rule.addColorStop(0, '#d7b47500'); rule.addColorStop(.5, '#e4c58ba0'); rule.addColorStop(1, '#d7b47500');
  ctx.fillStyle = rule; ctx.fillRect(300, 1294, 480, 1);
  ctx.shadowColor = '#090c09a0'; ctx.shadowBlur = 8; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#eee8dc'; ctx.font = '500 34px "Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.fillText('作品效果分', 540, 1354);
  ctx.font = '600 146px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#f1d39b'; ctx.fillText(String(score), 540, 1505);
  const numberWidth = ctx.measureText(String(score)).width;
  ctx.font = '400 28px "Segoe UI", sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#dbd6ca'; ctx.fillText('/ 100', 540 + numberWidth / 2 + 14, 1498);
  ctx.textAlign = 'center'; ctx.fillStyle = '#f3f0e9';
  const comment = String(assessment.comment || '主体清楚，整体效果自然。').slice(0, 38);
  ctx.font = '400 30px "Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.fillText(comment, 540, 1580, 870);
  ctx.font = '400 24px "Microsoft YaHei", "Segoe UI", sans-serif'; ctx.fillStyle = '#c8c9c0';
  ctx.fillText(`清晰度 ${metric(assessment.clarity)}    ·    构图 ${metric(assessment.composition)}    ·    色彩 ${metric(assessment.color)}`, 540, 1638);
  if (nickname) {
    ctx.font = '400 22px "Microsoft YaHei", "Segoe UI", sans-serif'; ctx.fillStyle = '#babdb2';
    ctx.fillText(`${String(nickname).slice(0, 16)} · 本次作品`, 540, 1690, 860);
  }
  ctx.restore();
}
