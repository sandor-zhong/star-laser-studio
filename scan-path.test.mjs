import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getToolPose, getProductionState, getRasterSample, getImpact,
  PRINT_SURFACE, LASER_ORIGIN, TOOL_TIMING as T, TOOL_PARK, RASTER_ROWS,
} from './scan-path.js';
import { HANDLING_TIMING, HANDLING_PHASES } from './handling-cycle.js';

const epsilon = 1e-6;
const parked = pose => {
  assert.equal(pose.x, TOOL_PARK.x);
  assert.equal(pose.y, TOOL_PARK.y);
  assert.equal(pose.lift, TOOL_PARK.lift);
  assert.equal(pose.laser, false);
};

test('laser and handling share the 16.2 second clock and four second raster window', () => {
  assert.equal(T, HANDLING_TIMING);
  assert.equal(T.total, 16.2);
  assert.ok(Math.abs(T.scanEnd - T.scanStart - 4) < epsilon);
  assert.ok(T.headLoadStart >= T.clampEnd);
  assert.ok(T.headReturnEnd <= T.unclampStart);
  assert.equal(RASTER_ROWS, 14);
});

test('illuminated impacts use the current laser origin and stay inside the stock', () => {
  const p = PRINT_SURFACE, c = Math.cos(p.angle), s = Math.sin(p.angle);
  let illuminated = 0;
  for (let t = 0; t <= T.total; t += .001) {
    const pose = getToolPose(t);
    if (!pose.laser) continue;
    illuminated++;
    const impact = { x: LASER_ORIGIN.x + pose.x, y: LASER_ORIGIN.y + pose.y };
    const expected = getImpact(pose.raster);
    assert.ok(Math.hypot(impact.x - expected.x, impact.y - expected.y) < epsilon);
    const dx = impact.x - p.x, dy = impact.y - p.y;
    const u = (dx * c + dy * s) / p.rx, v = (-dx * s + dy * c) / p.ry;
    assert.ok(u * u + v * v <= 1 + epsilon, `outside stock at ${t}`);
    assert.equal(pose.lift, 0);
    assert.ok(t >= T.scanStart && t < T.scanEnd);
  }
  assert.ok(illuminated > 3000, 'test must exercise the illuminated raster');
});

test('fourteen alternating rows advance in order with the beam off during row feed', () => {
  const duration = T.scanEnd - T.scanStart;
  let previousV = -Infinity;
  for (let row = 0; row < RASTER_ROWS; row++) {
    const sample = getRasterSample((row + .42) / RASTER_ROWS);
    const pose = getToolPose(T.scanStart + duration * (row + .42) / RASTER_ROWS);
    assert.equal(sample.row, row);
    assert.equal(pose.raster.row, row);
    assert.equal(sample.direction, row % 2 === 0 ? 1 : -1);
    assert.equal(pose.laser, true);
    assert.ok(sample.v > previousV);
    previousV = sample.v;
    const beforeStroke = getRasterSample((row + .1) / RASTER_ROWS);
    const afterStroke = getRasterSample((row + .7) / RASTER_ROWS);
    assert.ok((afterStroke.u - beforeStroke.u) * sample.direction > 0);
    const turning = getToolPose(T.scanStart + duration * (row + .92) / RASTER_ROWS);
    assert.equal(turning.raster.rowComplete, true);
    assert.equal(turning.laser, false);
    if (row < RASTER_ROWS - 1) {
      const before = getImpact(getRasterSample((row + 1 - 1e-7) / RASTER_ROWS));
      const after = getImpact(getRasterSample((row + 1 + 1e-7) / RASTER_ROWS));
      assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < .001);
    }
  }
  assert.equal(getRasterSample(1).complete, true);
  assert.equal(getRasterSample(1).laser, false);
});

test('image reveal progresses only during the scan and remains complete through unloading', () => {
  let previous = 0;
  for (let t = 0; t <= T.total; t += .002) {
    const pose = getToolPose(t);
    assert.ok(pose.reveal >= previous && pose.reveal >= 0 && pose.reveal <= 1);
    previous = pose.reveal;
    if (t < T.scanStart) assert.equal(pose.reveal, 0);
    if (t >= T.scanEnd) assert.equal(pose.reveal, 1);
  }
  assert.equal(getToolPose(T.scanStart).reveal, 0);
  assert.equal(getToolPose(T.scanEnd).reveal, 1);
});

test('tool motion remains continuous across all handling and laser phase boundaries', () => {
  const boundaries = new Set([...Object.values(T), ...HANDLING_PHASES.flatMap(p => [p.start, p.end])]);
  for (const boundary of boundaries) {
    const before = getToolPose(boundary - 1e-6), after = getToolPose(boundary + 1e-6);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y, after.lift - before.lift) < .002, `jump at ${boundary}`);
  }
});

test('stock is clamped and the handling arm is clear whenever the laser can fire', () => {
  for (let t = 0; t <= T.total; t += .002) {
    const state = getProductionState(t);
    if (!state.pose.laser) continue;
    assert.equal(state.clamped, 1);
    assert.equal(state.fixtureOccupied, true);
    assert.equal(state.partLocation, 'fixture');
    assert.equal(state.carried, null);
    assert.equal(state.vacuum, false);
    assert.equal(state.phase, 'scan');
    assert.equal(state.placedOnBelt, false);
    assert.equal(state.beltProgress, 0);
  }
});

test('the beam shuts off before lifting and the head returns before the jaws open', () => {
  const end = getToolPose(T.scanEnd);
  assert.equal(end.laser, false);
  assert.equal(end.lift, 0);
  for (let t = T.scanEnd; t < T.retractEnd; t += .001) {
    const state = getProductionState(t);
    assert.equal(state.pose.laser, false);
    assert.equal(state.clamped, 1);
    assert.equal(state.pose.x, end.x);
    assert.equal(state.pose.y, end.y);
    assert.ok(state.pose.lift >= 0);
  }
  assert.equal(getToolPose(T.retractEnd).lift, 80);
  for (let t = T.retractEnd; t < T.headReturnEnd; t += .001) {
    const state = getProductionState(t);
    assert.equal(state.pose.laser, false);
    assert.equal(state.clamped, 1);
  }
  parked(getToolPose(T.headReturnEnd));
  for (let t = T.unclampStart; t < T.unclampEnd; t += .001) {
    const state = getProductionState(t);
    parked(state.pose);
    assert.equal(state.fixtureOccupied, true);
    assert.equal(state.carried, null);
  }
  assert.equal(getProductionState(T.unclampEnd).clamped, 0);
});

test('handling, transport and settle never illuminate the workpiece', () => {
  for (let t = 0; t <= T.total; t += .001) {
    const state = getProductionState(t);
    if (t < T.scanStart || t >= T.scanEnd || state.partLocation !== 'fixture') {
      assert.equal(state.pose.laser, false);
    }
    if (t < T.headLoadStart || t >= T.headReturnEnd) parked(state.pose);
  }
  const final = getProductionState(T.total);
  assert.equal(final.partLocation, 'belt');
  assert.equal(final.placedOnBelt, true);
  assert.equal(final.beltProgress, 1);
  assert.equal(final.chuteProgress, 1);
  assert.equal(final.clamped, 0);
  parked(final.pose);
});
