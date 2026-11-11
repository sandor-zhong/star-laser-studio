import test from 'node:test';
import assert from 'node:assert/strict';
import { getMonitorOverlayData } from './monitor-overlay.js';
import { getRasterSample, RASTER_ROWS } from './scan-path.js';

const assessment = Object.freeze({ score: 77, comment: '轮廓清楚，构图集中，色彩层次出色。' });
const current = Object.freeze({ nickname: '当前作品', assessment, progress: .9, scoreProgress: 1 });

test('scores are revealed only for the current rating and idle or tray exchange clear prior data', () => {
  for (const phase of ['loading', 'engraving', 'finishing']) {
    const data = getMonitorOverlayData({ ...current, phase });
    assert.equal(data.score, null); assert.equal(data.displayScore, null);
    assert.equal(data.comment, ''); assert.equal(data.scoreProgress, 0);
    assert.ok(!data.pillText.includes('77分'));
  }
  const start = getMonitorOverlayData({ ...current, phase: 'rating', scoreProgress: 0 });
  const final = getMonitorOverlayData({ ...current, phase: 'rating' });
  assert.equal(start.displayScore, 0); assert.equal(final.displayScore, 77);
  assert.equal(final.comment, '轮廓清楚');
  assert.equal(getMonitorOverlayData({ ...current, phase: 'unloading', scoreProgress: 0 }).displayScore, 77);
  assert.equal(getMonitorOverlayData({ phase: 'rating', assessment: { score: 0 }, scoreProgress: 1 }).displayScore, 0);
  for (const phase of ['idle', 'tray-exchange', 'unknown']) {
    const data = getMonitorOverlayData({ ...current, phase });
    assert.equal(data.nickname, ''); assert.equal(data.score, null);
    assert.equal(data.displayScore, null); assert.equal(data.comment, '');
    assert.equal(data.percent, 0); assert.equal(data.completedRows, 0);
    assert.ok(!data.pillText.includes(current.nickname) && !data.pillText.includes('77'));
  }
  assert.equal(current.assessment.score, 77);
});

test('completed scan rows follow real lane completion and pause preserves all sampled measurements', () => {
  // A fraction-of-duration estimate would prematurely count the first row,
  // and miss four genuinely completed lanes during the mechanical turn.
  assert.equal(getMonitorOverlayData({ phase: 'engraving', progress: .025 }).completedRows, 0);
  assert.equal(getMonitorOverlayData({ phase: 'engraving', progress: .058 }).completedRows, 4);
  for (let index = 0; index <= 1000; index++) {
    const progress = index / 1000, sample = getRasterSample(progress);
    const running = getMonitorOverlayData({ ...current, phase: 'engraving', progress });
    const expected = sample.complete ? RASTER_ROWS : sample.row + sample.lanes.filter(lane => lane.complete).length;
    assert.equal(running.completedRows, expected);
    assert.ok(running.completedRows >= 0 && running.completedRows <= RASTER_ROWS);
    const paused = getMonitorOverlayData({ ...current, phase: 'engraving', progress, paused: true });
    assert.deepEqual(paused, { ...running, paused: true, status: `${running.phaseStatus} · 已暂停` });
  }
  assert.equal(getMonitorOverlayData({ phase: 'loading', progress: 1 }).percent, 0);
  const finishing = getMonitorOverlayData({ phase: 'finishing', progress: .1 });
  assert.equal(finishing.percent, 100); assert.equal(finishing.completedRows, RASTER_ROWS);
});
