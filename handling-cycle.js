// One workpiece follows source -> suction cup -> fixture -> suction cup -> belt.
// Coordinates are contact points in the photo plane. A positive lift is drawn
// upwards by the renderer; x/y keep the workpiece's supported contact position.
export const HANDLING_LIFT = 40;

export const HANDLING_TIMING = Object.freeze({
  sourceGrip: .95,
  sourceLiftStart: 1.15,
  fixtureRelease: 2.70,
  feedEnd: 3.90,
  clampStart: 3.90,
  clampEnd: 4.20,
  headLoadStart: 4.20,
  loadEnd: 4.65,
  scanStart: 4.65,
  scanEnd: 8.65,
  retractEnd: 8.95,
  headReturnEnd: 9.30,
  returnEnd: 9.30,
  unclampStart: 9.30,
  unclampEnd: 9.60,
  fixtureGrip: 10.55,
  fixtureLiftStart: 10.75,
  beltRelease: 12.45,
  handoffEnd: 13.65,
  beltIndexStart: 13.65,
  indexEnd: 14.85,
  chuteStart: 14.45,
  chuteEnd: 15.65,
  total: 16.20,
});

// Each segment ends exactly where the next one starts. Grip/release dwell
// segments take place with the suction cup resting on a supported workpiece.
const segments = [
  ['approach-source', 0, .60, 'park', 40, 'source', 40],
  ['lower-source', .60, .95, 'source', 40, 'source', 0],
  ['grip-source', .95, 1.15, 'source', 0, 'source', 0],
  ['lift-source', 1.15, 1.50, 'source', 0, 'source', 40],
  ['transfer-to-fixture', 1.50, 2.35, 'source', 40, 'fixture', 40],
  ['lower-to-fixture', 2.35, 2.70, 'fixture', 40, 'fixture', 0],
  ['release-fixture', 2.70, 2.90, 'fixture', 0, 'fixture', 0],
  ['retract-from-fixture', 2.90, 3.25, 'fixture', 0, 'fixture', 40],
  ['park-for-print', 3.25, 3.90, 'fixture', 40, 'park', 40],
  ['clamp', 3.90, 4.20, 'park', 40, 'park', 40],
  ['head-load', 4.20, 4.65, 'park', 40, 'park', 40],
  ['scan', 4.65, 8.65, 'park', 40, 'park', 40],
  ['head-retract', 8.65, 8.95, 'park', 40, 'park', 40],
  ['head-return', 8.95, 9.30, 'park', 40, 'park', 40],
  ['unclamp', 9.30, 9.60, 'park', 40, 'park', 40],
  ['approach-fixture', 9.60, 10.20, 'park', 40, 'fixture', 40],
  ['lower-for-pickup', 10.20, 10.55, 'fixture', 40, 'fixture', 0],
  ['grip-finished', 10.55, 10.75, 'fixture', 0, 'fixture', 0],
  ['lift-finished', 10.75, 11.10, 'fixture', 0, 'fixture', 40],
  ['transfer-to-belt', 11.10, 12.10, 'fixture', 40, 'beltLoad', 40],
  ['lower-to-belt', 12.10, 12.45, 'beltLoad', 40, 'beltLoad', 0],
  ['release-belt', 12.45, 12.65, 'beltLoad', 0, 'beltLoad', 0],
  ['retract-from-belt', 12.65, 13.00, 'beltLoad', 0, 'beltLoad', 40],
  ['park-after-unload', 13.00, 13.65, 'beltLoad', 40, 'park', 40],
  ['belt-index', 13.65, 14.85, 'park', 40, 'park', 40],
  ['chute-delivery', 14.85, 15.65, 'park', 40, 'park', 40],
  ['settle', 15.65, 16.20, 'park', 40, 'park', 40],
];

export const HANDLING_PHASES = Object.freeze(segments.map(
  ([name, start, end]) => Object.freeze({ name, start, end }),
));

const DEFAULT_POINTS = Object.freeze({
  source: Object.freeze({ x: 239, y: 964 }),
  fixture: Object.freeze({ x: 535, y: 892 }),
  beltLoad: Object.freeze({ x: 305.55, y: 1090.60 }),
  park: Object.freeze({ x: 360, y: 900 }),
});
const clamp = n => Math.min(1, Math.max(0, n));
const ease = n => { const u = clamp(n); return u * u * u * (u * (u * 6 - 15) + 10); };
const progress = (t, start, end) => ease((t - start) / (end - start));
const mix = (a, b, u) => a + (b - a) * u;

/**
 * Sample a single clamped production cycle; callers decide when to start the
 * next cycle and persist the collector's contents. The chute carries the OLD
 * rightmost belt workpiece, not the freshly placed workpiece tracked here.
 * `clamped` is a 0..1 jaw animation value; all other occupancy fields are bools.
 */
export function getHandlingState(elapsed, points = {}) {
  const t = Number.isFinite(elapsed) ? Math.min(HANDLING_TIMING.total, Math.max(0, elapsed)) : 0;
  const contact = {};
  for (const key of Object.keys(DEFAULT_POINTS)) {
    const point = points[key];
    contact[key] = point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? point : DEFAULT_POINTS[key];
  }
  const segment = segments.find(([, , end]) => t < end) ?? segments[segments.length - 1];
  const [phase, start, end, from, fromLift, to, toLift] = segment;
  const u = progress(t, start, end);
  const armTarget = {
    x: mix(contact[from].x, contact[to].x, u),
    y: mix(contact[from].y, contact[to].y, u),
    lift: mix(fromLift, toLift, u),
  };
  const h = HANDLING_TIMING;
  const carryingBlank = t >= h.sourceGrip && t < h.fixtureRelease;
  const carryingFinished = t >= h.fixtureGrip && t < h.beltRelease;
  const carried = carryingBlank ? 'blank' : carryingFinished ? 'finished' : null;
  const partLocation = t < h.sourceGrip ? 'source'
    : carried ? 'gripper'
    : t < h.fixtureGrip ? 'fixture' : 'belt';
  const clamped = t < h.unclampStart
    ? progress(t, h.clampStart, h.clampEnd)
    : 1 - progress(t, h.unclampStart, h.unclampEnd);
  return {
    phase,
    armTarget,
    vacuum: carried !== null,
    carried,
    partLocation,
    fixtureOccupied: partLocation === 'fixture',
    sourceConsumed: t >= h.sourceGrip,
    placedOnBelt: t >= h.beltRelease,
    beltProgress: progress(t, h.beltIndexStart, h.indexEnd),
    chuteProgress: progress(t, h.chuteStart, h.chuteEnd),
    clamped,
  };
}
