// The arm is drawn in the approved photograph's 941 x 1672 coordinate plane.
// Its revolute joints are solved in an uncompressed horizontal world plane,
// then projected through the same depth perspective. Only the suction spindle
// retracts when lift changes. The fixed pedestal is part of the clean plate.
export const ARM_GEOMETRY = Object.freeze({
  shoulder: Object.freeze({ x: 221, y: 707 }),
  upperLength: 150,
  forearmLength: 165,
  yScale: .5,
  depthPerspective: -.003,
  spindleHeight: 185,
  baseTop: 735,
});

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

// World distances stay rigid while screen lengths naturally foreshorten.
// The modest depth term keeps the folded arm in front of the rear gantry.
export function projectArmPoint(point) {
  const g = ARM_GEOMETRY, denominator = 1 + g.depthPerspective * point.y;
  return {
    x: g.shoulder.x + point.x / denominator,
    y: g.shoulder.y + g.yScale * point.y / denominator,
  };
}

export function unprojectArmPoint(point) {
  const g = ARM_GEOMETRY, dx = point.x - g.shoulder.x, dy = point.y - g.shoulder.y;
  const raw = g.yScale - g.depthPerspective * dy;
  const denominator = Math.abs(raw) < 1e-8 ? (raw < 0 ? -1e-8 : 1e-8) : raw;
  const y = dy / denominator;
  return { x: dx * (1 + g.depthPerspective * y), y };
}

/** Right/up world-plane elbow branch, projected back into the photograph. */
export function solveArm(target = {}, { spindleHeight = 185 } = {}) {
  target ??= {};
  const g = ARM_GEOMETRY;
  const height = Math.max(40, finite(spindleHeight, g.spindleHeight));
  const shoulder = { ...g.shoulder };
  const wanted = { x: finite(target.x, 305), y: finite(target.y, 1090) - height };
  const lift = Math.max(0, finite(target.lift, 0));
  const wantedWorld = unprojectArmPoint(wanted);
  const dx = wantedWorld.x, dy = wantedWorld.y;
  const distance = Math.hypot(dx, dy);
  const min = Math.abs(g.upperLength - g.forearmLength), max = g.upperLength + g.forearmLength;
  const radius = Math.min(max, Math.max(min, distance));
  const ux = distance > 1e-10 ? dx / distance : 1;
  const uy = distance > 1e-10 ? dy / distance : 0;
  const along = (g.upperLength ** 2 - g.forearmLength ** 2 + radius ** 2) / (2 * radius);
  const elbowHeight = Math.sqrt(Math.max(0, g.upperLength ** 2 - along ** 2));
  const world = {
    shoulder: { x: 0, y: 0 },
    elbow: { x: ux * along + uy * elbowHeight, y: uy * along - ux * elbowHeight },
    wrist: { x: ux * radius, y: uy * radius },
  };
  const elbow = projectArmPoint(world.elbow);
  const wrist = projectArmPoint(world.wrist);
  const tip = { x: wrist.x, y: wrist.y + height - lift };
  return { shoulder, elbow, wrist, tip, world, lift, spindleHeight: height,
    reachable: distance >= min && distance <= max };
}

const UPPER_PHOTO = Object.freeze({
  a: { x: 221, y: 707 }, b: { x: 373, y: 748 },
  outline: [[226, 690], [356, 725], [376, 727], [391, 736], [396, 750],
    [391, 766], [375, 777], [355, 775], [222, 733]],
});
const FOREARM_PHOTO = Object.freeze({
  a: { x: 373, y: 748 }, b: { x: 319, y: 819 },
  outline: [[354, 739], [378, 734], [391, 744], [393, 760], [384, 779],
    [344, 834], [332, 848], [319, 850], [306, 838], [309, 822], [344, 779], [354, 762]],
});

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.closePath();
}

// Stretch along the link axis while preserving the photographed metal's width.
// This avoids stretching the arm's thickness when the projected reach changes.
function photoLink(ctx, photograph, photo, from, to) {
  const originalAngle = Math.atan2(photo.b.y - photo.a.y, photo.b.x - photo.a.x);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const originalLength = Math.hypot(photo.b.x - photo.a.x, photo.b.y - photo.a.y);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  ctx.save();
  ctx.translate(from.x, from.y);
  ctx.rotate(angle);
  ctx.scale(length / originalLength, 1);
  ctx.rotate(-originalAngle);
  ctx.translate(-photo.a.x, -photo.a.y);
  polygon(ctx, photo.outline);
  ctx.fillStyle = 'rgba(0,0,0,.24)';
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 5;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  polygon(ctx, photo.outline);
  ctx.clip();
  ctx.drawImage(photograph, 0, 0);
  ctx.restore();
}

function metalGradient(ctx, left, right, y = 0) {
  const gradient = ctx.createLinearGradient(left, y, right, y);
  gradient.addColorStop(0, '#525557');
  gradient.addColorStop(.12, '#b6aaa0');
  gradient.addColorStop(.27, '#ede2ce');
  gradient.addColorStop(.38, '#8c8985');
  gradient.addColorStop(.68, '#a19b91');
  gradient.addColorStop(.85, '#ebe3d4');
  gradient.addColorStop(1, '#4d4c49');
  return gradient;
}

function metalEllipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = metalGradient(ctx, x - rx, x + rx, y);
  ctx.fill();
  ctx.lineWidth = .8;
  ctx.strokeStyle = 'rgba(43,36,28,.9)';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y - .5, rx - 2, Math.max(1, ry - 1.5), 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,242,213,.55)';
  ctx.stroke();
}

function shoulderCoupling(ctx, shoulder) {
  const x = shoulder.x, y = shoulder.y, bottom = ARM_GEOMETRY.baseTop;
  ctx.fillStyle = metalGradient(ctx, x - 23, x + 23, y);
  ctx.fillRect(x - 23, y, 46, bottom - y);
  metalEllipse(ctx, x, bottom, 28, 8);
  ctx.fillStyle = metalGradient(ctx, x - 21, x + 21, y);
  ctx.fillRect(x - 21, y - 5, 42, bottom - y + 3);
  metalEllipse(ctx, x, y - 5, 23, 8);
  ctx.beginPath();
  ctx.ellipse(x, bottom - 8, 22, 5, 0, 0, Math.PI);
  ctx.strokeStyle = '#252522';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function hoses(ctx, { shoulder: a, elbow: b, wrist: c }) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [offset, width, color] of [[0, 7, '#11191b'], [-3, 2.3, '#174955'], [-5, .65, '#78918c']]) {
    ctx.beginPath();
    ctx.moveTo(a.x - 28, a.y + 29);
    ctx.bezierCurveTo(a.x - 57, a.y - 50, a.x + 25, a.y - 57, b.x, b.y - 23 + offset);
    ctx.bezierCurveTo(b.x + 14, b.y - 6, c.x - 30, c.y - 10, c.x - 23, c.y + 59);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.restore();
}

function elbowCap(ctx, photograph, elbow) {
  ctx.save();
  ctx.translate(elbow.x - 373, elbow.y - 748);
  ctx.beginPath();
  ctx.ellipse(373, 748, 21, 10, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(photograph, 0, 0);
  ctx.restore();
}

function spindle(ctx, photograph, pose, vacuum) {
  const { wrist, tip } = pose;
  const x = wrist.x, y = wrist.y;
  const end = tip.y;
  // Preserve the original 22px cup/rod clearance while shortening the wrist
  // housing. The 108px compact option scales its photographed body to .53.
  const factor = Math.max(.1, (pose.spindleHeight - 22) / (ARM_GEOMETRY.spindleHeight - 22));
  ctx.save();
  // The moving rod telescopes into the stationary wrist body. Its final black
  // cup always ends at the physical contact point returned by solveArm().
  const rodTop = y + 105 * factor;
  const rodBottom = Math.max(rodTop, end - 10);
  ctx.fillStyle = metalGradient(ctx, x - 7, x + 7, rodTop);
  ctx.fillRect(x - 7, rodTop, 14, rodBottom - rodTop);
  if (rodBottom > rodTop + 7) {
    metalEllipse(ctx, x, rodTop + 8, 9, 3);
    metalEllipse(ctx, x, rodBottom - 4, 9, 3);
  }
  // Preserve the real cylinder, black collar, fittings and hose texture.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, factor);
  ctx.translate(-319, -819);
  polygon(ctx, [[302, 816], [335, 816], [337, 850], [334, 878],
    [333, 896], [333, 924], [328, 936], [305, 936], [300, 927],
    [301, 896], [304, 878], [302, 849]]);
  ctx.clip();
  ctx.drawImage(photograph, 0, 0);
  ctx.restore();
  const cup = ctx.createLinearGradient(x - 12, end - 10, x + 12, end);
  cup.addColorStop(0, '#111413');
  cup.addColorStop(.42, '#3a3b36');
  cup.addColorStop(1, '#080b0a');
  ctx.fillStyle = cup;
  ctx.beginPath();
  ctx.moveTo(x - 6, end - 12);
  ctx.lineTo(x + 6, end - 12);
  ctx.bezierCurveTo(x + 6, end - 7, x + 11, end - 7, x + 12, end - 3);
  ctx.quadraticCurveTo(x, end + 3, x - 12, end - 3);
  ctx.bezierCurveTo(x - 11, end - 7, x - 6, end - 7, x - 6, end - 12);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, end - 2, 12, 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#101311';
  ctx.fill();
  ctx.strokeStyle = 'rgba(165,167,151,.25)';
  ctx.lineWidth = .65;
  ctx.stroke();
  if (vacuum) {
    ctx.beginPath();
    ctx.arc(x + 7, y + 90 * factor, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#6c9b78';
    ctx.fill();
  }
  ctx.restore();
}

/** Draw only moving hardware; the caller owns the photograph and clean plate. */
export function drawPickArm(ctx, referenceImage, armTarget, { vacuum = false, spindleHeight = 185 } = {}) {
  const pose = solveArm(armTarget, { spindleHeight });
  ctx.save();
  try {
    hoses(ctx, pose);
    shoulderCoupling(ctx, pose.shoulder);
    photoLink(ctx, referenceImage, UPPER_PHOTO, pose.shoulder, pose.elbow);
    photoLink(ctx, referenceImage, FOREARM_PHOTO, pose.elbow, pose.wrist);
    elbowCap(ctx, referenceImage, pose.elbow);
    spindle(ctx, referenceImage, pose, vacuum);
  } finally {
    ctx.restore();
  }
  return pose;
}
