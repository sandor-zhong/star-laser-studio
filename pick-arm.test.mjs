import test from 'node:test';
import assert from 'node:assert/strict';
import { solveArm, drawPickArm, projectArmPoint, unprojectArmPoint, ARM_GEOMETRY as G } from './pick-arm.js';
import { getHandlingState, HANDLING_TIMING as H } from './handling-cycle.js';

const points = {
  source: { x: 239, y: 964 }, fixture: { x: 530, y: 891 },
  beltLoad: { x: 305, y: 1090 }, park: { x: 360, y: 900 },
};
const length = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (value, expected, tolerance = 1e-7) => assert.ok(Math.abs(value - expected) < tolerance, `${value} != ${expected}`);

test('source, fixture, belt and parking positions have exact rigid world-plane link lengths', () => {
  for (const target of Object.values(points)) {
    const pose = solveArm(target);
    assert.equal(pose.reachable, true);
    near(length(pose.world.shoulder, pose.world.elbow), G.upperLength);
    near(length(pose.world.elbow, pose.world.wrist), G.forearmLength);
    near(pose.tip.x, target.x);
    near(pose.tip.y, target.y);
  }
});

test('the selected elbow branch stays in front of the rear crossbeam', () => {
  for (const [name, target] of Object.entries(points)) {
    const { elbow, world } = solveArm(target);
    const cross=world.wrist.x*world.elbow.y-world.wrist.y*world.elbow.x;
    assert.ok(cross<0, `${name} selected wrong elbow branch`);
    assert.ok(elbow.x>G.shoulder.x&&elbow.y>655, `${name} collides with rear frame`);
  }
});

test('lifting retracts the vertical tool without moving the horizontal joints', () => {
  for (const point of Object.values(points)) {
    const down = solveArm({ ...point, lift: 0 });
    for (const lift of [10, 25, 40]) {
      const up = solveArm({ ...point, lift });
      assert.deepEqual(up.shoulder, down.shoulder);
      assert.deepEqual(up.elbow, down.elbow);
      assert.deepEqual(up.wrist, down.wrist);
      assert.deepEqual(up.world, down.world);
      near(up.tip.x, point.x);
      near(up.tip.y, point.y - lift);
    }
  }
});

test('every production stage stays reachable with a finite contact-aligned suction tip', () => {
  let previousElbow;
  for (let t = 0; t <= H.total; t += .003) {
    const target = getHandlingState(t, points).armTarget;
    const pose = solveArm(target);
    assert.equal(pose.reachable, true, `unreachable at ${t}`);
    for (const point of [pose.shoulder, pose.elbow, pose.wrist, pose.tip]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
    near(length(pose.world.shoulder, pose.world.elbow), G.upperLength);
    near(length(pose.world.elbow, pose.world.wrist), G.forearmLength);
    assert.ok(pose.elbow.y > 655, `rear gantry collision at ${t}`);
    for (const point of Object.values(pose.world)) {
      assert.ok(1 + G.depthPerspective * point.y > 0, `perspective plane crosses horizon at ${t}`);
    }
    if (previousElbow) assert.ok(length(previousElbow, pose.elbow) < 4, `elbow branch flips at ${t}`);
    previousElbow = pose.elbow;
    near(pose.tip.x, target.x);
    near(pose.tip.y, target.y - target.lift);
  }
});

test('unreachable and malformed input stays finite while preserving physical lengths', () => {
  for (const target of [null, {}, { x: NaN, y: Infinity },
    { x: 5000, y: 5000 }, { x: G.shoulder.x, y: G.shoulder.y + G.spindleHeight }]) {
    const pose = solveArm(target);
    near(length(pose.world.shoulder, pose.world.elbow), G.upperLength);
    near(length(pose.world.elbow, pose.world.wrist), G.forearmLength);
    assert.ok(Number.isFinite(pose.tip.x) && Number.isFinite(pose.tip.y));
  }
  assert.equal(solveArm({ x: 5000, y: 5000 }).reachable, false);
});

test('projection compresses depth while preserving an invertible world plane', () => {
  for (const world of [{ x: 100, y: -100 }, { x: 180, y: 0 }, { x: 40, y: 180 }]) {
    const screen = projectArmPoint(world), reconstructed = unprojectArmPoint(screen);
    near(reconstructed.x, world.x);
    near(reconstructed.y, world.y);
  }
  const projectedLengths = Object.values(points).map(target => {
    const pose = solveArm(target);
    return length(pose.elbow, pose.wrist);
  });
  assert.ok(Math.max(...projectedLengths) - Math.min(...projectedLengths) > 20,
    'screen length must vary with orientation instead of stretching a fixed 172px link');
});

test('drawing balances all Canvas saves and returns the same physical contact point', () => {
  let depth = 0;
  const gradient = { addColorStop() {} };
  const methods = ['translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo',
    'closePath', 'fill', 'stroke', 'clip', 'drawImage', 'ellipse', 'fillRect',
    'bezierCurveTo', 'quadraticCurveTo', 'arc'];
  const ctx = {
    save() { depth++; }, restore() { depth--; assert.ok(depth >= 0); },
    createLinearGradient(...args) { assert.ok(args.every(Number.isFinite)); return gradient; },
  };
  for (const name of methods) ctx[name] = (...args) => {
    for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${name} received nonfinite data`);
  };
  const target = { ...points.beltLoad, lift: 40 };
  const rendered = drawPickArm(ctx, {}, target, { vacuum: true });
  assert.equal(depth, 0);
  assert.deepEqual(rendered, solveArm(target));
});
