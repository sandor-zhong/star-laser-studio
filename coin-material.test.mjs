import test from 'node:test';
import assert from 'node:assert/strict';
import { getRasterClipRects } from './coin-material.js';
import {
  getRasterSample, MECHANICAL_ROWS, SUBSCAN_LINES, RASTER_ROWS,
} from './scan-path.js';

const radius = 64, epsilon = 1e-8;
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < epsilon, message ?? `${actual} != ${expected}`);
const currentRects = (rects, height) => rects.filter(rect => Math.abs(rect.height - height) < epsilon);

test('real scan samples never reveal an unvisited lane or pixels ahead of the laser', () => {
  let visited = 0, unvisited = 0, forward = 0, backward = 0;
  const steps = MECHANICAL_ROWS * 1000 + 1;
  for (let index = 0; index < steps; index++) {
    const sample = getRasterSample(index / steps), rects = getRasterClipRects(sample);
    const height = radius * 2 / sample.rows, current = currentRects(rects, height);
    const prior = rects.filter(rect => rect.height > height + epsilon);
    assert.equal(prior.length, sample.row > 0 ? 1 : 0);
    if (prior.length) {
      close(prior[0].y, -radius);
      close(prior[0].y + prior[0].height, -radius + sample.row * height,
        'completed earlier rows must stop before the current group');
    }
    for (const lane of sample.lanes) {
      const matches = current.filter(rect => Math.abs(rect.y - (-radius + lane.row * height)) < epsilon);
      if (!lane.started || lane.progress <= 0) {
        assert.equal(matches.length, 0, `unvisited pass ${sample.pass}, row ${lane.row}`);
        unvisited++; continue;
      }
      assert.equal(matches.length, 1, `visited pass ${sample.pass}, row ${lane.row}`);
      const rect = matches[0], left = rect.x, right = rect.x + rect.width;
      assert.ok(rect.width > 0 && Number.isFinite(rect.width));
      assert.ok(left >= -lane.chord * radius - epsilon);
      assert.ok(right <= lane.chord * radius + epsilon);
      assert.ok(rect.y >= -radius && rect.y + rect.height <= radius + epsilon);
      close((rect.y + rect.height / 2) / radius, lane.v,
        'each microline must stay in its own row instead of revealing the full group');
      // Its centerline endpoints are inside the physical circular stock. The
      // renderer additionally intersects each strip with the circular face.
      assert.ok(Math.hypot(left / radius, lane.v) <= 1 + epsilon);
      assert.ok(Math.hypot(right / radius, lane.v) <= 1 + epsilon);
      if (!sample.rowComplete) {
        if (sample.direction > 0) {
          assert.ok(right <= sample.headU * radius + epsilon, 'left-to-right mask outran the head');
          close(left, -lane.chord * radius); forward++;
        } else {
          assert.ok(left >= sample.headU * radius - epsilon, 'right-to-left mask outran the head');
          close(right, lane.chord * radius); backward++;
        }
      }
      visited++;
    }
    assert.equal(current.length, sample.lanes.filter(lane => lane.started && lane.progress > 0).length);
  }
  assert.ok(visited > 50000 && unvisited > 0 && forward > 0 && backward > 0,
    'audit must exercise both directions, chord entry and completed lanes');
});

test('first and final passes reveal correctly and turning preserves all four completed microlines', () => {
  assert.deepEqual(getRasterClipRects(getRasterSample(0)), []);
  for (let pass = 0; pass < MECHANICAL_ROWS; pass++) {
    const sample = getRasterSample((pass + .95) / MECHANICAL_ROWS);
    const rects = getRasterClipRects(sample), height = radius * 2 / RASTER_ROWS;
    const current = currentRects(rects, height);
    assert.equal(sample.row, pass * SUBSCAN_LINES);
    assert.equal(sample.rowComplete, true);
    assert.equal(sample.laser, false);
    assert.equal(current.length, SUBSCAN_LINES,
      'a completed pass must retain every microline during the mechanical turn');
    for (const lane of sample.lanes) {
      assert.equal(lane.complete, true);
      const rect = current.find(rect => Math.abs(rect.y - (-radius + lane.row * height)) < epsilon);
      close(rect.x, -lane.chord * radius);
      close(rect.width, lane.chord * radius * 2);
    }
    if (pass === 0) assert.equal(rects.length, SUBSCAN_LINES);
    if (pass === MECHANICAL_ROWS - 1) {
      assert.equal(rects.length, SUBSCAN_LINES + 1);
      close(current.at(-1).y + current.at(-1).height, radius);
    }
  }
  const final = getRasterSample(1);
  assert.equal(final.complete, true);
  assert.equal(final.laser, false);
  assert.equal(getRasterClipRects(final), null, 'the completed piece must reveal the whole printed face');
});
