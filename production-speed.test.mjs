import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEED, SPEED_OPTIONS, normalizeSpeed, cycleDuration, advanceProductionTime } from './production-speed.js';
import { HANDLING_PHASES, HANDLING_TIMING } from './handling-cycle.js';

test('only the five supported speed choices persist and the default is 1.8x', () => {
  assert.equal(DEFAULT_SPEED, 1.8);
  assert.deepEqual(SPEED_OPTIONS, [1, 1.5, 1.8, 2, 2.5]);
  for (const speed of SPEED_OPTIONS) assert.equal(normalizeSpeed(String(speed)), speed);
  for (const value of [null, '', undefined, 0, -1, 3, Infinity, 'fast', {}]) {
    assert.equal(normalizeSpeed(value), DEFAULT_SPEED);
  }
  assert.equal(cycleDuration(HANDLING_TIMING.total), HANDLING_TIMING.total / DEFAULT_SPEED);
  assert.equal(cycleDuration(HANDLING_TIMING.total), 10);
  assert.equal(cycleDuration(HANDLING_TIMING.displayEnd - HANDLING_TIMING.displayStart), 2.5);
  assert.equal(cycleDuration(HANDLING_TIMING.total, 1), HANDLING_TIMING.total);
  assert.equal(cycleDuration(18), 10);
  assert.ok(Math.abs(cycleDuration(18, 2.5) - 7.2) < 1e-10);
});

test('changing speed keeps the current position continuous and pause holds it', () => {
  let elapsed = 0;
  for (let frame = 0; frame < 120; frame++) elapsed = advanceProductionTime(elapsed, 1 / 60, 1);
  assert.ok(Math.abs(elapsed - 2) < 1e-10);
  const beforeChange = elapsed;
  assert.equal(advanceProductionTime(elapsed, 0, 2), beforeChange);
  for (let frame = 0; frame < 120; frame++) elapsed = advanceProductionTime(elapsed, 1 / 60, 2);
  assert.ok(Math.abs(elapsed - 6) < 1e-10);
  assert.equal(advanceProductionTime(elapsed, 100, 2.5, true), elapsed);
});

test('a stalled frame cannot skip an entire mechanical phase', () => {
  const shortestPhase = Math.min(...HANDLING_PHASES.map(p => p.end - p.start));
  for (const speed of SPEED_OPTIONS) {
    const next = advanceProductionTime(0, 100, speed);
    assert.ok(next > 0 && next < shortestPhase);
    assert.equal(advanceProductionTime(4, -1, speed), 4);
  }
});
