import test from 'node:test';
import assert from 'node:assert/strict';
import { getToolPose, getHeadImpact, PRINT_SURFACE, TOOL_TIMING as T } from './scan-path.js';
import { HANDLING_PHASES } from './handling-cycle.js';
import { fixturePose, feedPose, beltPose, uprightPose } from './production-layout.js';
import {
  getProductionTool, projectWorkpiecePoint, projectMacroPoint, projectMacroPose, projectMacroTool,
  PRODUCTION_HEAD_PARK, PRODUCTION_BEAM_GAP, PRODUCTION_TOOL_ANGLE,
  MACRO_FEED, MACRO_SCREEN, MACRO_TOKEN,
} from './production-optics.js';

const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const samePoint = (a, b, tolerance = 1e-8) => {
  close(a.x, b.x, tolerance); close(a.y, b.y, tolerance);
};
const fixture = fixturePose();
const worldUV = (u, v) => ({ x: fixture.x + fixture.a * u + fixture.c * v,
  y: fixture.y + fixture.b * u + fixture.d * v });

test('all logical stock coordinates map to the exact same upright portrait UV', () => {
  const c = Math.cos(PRINT_SURFACE.angle), s = Math.sin(PRINT_SURFACE.angle);
  for (let i = 0; i <= 360; i++) {
    const u = Math.cos(i / 180 * Math.PI), v = Math.sin(i / 180 * Math.PI);
    const old = { x: PRINT_SURFACE.x + PRINT_SURFACE.rx * c * u - PRINT_SURFACE.ry * s * v,
      y: PRINT_SURFACE.y + PRINT_SURFACE.rx * s * u + PRINT_SURFACE.ry * c * v };
    samePoint(projectWorkpiecePoint(old), worldUV(u, v));
  }
});

test('laser and all fine contacts stay on the material, following the shared raster', () => {
  let illuminated = 0, previousReveal = 0;
  for (let t = 0; t <= T.total; t += .002) {
    const tool = getProductionTool(t), old = getToolPose(t);
    close(tool.reveal, old.reveal);
    assert.deepEqual(tool.raster, old.raster);
    assert.equal(tool.phase, old.phase);
    assert.ok(tool.reveal >= previousReveal); previousReveal = tool.reveal;
    assert.equal(tool.laser, old.laser);
    assert.equal(tool.angle, PRODUCTION_TOOL_ANGLE);
    if (t < T.scanStart || t >= T.scanEnd) {
      assert.equal(tool.impact, null); assert.deepEqual(tool.microImpacts, []);
      assert.equal(tool.laser, false); continue;
    }
    samePoint(tool.impact, worldUV(old.raster.u, old.raster.v));
    const headCentre = projectWorkpiecePoint(getHeadImpact(old.raster));
    samePoint(tool.tip, { x: headCentre.x + PRODUCTION_BEAM_GAP.x,
      y: headCentre.y + PRODUCTION_BEAM_GAP.y });
    if (!tool.laser) continue;
    illuminated++;
    assert.equal(tool.microImpacts.length, old.microImpacts.length);
    assert.ok(tool.microImpacts.length > 0);
    for (const impact of [tool.impact, ...tool.microImpacts]) {
      const u = (impact.x - fixture.x) / fixture.a;
      const v = (impact.y - fixture.y) / fixture.d;
      assert.ok(u * u + v * v <= 1 + 1e-8);
      // Four fine lines introduce a small local galvo offset around the
      // mechanical head; the nozzle remains above and right of every spot.
      close(tool.tip.x - impact.x, PRODUCTION_BEAM_GAP.x);
      assert.ok(impact.y - tool.tip.y > 60 && impact.y - tool.tip.y < 80);
    }
  }
  assert.ok(illuminated > 1000);
});

test('angled head moves continuously at every handling and scan-pass boundary', () => {
  const boundaries = new Set([...Object.values(T), ...HANDLING_PHASES.flatMap(p => [p.start, p.end])]);
  for (let pass = 0; pass <= 16; pass++) boundaries.add(T.scanStart + (T.scanEnd - T.scanStart) * pass / 16);
  for (const boundary of boundaries) {
    const before = getProductionTool(boundary - 1e-6), after = getProductionTool(boundary + 1e-6);
    samePoint(before.tip, after.tip, .02);
    close(before.angle, after.angle);
  }
  for (const t of [0, 2, T.headLoadStart, T.headReturnEnd, 12, T.total]) {
    samePoint(getProductionTool(t).tip, PRODUCTION_HEAD_PARK);
  }
});

test('macro material, moving pieces and contacts all share exactly one affine camera', () => {
  const projected = projectMacroPose(fixture);
  for (const key of ['x', 'y', 'a', 'b', 'c', 'd']) close(projected[key], MACRO_TOKEN[key]);
  const poses = [fixture, feedPose(), beltPose(.12), beltPose(.81),
    uprightPose(320, 700, 77, { angle: .37, aspect: .72 })];
  for (const pose of poses) {
    const macro = projectMacroPose(pose);
    for (let i = 0; i < 72; i++) {
      const u = Math.cos(i * Math.PI / 36), v = Math.sin(i * Math.PI / 36);
      const world = { x: pose.x + pose.a * u + pose.c * v,
        y: pose.y + pose.b * u + pose.d * v };
      samePoint(projectMacroPoint(world), { x: macro.x + macro.a * u + macro.c * v,
        y: macro.y + macro.b * u + macro.d * v });
    }
    samePoint(macro.contact, projectMacroPoint(pose.contact));
    assert.ok(macro.a * macro.d - macro.b * macro.c > 0);
  }
  assert.ok(MACRO_TOKEN.x - Math.hypot(MACRO_TOKEN.a, MACRO_TOKEN.c) > 0);
  assert.ok(MACRO_TOKEN.x + Math.hypot(MACRO_TOKEN.a, MACRO_TOKEN.c) < MACRO_FEED.width);
  assert.ok(MACRO_TOKEN.y - Math.hypot(MACRO_TOKEN.b, MACRO_TOKEN.d) > 0);
  assert.ok(MACRO_TOKEN.y + Math.hypot(MACRO_TOKEN.b, MACRO_TOKEN.d) < MACRO_FEED.height);
  // Screen dimensions are rounded world pixels; aspect error stays subpixel
  // across a 384px-high feed rather than noticeably stretching the portrait.
  assert.ok(Math.abs(MACRO_SCREEN.width / MACRO_FEED.width * MACRO_FEED.height
    - MACRO_SCREEN.height) < 1);
});

test('macro head uses the actual projected nozzle with no extra contact offset', () => {
  for (let t = T.headLoadStart; t <= T.headReturnEnd; t += .005) {
    const tool = getProductionTool(t), macro = projectMacroTool(tool);
    samePoint(macro.tip, projectMacroPoint(tool.tip));
    if (tool.impact) samePoint(macro.impact, projectMacroPoint(tool.impact));
    else assert.equal(macro.impact, null);
    tool.microImpacts.forEach((p, i) => samePoint(macro.microImpacts[i], projectMacroPoint(p)));
    const worldDown = { x: tool.tip.x - Math.sin(tool.angle), y: tool.tip.y + Math.cos(tool.angle) };
    const projectedDown = projectMacroPoint(worldDown);
    const expected = Math.atan2(projectedDown.y - macro.tip.y, projectedDown.x - macro.tip.x) - Math.PI / 2;
    close(macro.angle, expected);
    assert.equal(macro.laser, tool.laser);
    for (const p of [macro.tip, macro.impact, ...macro.microImpacts].filter(Boolean)) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
  }
});

test('invalid time inputs return a finite, safe parked head', () => {
  for (const t of [undefined, NaN, Infinity, -Infinity, -100]) {
    const tool = getProductionTool(t);
    samePoint(tool.tip, PRODUCTION_HEAD_PARK);
    assert.equal(tool.laser, false); assert.equal(tool.impact, null);
  }
});
