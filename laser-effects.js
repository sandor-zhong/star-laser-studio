const TAU = Math.PI * 2;
const fraction = value => value - Math.floor(value);
const seed = index => fraction(Math.sin(index * 127.1 + 39.7) * 43758.5453123);
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);

// Short, independently staggered flights keep the shower attached to the
// current contact point. All animation comes from the shared production clock.
export function getLaserParticles(time = 0) {
  const clock = Number.isFinite(time) ? time : 0;
  return Array.from({ length: 28 }, (_, index) => {
    const a = seed(index + 1), b = seed(index + 53), c = seed(index + 101);
    const age = fraction(clock * (1.8 + a * 1.6) + b);
    const angle = (-81 + c * 99) * Math.PI / 180;
    const range = 62 + a * 130, distance = 5 + age * range;
    const length = Math.min(distance, 20 + b * 85);
    const directionX = Math.cos(angle), directionY = Math.sin(angle);
    const fall = age * age * (9 + c * 17);
    return {
      x: directionX * distance,
      y: directionY * distance + fall,
      tailX: directionX * (distance - length),
      tailY: directionY * (distance - length) + fall * .76,
      alpha: (.48 + a * .48) * Math.sin(Math.PI * (.12 + age * .82)),
      width: .7 + b * 1.1,
      age,
    };
  });
}

export function drawLaserContact(ctx, { tip, impact, time = 0, active = false, paused = false, scale = 1 } = {}) {
  if (!active || paused || !finitePoint(tip) || !finitePoint(impact)
      || !Number.isFinite(scale) || scale <= 0) return;
  const clock = Number.isFinite(time) ? time : 0;
  const pulse = .94 + Math.sin(clock * 71) * .06;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(impact.x, impact.y);
  ctx.scale(scale, scale);

  // Thin, transparent wisps drift above the contact without veiling the face.
  for (let index = 0; index < 3; index++) {
    const drift = Math.sin(clock * 1.7 + index * 2.3) * 16;
    const curl = Math.sin(clock * 2.6 + index * 1.1) * 8;
    const rise = 96 + index * 18;
    const exhaust = index === 0 ? 0 : 76 + index * 10;
    const top = exhaust + 15 + drift * .5;
    const smoke = ctx.createLinearGradient(0, -7, top, -rise);
    smoke.addColorStop(0, '#b8dfe900');
    smoke.addColorStop(.2, '#c4dfe933');
    smoke.addColorStop(.65, '#d8edf326');
    smoke.addColorStop(1, '#d8edf300');
    ctx.strokeStyle = smoke;
    ctx.lineWidth = 2.4 + index * 1.1;
    ctx.beginPath();
    ctx.moveTo(3, -6);
    ctx.bezierCurveTo(26 + drift + exhaust * .14, -rise * .3,
      -17 + drift - curl + exhaust * .45, -rise * .48,
      15 + drift + exhaust * .65, -rise * .68);
    ctx.bezierCurveTo(40 + drift + curl + exhaust * .75, -rise * .85,
      13 - drift + exhaust * .92, -rise * .94, top, -rise);
    ctx.stroke();
  }

  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 40 * pulse);
  glow.addColorStop(0, '#edfffff2');
  glow.addColorStop(.13, '#4ef8ffda');
  glow.addColorStop(.35, '#00ddff70');
  glow.addColorStop(.68, '#00bcd520');
  glow.addColorStop(1, '#00cfff00');
  ctx.fillStyle = glow;
  ctx.beginPath();ctx.arc(0, 0, 40 * pulse, 0, TAU);ctx.fill();

  const nozzle = { x: (tip.x - impact.x) / scale, y: (tip.y - impact.y) / scale };
  for (const [width, color] of [[8, '#00cfff19'], [3.4, '#00e8ff99'], [1.35, '#b8ffff']]) {
    ctx.strokeStyle = color;ctx.lineWidth = width;
    ctx.beginPath();ctx.moveTo(nozzle.x, nozzle.y);ctx.lineTo(0, 0);ctx.stroke();
  }

  ctx.shadowColor = '#ff9c35bb';
  ctx.shadowBlur = 2.6;
  for (const particle of getLaserParticles(clock)) {
    const spark = ctx.createLinearGradient(particle.tailX, particle.tailY, particle.x, particle.y);
    spark.addColorStop(0, '#ff680000');
    spark.addColorStop(.32, '#ff8d24');
    spark.addColorStop(.8, '#ffce65');
    spark.addColorStop(1, '#fff7d8');
    ctx.globalAlpha = particle.alpha;
    ctx.strokeStyle = spark;ctx.lineWidth = particle.width * 1.35;
    ctx.beginPath();ctx.moveTo(particle.tailX, particle.tailY);ctx.lineTo(particle.x, particle.y);ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowColor = '#0000';
  // Paint the opaque white nucleus last: neither smoke nor orange trails may
  // tint the hottest point cyan or hide it behind the material.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();ctx.arc(0, 0, 3.7 * pulse, 0, TAU);ctx.fill();
  ctx.restore();
}
