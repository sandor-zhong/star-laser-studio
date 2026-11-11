import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONITOR_SCREEN, MONITOR_RADIUS, MONITOR_FEED, MONITOR_TOKEN, MONITOR_THICKNESS,
  projectMonitorPoint, projectMonitorPose, projectMonitorTool, monitorPoseVisible,
} from './monitor-view.js';
import { PRINT_SURFACE as P, LASER_ORIGIN, getToolPose, TOOL_TIMING as T } from './scan-path.js';
import { getLiveCamera, photoToScreen, LIVE_SIZE } from './live-camera.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);
const source = {
  x: P.x, y: P.y,
  a: Math.cos(P.angle) * P.rx, b: Math.sin(P.angle) * P.rx,
  c: -Math.sin(P.angle) * P.ry, d: Math.cos(P.angle) * P.ry,
};

test('fixture center and the four ellipse axes map exactly onto the monitor token', () => {
  for (const [u, v] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.3, -.7], [-.45, 2]]) {
    const projected = projectMonitorPoint({ x: P.x + source.a * u + source.c * v, y: P.y + source.b * u + source.d * v });
    near(projected.x, MONITOR_TOKEN.x + MONITOR_TOKEN.a * u + MONITOR_TOKEN.c * v);
    near(projected.y, MONITOR_TOKEN.y + MONITOR_TOKEN.b * u + MONITOR_TOKEN.d * v);
  }
  const projected = projectMonitorPose(source);
  for (const key of ['x', 'y', 'a', 'b', 'c', 'd']) near(projected[key], MONITOR_TOKEN[key]);
});

test('arbitrary center offsets and pose basis vectors follow the same affine camera', () => {
  const pose = { x: P.x + 5, y: P.y - 8, a: 14, b: 3, c: -2, d: 8, id: 'same-physical-token' };
  const saved = { ...pose }, projected = projectMonitorPose(pose);
  const center = projectMonitorPoint(pose);
  const horizontal = projectMonitorPoint({ x: pose.x + pose.a, y: pose.y + pose.b });
  const vertical = projectMonitorPoint({ x: pose.x + pose.c, y: pose.y + pose.d });
  near(projected.x, center.x); near(projected.y, center.y);
  near(projected.a, horizontal.x - center.x); near(projected.b, horizontal.y - center.y);
  near(projected.c, vertical.x - center.x); near(projected.d, vertical.y - center.y);
  assert.equal(projected.id, pose.id);
  assert.deepEqual(pose, saved);
  // A physical vertical lift is unprojected through the rotated source basis.
  const raised = projectMonitorPoint({ x: P.x, y: P.y - 40 });
  const determinant = source.a * source.d - source.b * source.c;
  const u = 40 * source.c / determinant, v = -40 * source.a / determinant;
  near(raised.x, MONITOR_TOKEN.x + MONITOR_TOKEN.a * u + MONITOR_TOKEN.c * v);
  near(raised.y, MONITOR_TOKEN.y + MONITOR_TOKEN.b * u + MONITOR_TOKEN.d * v);
  assert.ok(raised.y < MONITOR_TOKEN.y);
});

test('the real nozzle and engraving spot keep their physical separation in the same macro camera', () => {
  const determinant = source.a * source.d - source.b * source.c;
  for (const progress of [.03, .13, .36, .73, .97]) {
    const pose = getToolPose(T.scanStart + (T.scanEnd - T.scanStart) * progress);
    const projected = projectMonitorTool(pose);
    assert.equal(pose.laser, true);
    // Compute the expected separation independently from the world-space
    // nozzle/impact difference and the photographed fixture's inverse basis.
    const dx = LASER_ORIGIN.x + pose.x - pose.impact.x;
    const dy = LASER_ORIGIN.nozzleY + pose.y - pose.lift - pose.impact.y;
    const u = (source.d * dx - source.c * dy) / determinant;
    const v = (-source.b * dx + source.a * dy) / determinant;
    near(projected.tip.x - projected.impact.x, MONITOR_TOKEN.a * u + MONITOR_TOKEN.c * v);
    near(projected.tip.y - projected.impact.y, MONITOR_TOKEN.b * u + MONITOR_TOKEN.d * v);
    const gap = projected.impact.y - projected.tip.y;
    const expectedGap = -(MONITOR_TOKEN.b * u + MONITOR_TOKEN.d * v);
    near(gap, expectedGap);
    assert.ok(gap > 130 && gap < 170, 'the enlarged macro camera preserves the physical nozzle gap and local microline offset');
    assert.ok(Math.abs(projected.tip.x - projected.impact.x) > 5, 'the camera shear also affects the vertical world gap');
  }
  assert.equal(projectMonitorTool({ x: 0, y: 0, lift: 0 }).impact, null);
});

test('head lift moves the nozzle continuously through the camera basis in both output axes', () => {
  const start = projectMonitorTool(getToolPose(T.scanEnd));
  const determinant = source.a * source.d - source.b * source.c;
  let previousY = start.tip.y;
  for (let step = 0; step <= 100; step++) {
    const pose = getToolPose(T.scanEnd + (T.retractEnd - T.scanEnd) * step / 100);
    const projected = projectMonitorTool(pose);
    const u = source.c * pose.lift / determinant, v = -source.a * pose.lift / determinant;
    near(projected.tip.x - start.tip.x, MONITOR_TOKEN.a * u + MONITOR_TOKEN.c * v);
    near(projected.tip.y - start.tip.y, MONITOR_TOKEN.b * u + MONITOR_TOKEN.d * v);
    assert.ok(projected.tip.y <= previousY + 1e-10);
    previousY = projected.tip.y;
  }
  const raised = projectMonitorTool(getToolPose(T.retractEnd));
  assert.ok(Math.abs(raised.tip.x - start.tip.x) > 50);
  assert.ok(raised.tip.y < start.tip.y - 700);
  for (const boundary of [T.scanEnd, T.retractEnd, T.headReturnEnd]) {
    const before = projectMonitorTool(getToolPose(boundary - 1e-6)).tip;
    const after = projectMonitorTool(getToolPose(boundary + 1e-6)).tip;
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < .01);
  }
});

test('ellipse bounds are clipped against the live content, including exact edge contacts', () => {
  const token = MONITOR_TOKEN, epsilon = 1e-5;
  const rx = Math.hypot(token.a, token.c), ry = Math.hypot(token.b, token.d);
  assert.equal(monitorPoseVisible(token), true);
  for (const [outside, inside] of [
    [{ ...token, x: -rx }, { ...token, x: -rx + epsilon }],
    [{ ...token, x: MONITOR_FEED.width + rx }, { ...token, x: MONITOR_FEED.width + rx - epsilon }],
    [{ ...token, y: -ry }, { ...token, y: -ry + epsilon }],
    [{ ...token, y: MONITOR_FEED.height + ry }, { ...token, y: MONITOR_FEED.height + ry - epsilon }],
  ]) {
    assert.equal(monitorPoseVisible(outside), false);
    assert.equal(monitorPoseVisible(inside), true);
  }
  assert.equal(monitorPoseVisible({ x: 512, y: 500, a: 20, b: 0, c: 0, d: 20 }), true, 'the HUD leaves the lower camera feed visible');
  assert.equal(monitorPoseVisible({ x: 512, y: 533, a: 20, b: 0, c: 0, d: 20 }), false);
  assert.equal(monitorPoseVisible({ x: -5, y: 200, a: 3, b: 4, c: 4, d: 3 }), false);
  assert.equal(monitorPoseVisible({ x: -5, y: 200, a: 3, b: 4, c: 4.01, d: 3 }), true, 'both ellipse basis vectors contribute to its bounds');
  for (const invalid of [null, {}, { ...token, a: NaN }, { ...token, x: Infinity }]) assert.equal(monitorPoseVisible(invalid), false);
});

test('the enlarged tilted token is deliberately cropped slightly while its center and right-side data remain clear', () => {
  assert.deepEqual(MONITOR_SCREEN, { x: 135, y: 205, width: 810, height: 395 });
  assert.equal(MONITOR_RADIUS, 28);
  assert.deepEqual(MONITOR_FEED, { width: 1024, height: 512 });
  assert.ok(MONITOR_SCREEN.x > 0 && MONITOR_SCREEN.x + MONITOR_SCREEN.width < LIVE_SIZE.width);
  assert.ok(MONITOR_SCREEN.y > 0 && MONITOR_SCREEN.y + MONITOR_SCREEN.height < LIVE_SIZE.height);
  assert.equal(MONITOR_SCREEN.width / LIVE_SIZE.width, .75);
  const machineTop = photoToScreen({ x: 85, y: 342 }, getLiveCamera()).y;
  assert.ok(MONITOR_SCREEN.y + MONITOR_SCREEN.height < machineTop);
  assert.deepEqual(MONITOR_TOKEN, { x: 420, y: 260, a: 426, b: -104, c: 64, d: 210 });
  assert.equal(MONITOR_THICKNESS, 18);
  const rx = Math.hypot(MONITOR_TOKEN.a, MONITOR_TOKEN.c), ry = Math.hypot(MONITOR_TOKEN.b, MONITOR_TOKEN.d);
  const left = MONITOR_TOKEN.x - rx, bottom = MONITOR_TOKEN.y + ry + MONITOR_THICKNESS;
  assert.ok(left < 0 && left > -12, 'only a narrow edge of the material is cropped');
  assert.ok(MONITOR_TOKEN.x > 0 && MONITOR_TOKEN.x < MONITOR_FEED.width);
  assert.ok(MONITOR_TOKEN.y > 0 && MONITOR_TOKEN.y < MONITOR_FEED.height);
  assert.ok(MONITOR_TOKEN.x + rx < 870, 'the right-side readout remains outside the portrait');
  assert.ok(MONITOR_TOKEN.y - ry > 0);
  assert.ok(bottom > MONITOR_FEED.height && bottom < MONITOR_FEED.height + 1, 'less than one pixel of the metal sidewall may be cropped');
  assert.ok(MONITOR_TOKEN.b < 0 && MONITOR_TOKEN.c > 0, 'the token preserves the reference camera tilt');
  const angle = Math.atan2(MONITOR_TOKEN.b, MONITOR_TOKEN.a) * 180 / Math.PI;
  assert.ok(angle > -14 && angle < -13);
  assert.equal(monitorPoseVisible(MONITOR_TOKEN), true);
});
