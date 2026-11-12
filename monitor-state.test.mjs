import test from 'node:test';
import assert from 'node:assert/strict';
import { getMonitorState } from './monitor-state.js';
import { getHandlingState, HANDLING_TIMING as T } from './handling-cycle.js';
import { getToolPose } from './scan-path.js';

const active = Object.freeze({
  id: 'work-0001', assessment: Object.freeze({ score: 87 }), nickname: '当前观众',
});

test('monitor phases and engraving progress follow the single mechanical clock', () => {
  for (const [time, phase] of [
    [0, 'loading'], [T.scanStart - 1e-6, 'loading'], [T.scanStart, 'engraving'],
    [T.scanEnd, 'finishing'], [T.displayStart, 'rating'], [T.displayEnd, 'unloading'],
    [T.total, 'unloading'],
  ]) assert.equal(getMonitorState(time, active).phase, phase);
  for (let t = 0; t <= T.total; t += .01) {
    const monitor = getMonitorState(t, active);
    assert.equal(monitor.progress, getToolPose(t).reveal);
    assert.equal(monitor.partLocation, getHandlingState(t).partLocation);
    assert.equal(monitor.partId, active.id);
    assert.equal(monitor.nickname, active.nickname);
    assert.equal(monitor.score, t < T.scanStart ? null : active.assessment.score);
    assert.equal(monitor.scoreProgress,monitor.progress);
  }
});

test('the physical token remains the monitor candidate through fixture pickup until belt release', () => {
  for (const [time, location, workpiece, portrait] of [
    [T.sourceGrip - 1e-6, 'source', false, false],
    [T.sourceGrip, 'gripper', true, false],
    [T.fixtureRelease, 'fixture', true, false],
    [(T.scanStart + T.scanEnd) / 2, 'fixture', true, true],
    [T.displayStart, 'fixture', true, true],
    [T.fixtureGrip, 'gripper', true, true],
    [T.beltRelease - 1e-6, 'gripper', true, true],
    [T.beltRelease, 'belt', false, false],
    [T.total, 'belt', false, false],
  ]) {
    const monitor = getMonitorState(time, active);
    assert.equal(monitor.partLocation, location);
    assert.equal(monitor.workpieceVisible, workpiece);
    assert.equal(monitor.portraitVisible, portrait);
    assert.equal(monitor.partId, active.id);
    if (time >= T.beltRelease) {
      assert.equal(monitor.nickname, active.nickname);
      assert.equal(monitor.score, 87);
      assert.equal(monitor.phase, 'unloading');
    }
  }
});

test('scoring shares the scan clock and has no extra reveal period after the laser finishes', () => {
  assert.equal(getMonitorState(T.scanStart - 1e-6, active).score, null);
  assert.equal(getMonitorState(T.scanStart, active).score, 87);
  assert.equal(getMonitorState(T.scanStart, active).scoreProgress, 0);
  assert.ok(getMonitorState(T.scanEnd-1e-6,active).scoreProgress<1);
  assert.equal(getMonitorState(T.scanEnd,active).scoreProgress,1);
  assert.equal(getMonitorState(T.total, active).scoreProgress, 1);
  const next = { id: 'work-0002', nickname: '下一位', assessment: { score: 32 } };
  const newJob = getMonitorState(0, next);
  assert.equal(newJob.partId, next.id);
  assert.equal(newJob.nickname, next.nickname);
  assert.equal(newJob.score, null);
  assert.equal(newJob.progress, 0);
  assert.equal(newJob.scoreProgress, 0);
  for (const trayBusy of [false, true]) {
    const cleared = getMonitorState(T.total, null, { trayBusy });
    assert.equal(cleared.phase, trayBusy ? 'tray-exchange' : 'idle');
    assert.equal(cleared.partId, null);
    assert.equal(cleared.partLocation, null);
    assert.equal(cleared.nickname, '');
    assert.equal(cleared.score, null);
    assert.equal(cleared.scoreProgress, 0);
    assert.equal(cleared.progress, 0);
    assert.equal(cleared.portraitVisible, false);
    assert.equal(cleared.workpieceVisible, false);
  }
});

test('paused state preserves the sampled record and a zero score remains a valid score', () => {
  const time = T.displayStart + .8;
  const running = getMonitorState(time, active), paused = getMonitorState(time, active, { paused: true });
  assert.deepEqual(paused, { ...running, paused: true });
  assert.deepEqual(getMonitorState(time, active, { paused: true }), paused);
  assert.equal(getMonitorState(T.total, { ...active, assessment: { score: 0 } }).score, 0);
  assert.equal(getMonitorState(T.total, { ...active, assessment: null }).score, null);
  assert.equal(getMonitorState(T.total, { ...active, assessment: { score: NaN } }).score, null);
  assert.equal(getMonitorState(NaN, active).phase, 'loading');
  assert.equal(active.assessment.score, 87);
  assert.equal(active.nickname, '当前观众');
});
