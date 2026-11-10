import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getToolPose, getProductionState, getRasterSample, getImpact, getHeadImpact,
  PRINT_SURFACE, LASER_ORIGIN, TOOL_TIMING as T, TOOL_PARK, RASTER_ROWS,
  MECHANICAL_ROWS, SUBSCAN_LINES, RASTER_STROKE_FRACTION,
} from './scan-path.js';
import { HANDLING_TIMING, HANDLING_PHASES } from './handling-cycle.js';

const epsilon = 1e-6;
const parked = pose => {
  assert.equal(pose.x, TOOL_PARK.x);
  assert.equal(pose.y, TOOL_PARK.y);
  assert.equal(pose.lift, TOOL_PARK.lift);
  assert.equal(pose.laser, false);
};

test('laser and handling share the production clock and the reserved showcase window', () => {
  assert.equal(T, HANDLING_TIMING);
  assert.equal(T.total, 18);
  assert.ok(T.scanEnd > T.scanStart);
  const scan = HANDLING_PHASES.find(p => p.name === 'scan');
  assert.equal(T.scanStart, scan.start);
  assert.equal(T.scanEnd, scan.end);
  assert.equal(T.displayEnd - T.displayStart, 4.5);
  assert.ok(T.headLoadStart >= T.clampEnd);
  assert.ok(T.headReturnEnd <= T.unclampStart);
  assert.equal(RASTER_ROWS, 64);
  assert.equal(MECHANICAL_ROWS, 16);
  assert.equal(SUBSCAN_LINES, 4);
});

test('illuminated impacts use the current laser origin and stay inside the stock', () => {
  const p = PRINT_SURFACE, c = Math.cos(p.angle), s = Math.sin(p.angle);
  let illuminated = 0;
  for (let t = 0; t <= T.total; t += .001) {
    const pose = getToolPose(t);
    if (!pose.laser) continue;
    illuminated++;
    const impact = pose.impact;
    const expected = getImpact(pose.raster);
    assert.ok(Math.hypot(impact.x - expected.x, impact.y - expected.y) < epsilon);
    const dx = impact.x - p.x, dy = impact.y - p.y;
    const u = (dx * c + dy * s) / p.rx, v = (-dx * s + dy * c) / p.ry;
    assert.ok(u * u + v * v <= 1 + epsilon, `outside stock at ${t}`);
    assert.equal(pose.lift, 0);
    const head={x:LASER_ORIGIN.x+pose.x,y:LASER_ORIGIN.y+pose.y};
    assert.ok(Math.abs(impact.x-head.x)<=2&&Math.abs(impact.y-head.y)<=1);
    assert.ok(pose.microImpacts.length>=1&&pose.microImpacts.length<=SUBSCAN_LINES);
    for(const micro of pose.microImpacts){
      const dx=micro.x-p.x,dy=micro.y-p.y;
      const u=(dx*c+dy*s)/p.rx,v=(-dx*s+dy*c)/p.ry;
      assert.ok(u*u+v*v<=1+epsilon);
      assert.ok(Math.abs(micro.x-head.x)<=2&&Math.abs(micro.y-head.y)<=1);
    }
    assert.ok(t >= T.scanStart && t < T.scanEnd);
  }
  assert.ok(illuminated > (T.scanEnd - T.scanStart) * 1000 * .75, 'test must exercise the illuminated raster');
});

test('sixteen smooth mechanical passes engrave sixty-four fine local tracks in order', () => {
  const duration = T.scanEnd - T.scanStart;
  let previousV = -Infinity;
  const seen=new Set();
  for (let pass = 0; pass < MECHANICAL_ROWS; pass++) {
    const sample = getRasterSample((pass + .42) / MECHANICAL_ROWS);
    const pose = getToolPose(T.scanStart + duration * (pass + .42) / MECHANICAL_ROWS);
    assert.equal(sample.pass, pass);
    assert.equal(pose.raster.row, pass*SUBSCAN_LINES);
    assert.equal(sample.direction, pass % 2 === 0 ? 1 : -1);
    assert.equal(sample.lanes.length,SUBSCAN_LINES);
    for(let index=0;index<SUBSCAN_LINES;index++){
      const lane=sample.lanes[index];
      assert.equal(lane.row,pass*SUBSCAN_LINES+index);seen.add(lane.row);
    }
    assert.equal(pose.laser, true);
    assert.ok(sample.v > previousV);
    previousV = sample.v;
    const beforeStroke = getRasterSample((pass + .1) / MECHANICAL_ROWS);
    const afterStroke = getRasterSample((pass + .7) / MECHANICAL_ROWS);
    assert.ok((afterStroke.u - beforeStroke.u) * sample.direction > 0);
    const blank=(RASTER_STROKE_FRACTION+1)/2;
    const turning = getToolPose(T.scanStart + duration * (pass + blank) / MECHANICAL_ROWS);
    assert.equal(turning.raster.rowComplete, true);
    assert.equal(turning.laser, false);
    if (pass < MECHANICAL_ROWS - 1) {
      const before = getHeadImpact(getRasterSample((pass + 1 - 1e-7) / MECHANICAL_ROWS));
      const after = getHeadImpact(getRasterSample((pass + 1 + 1e-7) / MECHANICAL_ROWS));
      assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < .001);
    }
  }
  assert.equal(seen.size,RASTER_ROWS);
  assert.equal(getRasterSample(1).complete, true);
  assert.equal(getRasterSample(1).laser, false);
});

test('fine-track clipping never exposes a point ahead of the nozzle or outside its visited chord',()=>{
  const progressByRow=new Map();
  for(let step=0;step<=10000;step++){
    const raster=getRasterSample(step/10000);
    for(const lane of raster.lanes){
      const previous=progressByRow.get(lane.row)??0;
      assert.ok(lane.progress>=previous&&lane.progress<=1);
      progressByRow.set(lane.row,lane.progress);
      assert.equal(lane.started,lane.progress>0);
      if(lane.active){
        assert.equal(raster.laser,true);
        assert.ok(Math.abs(raster.headU)<=lane.chord+epsilon);
        assert.ok(Math.abs(lane.u-raster.headU)<epsilon);
      }
      if(lane.started&&!raster.rowComplete){
        assert.ok((raster.headU-lane.u)*lane.direction>=-epsilon);
      }
      if(raster.rowComplete)assert.equal(lane.complete,true);
    }
  }
  assert.equal(progressByRow.size,RASTER_ROWS);
  for(const value of progressByRow.values())assert.equal(value,1);
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

test('the completed portrait remains supported and unlit throughout the full showcase', () => {
  assert.equal(T.displayStart, T.headReturnEnd);
  assert.equal(T.displayEnd, T.unclampStart);
  for (let t = T.displayStart; t < T.displayEnd; t += .003) {
    const state = getProductionState(t);
    assert.equal(state.phase, 'show-finished');
    assert.equal(state.pose.phase, 'show-finished');
    parked(state.pose);
    assert.equal(state.pose.reveal, 1);
    assert.equal(state.partLocation, 'fixture');
    assert.equal(state.fixtureOccupied, true);
    assert.equal(state.clamped, 1);
    assert.equal(state.carried, null);
  }
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
