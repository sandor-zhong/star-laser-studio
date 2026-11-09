// Calibrated against output/structure-concept-v3.png at its native 941 x 1672.
// u follows the left-to-right belt travel; v follows the rear-to-front direction.
// The four corners are the usable cloth, excluding the steel end rollers.
const freezePoint = (x, y) => Object.freeze({ x, y });
const corners = Object.freeze({
  rearLeft: freezePoint(230, 1038),
  rearRight: freezePoint(655, 1026),
  frontRight: freezePoint(693, 1128),
  frontLeft: freezePoint(249, 1141),
});

function homography({ rearLeft: p0, rearRight: p1, frontRight: p2, frontLeft: p3 }) {
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  return Object.freeze({
    a: p1.x - p0.x + g * p1.x,
    b: p3.x - p0.x + h * p3.x,
    c: p0.x,
    d: p1.y - p0.y + g * p1.y,
    e: p3.y - p0.y + h * p3.y,
    f: p0.y, g, h,
  });
}

const projection = homography(corners);
export const BELT = Object.freeze({
  width: 941, height: 1672,
  corners, projection,
  centerlineV: .54,
  // A physical circle has different UV radii because the belt is 2.5 times
  // longer in its travel direction than it is deep.
  physicalAspect: 2.5,
  coinRadiusU: .092,
  coinRadiusV: .23,
  slotStep: .23,
});

export function beltPoint(u, v = BELT.centerlineV) {
  const h = projection, w = h.g * u + h.h * v + 1;
  return {
    x: (h.a * u + h.b * v + h.c) / w,
    y: (h.d * u + h.e * v + h.f) / w,
  };
}

// Returns the local affine map of a UNIT circle onto the photographed plane.
// Canvas usage: ctx.transform(p.a,p.b,p.c,p.d,p.x,p.y); draw radius-1 circle.
// Use both basis vectors; rotation + vertical squashing loses the plane shear.
export function beltCoin(u, v = BELT.centerlineV) {
  const h = projection, w = h.g * u + h.h * v + 1;
  const point = beltPoint(u, v);
  const a = (h.a - point.x * h.g) / w * BELT.coinRadiusU;
  const b = (h.d - point.y * h.g) / w * BELT.coinRadiusU;
  const c = (h.b - point.x * h.h) / w * BELT.coinRadiusV;
  const d = (h.e - point.y * h.h) / w * BELT.coinRadiusV;
  return {
    ...point, u, v, a, b, c, d,
    // Compatibility measurements only; a/b/c/d are the authoritative shape.
    rx: Math.hypot(a, b), ry: Math.hypot(c, d),
    angle: Math.atan2(b, a),
    radiusU: BELT.coinRadiusU, radiusV: BELT.coinRadiusV,
  };
}

export const BELT_SLOTS = Object.freeze(
  Array.from({ length: 4 }, (_, index) => Object.freeze(beltCoin(.15 + index * BELT.slotStep))),
);
export const BELT_LOAD = BELT_SLOTS[0];
// The last stable full-coin berth. Move beyond this berth continuously onto
// CHUTE_PATH, rather than deleting the workpiece when it reaches the belt end.
export const BELT_DISCHARGE = BELT_SLOTS.at(-1);

// Contact-plane landmarks for the v3 right end roller, sloping steel chute,
// and receiving tray. The main scene owns timing, height and collision order.
export const CHUTE_PATH = Object.freeze([
  Object.freeze({ ...beltCoin(1), phase: 'roller' }),
  Object.freeze({ x: 738, y: 1142, phase: 'chute-entry' }),
  Object.freeze({ x: 784, y: 1221, phase: 'chute-lip' }),
  Object.freeze({ x: 774, y: 1281, phase: 'collector' }),
]);
export const COLLECTOR_POINT = CHUTE_PATH.at(-1);
