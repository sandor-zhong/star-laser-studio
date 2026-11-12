// Geometry for the front-facing, upright workcell. All coordinates are in the
// 941 x 1672 scene, before its single output scale to 1080 x 1920.
// u is belt travel towards the viewer; v is across the belt from left to right.
const point = (x, y) => Object.freeze({ x, y });
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low,
  Number.isFinite(value) ? value : low));
const mix = (a, b, p) => a + (b - a) * p;
const smooth = value => { const p = clamp(value); return p ** 3 * (p * (p * 6 - 15) + 10); };

export const BELT_STEP = .28;
export const PRODUCTION_LAYOUT = Object.freeze({
  width: 941, height: 1672,
  source: point(235, 910),
  fixture: point(440, 745),
  fixtureRadius: 125, fixtureVerticalRadius: 125, fixtureGripOffset: 55,
  park: point(265, 795),
  belt: Object.freeze({
    corners: Object.freeze({
      rearLeft: point(325, 953), rearRight: point(578, 953),
      frontRight: point(930, 1700), frontLeft: point(12, 1700),
    }),
    centerlineV: .5, firstSlotU: 0, slotStep: BELT_STEP,
    rearRadius: 80, frontRadius: 135, rearAspect: .52, frontAspect: .80,
  }),
  outlet: Object.freeze({
    lip: point(460, 1405), indexStart: 16, indexEnd: 16.9, chuteEnd: 17.5,
  }),
  collector: Object.freeze({
    center: point(470, 1485), left: 220, right: 725, top: 1400, bottom: 1530,
    columns: Object.freeze([350, 590]), rows: Object.freeze([1485]),
    radius: 105, aspect: .27, layerHeight: 3.2,
  }),
});

function enrichPose(pose) {
  const ry = Math.hypot(pose.b, pose.d);
  const rx = Math.hypot(pose.a, pose.c);
  // This is the true low point of the affine ellipse, including rotated poses.
  const supportX = pose.x + (ry > 0 ? (pose.a * pose.b + pose.c * pose.d) / ry : 0);
  const supportY = pose.y + ry;
  return { ...pose, rx, ry, angle: Math.atan2(pose.b, pose.a),
    supportX, supportY, contact: { x: supportX, y: supportY } };
}

/** A unit-circle affine pose; x/y is always the portrait centre. */
export function uprightPose(x, y, radius = 107, { aspect = 1, angle = 0 } = {}) {
  const r = Math.max(.001, Number.isFinite(radius) ? radius : 107);
  const ratio = Math.max(.001, Number.isFinite(aspect) ? aspect : 1);
  const rotation = Number.isFinite(angle) ? angle : 0;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  return enrichPose({ x, y, a: r * cos, b: r * sin,
    c: -r * ratio * sin, d: r * ratio * cos });
}

/** Equal-diameter raw blanks stacked in a low magazine; index 0 is picked. */
export function feedPose(index = 0) {
  const i = Math.max(0, Number.isFinite(index) ? index : 0);
  return { ...uprightPose(PRODUCTION_LAYOUT.source.x,
    PRODUCTION_LAYOUT.source.y + i * 5, 99, { aspect: .42 }), station: 'source' };
}

export function fixturePose() {
  const L = PRODUCTION_LAYOUT;
  return { ...uprightPose(L.fixture.x, L.fixture.y, L.fixtureRadius,
    { aspect: L.fixtureVerticalRadius / L.fixtureRadius }), station: 'fixture' };
}

/** A supported cloth point. Linear depth matches the fixed world camera. */
export function beltPoint(u, v = PRODUCTION_LAYOUT.belt.centerlineV) {
  const c = PRODUCTION_LAYOUT.belt.corners;
  const depth = Number.isFinite(u) ? u : 0;
  const width = Number.isFinite(v) ? v : PRODUCTION_LAYOUT.belt.centerlineV;
  const leftX = mix(c.rearLeft.x, c.frontLeft.x, depth);
  const leftY = mix(c.rearLeft.y, c.frontLeft.y, depth);
  const rightX = mix(c.rearRight.x, c.frontRight.x, depth);
  const rightY = mix(c.rearRight.y, c.frontRight.y, depth);
  return { x: mix(leftX, rightX, width), y: mix(leftY, rightY, width) };
}

/** Finished disks lie on the cloth in the reference's shallow perspective. */
export function beltPose(u, v = PRODUCTION_LAYOUT.belt.centerlineV) {
  const B = PRODUCTION_LAYOUT.belt;
  const contact = beltPoint(u, v);
  const r = mix(B.rearRadius, B.frontRadius, clamp(u));
  return { ...uprightPose(contact.x, contact.y, r,
    { aspect: mix(B.rearAspect,B.frontAspect,clamp(u)) }), u, v, station: 'belt' };
}

export const BELT_SLOTS = Object.freeze(Array.from({ length: 4 }, (_, index) =>
  Object.freeze(beltPose(PRODUCTION_LAYOUT.belt.firstSlotU + index * BELT_STEP))));
export const BELT_LOAD = BELT_SLOTS[0];

/** Two full-size stacks retain the disk diameter beneath the front roller. */
export function collectorPose(index = 0) {
  const C = PRODUCTION_LAYOUT.collector;
  const i = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
  const cells = C.columns.length * C.rows.length;
  const spot = i % cells, layer = Math.floor(i / cells);
  return { ...uprightPose(C.columns[spot % C.columns.length],
    C.rows[Math.floor(spot / C.columns.length)] - layer * C.layerHeight,
    C.radius, { aspect: C.aspect }), station: 'collector', index: i, layer };
}

function blendPose(from, to, p) {
  return enrichPose(Object.fromEntries(['x', 'y', 'a', 'b', 'c', 'd'].map(key =>
    [key, mix(from[key], to[key], p)])));
}

/**
 * The OLD front belt record keeps ownership through this entire trajectory.
 * At t >= chuteEnd it exactly equals collectorPose(collectorIndex), so the
 * inventory commit can transfer it without changing its position or opacity.
 */
export function getCollectorOutletPose({ t = 0, beltProgress, collectorIndex = 0 } = {}) {
  const L = PRODUCTION_LAYOUT, O = L.outlet;
  const time = Number.isFinite(t) ? t : 0;
  const p = time >= O.indexEnd ? 1 : Number.isFinite(beltProgress)
    ? clamp(beltProgress) : smooth((time - O.indexStart) / (O.indexEnd - O.indexStart));
  const u = L.belt.firstSlotU + 3 * BELT_STEP + p * BELT_STEP;
  const land = collectorPose(collectorIndex);
  const lip = uprightPose(O.lip.x, O.lip.y, 128, { aspect: .48 });
  let pose, phase;
  if (u <= 1 && time < O.indexEnd) {
    pose = beltPose(u); phase = 'belt';
  } else if (time < O.indexEnd) {
    const crossing = (1 - (L.belt.firstSlotU + 3 * BELT_STEP)) / BELT_STEP;
    pose = blendPose(beltPose(1), lip, smooth((p - crossing) / (1 - crossing)));
    phase = 'roller';
  } else {
    const q = clamp((time - O.indexEnd) / (O.chuteEnd - O.indexEnd));
    const touchdown = { ...land, x: O.lip.x };
    // First fall vertically into the receiver, then slide along its floor.
    // Stock never steers sideways while unsupported in the air.
    pose = q >= 1 ? land : q < .68 ? blendPose(lip, touchdown, smooth(q/.68))
      : blendPose(touchdown, land, smooth((q-.68)/.32));
    phase = time >= O.chuteEnd ? 'collector' : 'chute';
  }
  return { ...pose, u, phase, opacity: 1, visible: true,
    landed: time >= O.chuteEnd, collectorIndex };
}

// The front workpiece follows exactly the same belt step as every other piece.
// Its top edge is already below the viewport before commit retires its record.
export function getOutletPose({t=0,beltProgress}={}){
  const O=PRODUCTION_LAYOUT.outlet;
  const progress=Number.isFinite(beltProgress)?clamp(beltProgress):smooth((t-O.indexStart)/(O.indexEnd-O.indexStart));
  const pose=beltPose(BELT_SLOTS[3].u+progress*BELT_STEP);
  const visible=pose.y-pose.ry<=PRODUCTION_LAYOUT.height+1;
  return {...pose,phase:visible?'belt':'exited',visible,opacity:1,landed:false};
}
