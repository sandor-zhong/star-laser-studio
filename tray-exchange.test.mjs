import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrayExchangePose as pose, TRAY_EXCHANGE_TIMING as T, TRAY_TRAVEL } from './tray-exchange.js';
import { getLiveCamera, LIVE_SIZE } from './live-camera.js';

const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test('a loaded tray withdraws, waits outside, returns empty and docks before production resumes', () => {
  assert.deepEqual(pose(0), {
    phase: 'withdraw', offsetX: 0, loaded: true, transferReady: false, complete: false,
  });
  assert.deepEqual(pose(T.withdrawEnd), {
    phase: 'handoff', offsetX: TRAY_TRAVEL, loaded: true, transferReady: true, complete: false,
  });
  assert.deepEqual(pose(T.handoffEnd), {
    phase: 'return', offsetX: TRAY_TRAVEL, loaded: false, transferReady: true, complete: false,
  });
  assert.deepEqual(pose(T.returnEnd), {
    phase: 'dock', offsetX: 0, loaded: false, transferReady: true, complete: false,
  });
  assert.equal(pose(T.total).complete, true);
  assert.equal(pose(T.total + 50).offsetX, 0);
  assert.equal(T.total, 3.8);
});

test('inventory handoff and the loaded-to-empty change both happen with every tray item out of frame', () => {
  // Bounds include the tray walls and every medal supported by its bed.
  const trayLeft = 548;
  const contentsLeft = 570;
  const camera = getLiveCamera();
  const cameraRight = (LIVE_SIZE.width - camera.tx) / camera.scale;
  close(cameraRight, 970.5);
  const firstTransfer = pose(T.withdrawEnd);
  const emptyReturn = pose(T.handoffEnd);
  for (const sample of [firstTransfer, emptyReturn]) {
    assert.ok(trayLeft + sample.offsetX > cameraRight);
    assert.ok(contentsLeft + sample.offsetX > cameraRight);
  }
  assert.equal(pose(T.withdrawEnd - .0001).transferReady, false);
  assert.equal(pose(T.handoffEnd - .0001).loaded, true);
  // During the handoff dwell no part of the loaded tray can reappear.
  for (let t = T.withdrawEnd; t < T.handoffEnd; t += .005) {
    const s = pose(t);
    assert.equal(s.phase, 'handoff');
    assert.equal(s.loaded, true);
    assert.equal(s.offsetX, TRAY_TRAVEL);
  }
});

test('the empty tray retraces the loaded tray path without horizontal drift or overshoot', () => {
  let lastOut = -Infinity;
  let lastIn = Infinity;
  for (let i = 0; i <= 1000; i++) {
    const p = i / 1000;
    const out = pose(T.withdrawEnd * p).offsetX;
    const back = pose(T.handoffEnd + (T.returnEnd - T.handoffEnd) * p).offsetX;
    assert.ok(out >= lastOut && out >= 0 && out <= TRAY_TRAVEL);
    assert.ok(back <= lastIn && back >= 0 && back <= TRAY_TRAVEL);
    close(out, pose(T.handoffEnd + (T.returnEnd - T.handoffEnd) * (1 - p)).offsetX);
    lastOut = out;
    lastIn = back;
  }
});

test('position and velocity are continuous at departure, handoff, return and docking', () => {
  const epsilon = .0001;
  for (const boundary of [0, T.withdrawEnd, T.handoffEnd, T.returnEnd, T.total]) {
    const left = pose(boundary - epsilon).offsetX;
    const center = pose(boundary).offsetX;
    const right = pose(boundary + epsilon).offsetX;
    close(left, center, 1e-7);
    close(right, center, 1e-7);
    assert.ok(Math.abs((center - left) / epsilon) < .001, `abrupt stop at ${boundary}`);
    assert.ok(Math.abs((right - center) / epsilon) < .001, `abrupt start at ${boundary}`);
  }
});

test('invalid elapsed inputs reset to a safe loaded starting pose', () => {
  for (const invalid of [undefined, null, NaN, Infinity, -Infinity, -1, '2', {}]) {
    assert.deepEqual(pose(invalid), pose(0));
  }
});
