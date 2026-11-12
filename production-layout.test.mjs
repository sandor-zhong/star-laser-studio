import test from 'node:test';
import assert from 'node:assert/strict';
import { CellInventory } from './cell-inventory.js';
import {
  PRODUCTION_LAYOUT as L, BELT_SLOTS, BELT_LOAD, BELT_STEP,
  uprightPose, feedPose, fixturePose, beltPoint, beltPose,
  collectorPose, getOutletPose, getCollectorOutletPose,
} from './production-layout.js';

const close = (a, b, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
const poseKeys = ['x', 'y', 'a', 'b', 'c', 'd'];
const samePose = (a, b, tolerance = 1e-8) => {
  for (const key of poseKeys) close(a[key], b[key], tolerance);
};
const inside = (p, corners) => Object.values(corners).every((a, i, poly) => {
  const b = poly[(i + 1) % poly.length];
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-8;
});

test('through belt reaches beyond the screen and retires pieces only after their full rim exits',()=>{
 assert.ok(L.belt.corners.frontLeft.y>L.height);
 let previousY=-Infinity;
 for(let i=0;i<=1000;i++){
  const progress=i/1000,p=getOutletPose({beltProgress:progress});
  samePose(p,beltPose(BELT_SLOTS[3].u+progress*BELT_STEP));
  assert.ok(p.y>=previousY);previousY=p.y;
  assert.equal(p.opacity,1);
  if(!p.visible)assert.ok(p.y-p.ry>L.height);
 }
 const end=getOutletPose({beltProgress:1});
 assert.equal(end.visible,false);assert.equal(end.phase,'exited');
 assert.ok(end.y-end.ry>1920/(1080/L.width),'no visible pixel removed at commit');
});

test('continuous production never needs a tray and keeps only the visible belt records',()=>{
 const inventory=new CellInventory(['a','b','c'],24,{outputMode:'through'});
 for(let i=0;i<200;i++){
  assert.equal(inventory.canStart(),true);
  assert.ok(inventory.begin(`portrait-${i}`,{assessment:{score:i}}));
  const previous=inventory.belt[3],outgoing=getOutletPose({beltProgress:1});
  assert.equal(outgoing.visible,false);
  assert.equal(inventory.commit().outgoing,previous);
  assert.equal(inventory.exitedCount,i+1);
  assert.equal(inventory.collector.length,0);
  assert.equal(inventory.belt.filter(Boolean).length,3);
 }
 inventory.reset();assert.equal(inventory.exitedCount,0);
});

test('depth/across coordinates cover the cloth and remain bounded inside it', () => {
  for (const [u, v, corner] of [[0, 0, 'rearLeft'], [0, 1, 'rearRight'],
    [1, 1, 'frontRight'], [1, 0, 'frontLeft']]) {
    assert.deepEqual(beltPoint(u, v), L.belt.corners[corner]);
  }
  for (let i = 0; i <= 40; i++) {
    for (let j = 0; j <= 20; j++) {
      const p = beltPoint(i / 40, j / 20);
      assert.ok(inside(p, L.belt.corners));
      assert.ok(p.x >= 0 && p.x <= L.width && p.y >= 0 && p.y <= L.belt.corners.frontRight.y);
    }
  }
});

test('four cloth berths share one centreline and advance without covering the preceding face centre', () => {
  assert.equal(BELT_SLOTS.length, 4);
  assert.equal(BELT_LOAD, BELT_SLOTS[0]);
  for (const [i, pose] of BELT_SLOTS.entries()) {
    const supported = beltPoint(pose.u, pose.v);
    close(pose.v, L.belt.centerlineV);
    close(pose.x, supported.x);
    close(pose.y, supported.y);
    assert.ok(pose.ry / pose.rx > .5, 'tilted faces remain readable');
    if (i) {
      const previous = BELT_SLOTS[i - 1];
      close(pose.u - previous.u, BELT_STEP);
      samePose(beltPose(previous.u + BELT_STEP), pose);
      // Front coins may cover the previous lower rim, but keep its face centre
      // and upper portrait visible instead of swallowing the whole portrait.
      assert.ok(pose.y - pose.ry > previous.y);
    }
  }
});

test('upright, feeding, belt and collection poses have finite non-degenerate planes', () => {
  const poses = [fixturePose(), ...BELT_SLOTS];
  for (let i = 0; i < 24; i++) poses.push(collectorPose(i));
  for (let i = 0; i < 3; i++) poses.push(feedPose(i));
  for (let i = 0; i < 360; i++) {
    poses.push(uprightPose(400, 700, 90, { aspect: .7, angle: i * Math.PI / 180 }));
  }
  for (const p of poses) {
    for (const key of [...poseKeys, 'supportX', 'supportY']) assert.ok(Number.isFinite(p[key]));
    assert.ok(p.a * p.d - p.b * p.c > 0);
    close(p.contact.x, p.supportX);
    close(p.contact.y, p.supportY);
    // The declared support is an actual transformed unit-circle point.
    const verticalRadius = Math.hypot(p.b, p.d);
    const unitX = p.b / verticalRadius, unitY = p.d / verticalRadius;
    close(p.x + p.a * unitX + p.c * unitY, p.supportX);
    close(p.y + p.b * unitX + p.d * unitY, p.supportY);
  }
});

test('feed magazine stacks the same physical blank without fanning stock beyond its support', () => {
  const first = feedPose(), fixture = fixturePose();
  assert.ok(Math.abs(first.rx / fixture.rx - 1) < .25,
    'perspective may slightly change size, but must not grow a different blank');
  assert.ok(first.ry / first.rx < .5, 'raw blanks lie flat in the magazine');
  for (let i = 1; i < 5; i++) {
    const p = feedPose(i), previous = feedPose(i - 1);
    close(p.x, first.x);
    for (const key of ['a', 'b', 'c', 'd']) close(p[key], first[key]);
    assert.ok(p.y > previous.y && p.y - previous.y < first.ry / 4,
      'each blank adds a shallow layer rather than another conveyor position');
    close(p.contact.y - previous.contact.y, p.y - previous.y);
  }
});

test('collector stacks stay inside the tray, with positive room for their rims', () => {
  const C = L.collector, cells = C.columns.length * C.rows.length;
  for (let i = 0; i < 24; i++) {
    const p = collectorPose(i);
    assert.ok(p.x - p.rx > C.left && p.x + p.rx < C.right);
    assert.ok(p.y - p.ry > C.top && p.y + p.ry < C.bottom);
    if (i >= cells) {
      const below = collectorPose(i - cells);
      close(p.x, below.x); close(below.y - p.y, C.layerHeight);
      assert.equal(p.layer, below.layer + 1);
    }
  }
});

test('legacy collector adapter retains a continuous trajectory', () => {
  const O = L.outlet;
  samePose(getCollectorOutletPose({ t: O.indexStart }), BELT_SLOTS.at(-1));
  for (const boundary of [O.indexStart, O.indexEnd, O.chuteEnd]) {
    const before = getCollectorOutletPose({ t: boundary - 1e-7, collectorIndex: 11 });
    const after = getCollectorOutletPose({ t: boundary + 1e-7, collectorIndex: 11 });
    samePose(before, after, 1e-3);
  }
  let last = getCollectorOutletPose({ t: O.indexStart });
  let sawRoller = false, sawChute = false;
  for (let t = O.indexStart + .001; t <= O.chuteEnd + .002; t += .001) {
    const p = getCollectorOutletPose({ t });
    assert.equal(p.visible, true); assert.equal(p.opacity, 1);
    assert.ok(Math.hypot(p.x - last.x, p.y - last.y) < 3);
    assert.ok(p.a * p.d - p.b * p.c > 0);
    sawRoller ||= p.phase === 'roller'; sawChute ||= p.phase === 'chute';
    last = p;
  }
  assert.ok(sawRoller && sawChute);
  assert.equal(getCollectorOutletPose({ t: O.chuteEnd }).landed, true);
});

test('all 24 record handoffs preserve their exact collector pose and identity', () => {
  const inventory = new CellInventory([{ id: 'demo-a' }, { id: 'demo-b' }, { id: 'demo-c' }]);
  for (let i = 0; i < inventory.capacity; i++) {
    const outgoing = inventory.belt.at(-1), collectorIndex = inventory.collector.length;
    assert.ok(inventory.begin({ id: `portrait-${i}` }));
    const before = getCollectorOutletPose({ t: 18, collectorIndex });
    assert.equal(before.opacity, 1); assert.equal(before.landed, true);
    assert.equal(inventory.commit().collected, outgoing);
    assert.equal(inventory.collector.at(-1), outgoing);
    samePose(before, collectorPose(inventory.collector.length - 1));
  }
  assert.equal(inventory.collector.length, inventory.capacity);
  assert.equal(inventory.canStart(), false);
});
