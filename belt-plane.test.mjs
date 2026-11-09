import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BELT, BELT_SLOTS, BELT_LOAD, BELT_DISCHARGE, CHUTE_PATH,
  beltPoint, beltCoin,
} from './belt-plane.js';

const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

function insideBelt(point) {
  const polygon = Object.values(BELT.corners);
  return polygon.every((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    return (end.x - start.x) * (point.y - start.y)
      - (end.y - start.y) * (point.x - start.x) >= -1e-7;
  });
}

test('homography maps the unit square to the usable v3 cloth corners', () => {
  for (const [u, v, name] of [
    [0, 0, 'rearLeft'], [1, 0, 'rearRight'],
    [1, 1, 'frontRight'], [0, 1, 'frontLeft'],
  ]) {
    const point = beltPoint(u, v), expected = BELT.corners[name];
    close(point.x, expected.x); close(point.y, expected.y);
  }
});

test('every berth shares a physical centerline and equal travel step', () => {
  const start = beltPoint(0), end = beltPoint(1);
  assert.equal(BELT_SLOTS.length, 4);
  for (const [index, coin] of BELT_SLOTS.entries()) {
    close(coin.v, BELT.centerlineV);
    const center = beltPoint(coin.u, coin.v);
    close(coin.x, center.x); close(coin.y, center.y);
    close((end.x - start.x) * (coin.y - start.y)
      - (end.y - start.y) * (coin.x - start.x), 0, 1e-7);
    if (index) close(coin.u - BELT_SLOTS[index - 1].u, BELT.slotStep);
  }
  assert.equal(BELT_LOAD, BELT_SLOTS[0]);
  assert.equal(BELT_DISCHARGE, BELT_SLOTS[3]);
});

test('all complete circular pieces and their affine rendering stay on cloth', () => {
  for (const coin of BELT_SLOTS) {
    assert.ok(coin.u - BELT.coinRadiusU > 0);
    assert.ok(coin.u + BELT.coinRadiusU < 1);
    assert.ok(coin.v - BELT.coinRadiusV > 0);
    assert.ok(coin.v + BELT.coinRadiusV < 1);
    for (let index = 0; index < 360; index++) {
      const theta = index / 180 * Math.PI, x = Math.cos(theta), y = Math.sin(theta);
      assert.ok(insideBelt(beltPoint(coin.u + BELT.coinRadiusU * x,
        coin.v + BELT.coinRadiusV * y)));
      assert.ok(insideBelt({ x: coin.x + coin.a * x + coin.c * y,
        y: coin.y + coin.b * x + coin.d * y }));
    }
  }
});

test('coin basis follows the plane instead of applying a positive rotation', () => {
  for (const coin of BELT_SLOTS) {
    assert.ok(coin.a > 0 && coin.b < 0 && coin.d > 0);
    assert.ok(coin.angle < 0);
    assert.ok(coin.a * coin.d - coin.b * coin.c > 0);
    const nearby = beltPoint(coin.u + 1e-5, coin.v);
    close((nearby.y - coin.y) / (nearby.x - coin.x), coin.b / coin.a, 1e-7);
    close(BELT.coinRadiusV / BELT.coinRadiusU, BELT.physicalAspect);
  }
});

test('one shared belt increment continuously advances every workpiece', () => {
  for (const coin of BELT_SLOTS.slice(0, -1)) {
    const next = beltCoin(coin.u + BELT.slotStep);
    const slot = BELT_SLOTS[BELT_SLOTS.indexOf(coin) + 1];
    for (const key of ['x', 'y', 'a', 'b', 'c', 'd']) close(next[key], slot[key]);
  }
  const roller = beltPoint(1);
  close(CHUTE_PATH[0].x, roller.x); close(CHUTE_PATH[0].y, roller.y);
  assert.ok(CHUTE_PATH[1].x > roller.x);
  assert.ok(CHUTE_PATH.at(-1).y > CHUTE_PATH[0].y);
});
