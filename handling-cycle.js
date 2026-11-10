// One workpiece follows source -> suction cup -> fixture -> suction cup -> belt.
// Coordinates are contact points in the photo plane. A positive lift is drawn
// upwards by the renderer; x/y keep the workpiece's supported contact position.
export const HANDLING_LIFT = 40;

// Each segment ends exactly where the next one starts. Grip/release dwell
// segments take place with the suction cup resting on a supported workpiece.
const segments = [
  ['approach-source', 0, .45, 'park', 40, 'source', 40],
  ['lower-source', .45, .75, 'source', 40, 'source', 0],
  ['grip-source', .75, .90, 'source', 0, 'source', 0],
  ['lift-source', .90, 1.20, 'source', 0, 'source', 40],
  ['transfer-to-fixture', 1.20, 1.90, 'source', 40, 'fixture', 40],
  ['lower-to-fixture', 1.90, 2.20, 'fixture', 40, 'fixture', 0],
  ['release-fixture', 2.20, 2.35, 'fixture', 0, 'fixture', 0],
  ['retract-from-fixture', 2.35, 2.65, 'fixture', 0, 'fixture', 40],
  ['park-for-print', 2.65, 3.20, 'fixture', 40, 'park', 40],
  ['clamp', 3.20, 3.45, 'park', 40, 'park', 40],
  ['head-load', 3.45, 3.85, 'park', 40, 'park', 40],
  ['scan', 3.85, 7.45, 'park', 40, 'park', 40],
  ['head-retract', 7.45, 7.70, 'park', 40, 'park', 40],
  ['head-return', 7.70, 8.00, 'park', 40, 'park', 40],
  ['show-finished', 8.00, 12.50, 'park', 40, 'park', 40],
  ['unclamp', 12.50, 12.75, 'park', 40, 'park', 40],
  ['approach-fixture', 12.75, 13.20, 'park', 40, 'fixture', 40],
  ['lower-for-pickup', 13.20, 13.50, 'fixture', 40, 'fixture', 0],
  ['grip-finished', 13.50, 13.65, 'fixture', 0, 'fixture', 0],
  ['lift-finished', 13.65, 13.95, 'fixture', 0, 'fixture', 40],
  ['transfer-to-belt', 13.95, 14.70, 'fixture', 40, 'beltLoad', 40],
  ['lower-to-belt', 14.70, 15.00, 'beltLoad', 40, 'beltLoad', 0],
  ['release-belt', 15.00, 15.15, 'beltLoad', 0, 'beltLoad', 0],
  ['retract-from-belt', 15.15, 15.45, 'beltLoad', 0, 'beltLoad', 40],
  ['park-after-unload', 15.45, 16.00, 'beltLoad', 40, 'park', 40],
  ['belt-index', 16.00, 16.90, 'park', 40, 'park', 40],
  ['chute-delivery', 16.90, 17.50, 'park', 40, 'park', 40],
  ['settle', 17.50, 18.00, 'park', 40, 'park', 40],
];

export const HANDLING_PHASES = Object.freeze(segments.map(
  ([name, start, end]) => Object.freeze({ name, start, end }),
));

// Public event times are derived from the same segments used for arm poses,
// so camera, laser, vacuum and transport cannot drift onto separate clocks.
const phaseStart = name => HANDLING_PHASES.find(p => p.name === name).start;
const phaseEnd = name => HANDLING_PHASES.find(p => p.name === name).end;
export const HANDLING_TIMING = Object.freeze({
  sourceGrip: phaseStart('grip-source'),
  sourceLiftStart: phaseStart('lift-source'),
  fixtureRelease: phaseStart('release-fixture'),
  feedEnd: phaseStart('clamp'),
  clampStart: phaseStart('clamp'),
  clampEnd: phaseEnd('clamp'),
  headLoadStart: phaseStart('head-load'),
  loadEnd: phaseStart('scan'),
  scanStart: phaseStart('scan'),
  scanEnd: phaseEnd('scan'),
  retractEnd: phaseEnd('head-retract'),
  headReturnEnd: phaseEnd('head-return'),
  returnEnd: phaseEnd('head-return'),
  displayStart: phaseStart('show-finished'),
  displayEnd: phaseEnd('show-finished'),
  unclampStart: phaseStart('unclamp'),
  unclampEnd: phaseEnd('unclamp'),
  fixtureGrip: phaseStart('grip-finished'),
  fixtureLiftStart: phaseStart('lift-finished'),
  beltRelease: phaseStart('release-belt'),
  handoffEnd: phaseEnd('park-after-unload'),
  beltIndexStart: phaseStart('belt-index'),
  indexEnd: phaseEnd('belt-index'),
  chuteStart: phaseEnd('belt-index') - .3,
  chuteEnd: phaseEnd('chute-delivery'),
  total: phaseEnd('settle'),
});

const DEFAULT_POINTS = Object.freeze({
  source: Object.freeze({ x: 239, y: 964 }),
  fixture: Object.freeze({ x: 530, y: 891 }),
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
 * `clamped` is the 0..1 fixture hold/vacuum value; the vacuum nest supports the
 * token underneath and has no fingers moving over its face.
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
