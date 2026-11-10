import test from 'node:test';
import assert from 'node:assert/strict';
import { getHandlingState, HANDLING_PHASES, HANDLING_TIMING as H } from './handling-cycle.js';

// Deliberately unrelated to the source image: the clock must not bake in a
// particular camera projection or a particular machine's geometry.
const points = {
  source: { x: 110, y: 220 },
  fixture: { x: 480, y: 440 },
  beltLoad: { x: 350, y: 630 },
  park: { x: 200, y: 180 },
};
const sample = t => getHandlingState(t, points);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.lift ?? 0) - (b.lift ?? 0));
const atContact = (state, point) => assert.ok(distance(state.armTarget, { ...point, lift: 0 }) < 1e-6);

test('one continuous 18 second cycle reserves 4.5 seconds for the finished portrait', () => {
  assert.equal(H.total, 18);
  assert.ok(H.scanEnd > H.scanStart);
  assert.equal(H.displayEnd - H.displayStart, 4.5);
  assert.equal(H.displayStart, H.headReturnEnd);
  assert.equal(H.displayEnd, H.unclampStart);
  assert.ok(H.fixtureGrip > H.unclampEnd);
  assert.equal(HANDLING_PHASES[0].start, 0);
  assert.equal(HANDLING_PHASES.at(-1).end, H.total);
  for (const phase of HANDLING_PHASES) assert.ok(phase.end > phase.start, `${phase.name} has no visible duration`);
  for (let i = 1; i < HANDLING_PHASES.length; i++) {
    assert.equal(HANDLING_PHASES[i - 1].end, HANDLING_PHASES[i].start);
  }
});

test('the finished portrait is stationary with the laser parked during the display dwell', () => {
  for (let t = H.displayStart; t < H.displayEnd; t += .01) {
    const s = sample(t);
    assert.equal(s.phase, 'show-finished');
    assert.equal(s.partLocation, 'fixture');
    assert.equal(s.clamped, 1);
    assert.equal(s.carried, null);
    assert.equal(s.vacuum, false);
    assert.deepEqual(s.armTarget, { ...points.park, lift: 40 });
    assert.equal(s.beltProgress, 0);
    assert.equal(s.chuteProgress, 0);
  }
});

test('one and only one source, held, fixture or belt workpiece exists', () => {
  for (let t = 0; t <= H.total; t += .003) {
    const s = sample(t);
    const source = !s.sourceConsumed;
    const held = s.carried !== null;
    assert.equal(Number(source) + Number(held) + Number(s.fixtureOccupied) + Number(s.placedOnBelt), 1, `stock conservation at ${t}`);
    assert.equal(s.partLocation === 'source', source);
    assert.equal(s.partLocation === 'gripper', held);
    assert.equal(s.partLocation === 'fixture', s.fixtureOccupied);
    assert.equal(s.partLocation === 'belt', s.placedOnBelt);
    assert.equal(s.vacuum, held, `unsupported workpiece at ${t}`);
  }
});

test('vacuum pickup and release occur only against a supporting surface', () => {
  for (const [time, point, location, vacuum] of [
    [H.sourceGrip, points.source, 'gripper', true],
    [H.fixtureRelease, points.fixture, 'fixture', false],
    [H.fixtureGrip, points.fixture, 'gripper', true],
    [H.beltRelease, points.beltLoad, 'belt', false],
  ]) {
    const s = sample(time);
    atContact(s, point);
    assert.equal(s.partLocation, location);
    assert.equal(s.vacuum, vacuum);
  }
  assert.equal(sample(H.sourceGrip).carried, 'blank');
  assert.equal(sample(H.fixtureGrip).carried, 'finished');
});

test('part lifts after the grip dwell and arm retracts after release dwell', () => {
  for (const [grip, lift, point] of [
    [H.sourceGrip, H.sourceLiftStart, points.source],
    [H.fixtureGrip, H.fixtureLiftStart, points.fixture],
  ]) {
    const holding = sample((grip + lift) / 2);
    atContact(holding, point);
    assert.equal(holding.vacuum, true);
    assert.ok(sample(lift + .15).armTarget.lift > 0);
  }
  for (const [release, point] of [[H.fixtureRelease, points.fixture], [H.beltRelease, points.beltLoad]]) {
    const released = sample(release + .1);
    atContact(released, point);
    assert.equal(released.vacuum, false);
    assert.equal(released.carried, null);
  }
});

test('all arm targets are continuous across every mechanical phase boundary', () => {
  for (const { start, end } of HANDLING_PHASES) {
    for (const time of [start, end]) {
      const before = sample(time - 1e-6).armTarget;
      const after = sample(time + 1e-6).armTarget;
      assert.ok(distance(before, after) < .001, `arm teleport at ${time}`);
    }
  }
});

test('loaded lateral transfers stay elevated and retain vacuum throughout', () => {
  for (const name of ['transfer-to-fixture', 'transfer-to-belt']) {
    const { start, end } = HANDLING_PHASES.find(phase => phase.name === name);
    for (let t = start; t < end; t += .005) {
      const s = sample(t);
      assert.equal(s.armTarget.lift, 40);
      assert.equal(s.vacuum, true);
      assert.equal(s.partLocation, 'gripper');
    }
  }
});

test('arm stays parked while jaws and laser head perform the print', () => {
  for (let t = H.clampStart; t <= H.unclampEnd; t += .003) {
    const s = sample(t);
    assert.deepEqual(s.armTarget, { ...points.park, lift: 40 });
    assert.equal(s.fixtureOccupied, true);
    assert.equal(s.vacuum, false);
    if (t >= H.scanStart && t <= H.scanEnd) assert.equal(s.clamped, 1);
  }
  assert.equal(sample(H.unclampEnd).clamped, 0);
  assert.equal(sample(H.fixtureGrip).clamped, 0);
});

test('belt and chute move only after the placed workpiece and tool are clear', () => {
  for (let t = 0; t < H.beltIndexStart; t += .003) assert.equal(sample(t).beltProgress, 0);
  let belt = 0, chute = 0;
  for (let t = H.beltIndexStart; t <= H.total; t += .003) {
    const s = sample(t);
    assert.equal(s.placedOnBelt, true);
    assert.equal(s.carried, null);
    assert.deepEqual(s.armTarget, { ...points.park, lift: 40 });
    assert.ok(s.beltProgress >= belt);
    assert.ok(s.chuteProgress >= chute);
    belt = s.beltProgress;
    chute = s.chuteProgress;
  }
  const final = sample(H.total);
  assert.equal(final.beltProgress, 1);
  assert.equal(final.chuteProgress, 1);
  assert.equal(final.partLocation, 'belt');
});

test('sampling is deterministic, clamps at endpoints and leaves points untouched', () => {
  const saved = JSON.stringify(points);
  assert.deepEqual(sample(-20), sample(0));
  assert.deepEqual(sample(H.total + 10), sample(H.total));
  assert.deepEqual(sample(NaN), sample(0));
  assert.deepEqual(sample(7.25), sample(7.25));
  assert.equal(JSON.stringify(points), saved);
});
