import test from 'node:test';
import assert from 'node:assert/strict';
import { CellInventory } from './cell-inventory.js';

const records = snapshot => [snapshot.active, ...snapshot.belt, ...snapshot.collector]
  .filter(Boolean);
const ids = snapshot => records(snapshot).map(record => record.id).sort();
const demos = ['demo-a', 'demo-b', 'demo-c'];

test('initial belt has a free loading berth and three unique demonstration pieces', () => {
  const cell = new CellInventory(demos);
  assert.equal(cell.capacity, 24);
  assert.deepEqual(cell.belt.map(record => record?.portrait ?? null), [null, ...demos]);
  assert.deepEqual(cell.collector, []);
  assert.equal(cell.active, null);
  assert.equal(new Set(ids(cell.snapshot())).size, 3);
  assert.ok(cell.canStart());
});

test('a workpiece can be started once and is only transferred at commit', () => {
  const cell = new CellInventory(demos);
  const oldBelt = cell.belt;
  assert.ok(cell.begin('portrait'));
  const active = cell.active;
  assert.match(active.id, /^work-\d+$/);
  assert.equal(cell.begin('another-portrait'), false);
  assert.equal(cell.active, active);
  assert.equal(cell.canStart(), false);
  assert.deepEqual(cell.belt, oldBelt);
  assert.deepEqual(cell.collector, []);
  const before = ids(cell.snapshot());
  const result = cell.commit();
  assert.deepEqual(ids(cell.snapshot()), before);
  assert.equal(result.placed, active);
  assert.equal(result.collected, oldBelt[3]);
  assert.equal(result.outgoing, result.collected);
  assert.deepEqual(cell.belt, [null, active, oldBelt[1], oldBelt[2]]);
  assert.deepEqual(cell.collector, [oldBelt[3]]);
  const after = cell.snapshot();
  assert.equal(cell.commit(), null);
  assert.deepEqual(cell.snapshot(), after);
});

test('100 cycles conserve every ID and retained collector piece until explicitly removed', () => {
  const cell = new CellInventory(demos);
  const created = new Set(ids(cell.snapshot())), removed = new Set();
  let collectedCount = 0, removedCount = 0;
  for (let cycle = 0; cycle < 100; cycle++) {
    if (!cell.canStart()) {
      assert.equal(cell.collector.length, cell.capacity);
      assert.equal(cell.begin(`blocked-${cycle}`), false);
      for (const record of cell.clearCollector()) {
        assert.equal(removed.has(record.id), false);
        removed.add(record.id); removedCount++;
      }
    }
    assert.ok(cell.begin(`portrait-${cycle}`));
    assert.equal(created.has(cell.active.id), false);
    created.add(cell.active.id);
    const before = ids(cell.snapshot());
    const result = cell.commit();
    assert.deepEqual(ids(cell.snapshot()), before);
    if (result.collected) collectedCount++;
    const snapshot = cell.snapshot(), ownedIds = ids(snapshot);
    assert.equal(new Set(ownedIds).size, ownedIds.length);
    assert.equal(snapshot.collector.length, collectedCount - removedCount);
    assert.ok(snapshot.collector.length <= cell.capacity);
    assert.equal(ownedIds.length + removed.size, created.size);
    assert.deepEqual(new Set([...ownedIds, ...removed]), created);
  }
  assert.equal(collectedCount, 100);
  assert.equal(created.size, 103);
});

test('clearing the tray never resets an active print or belt records', () => {
  const cell = new CellInventory(demos, 2);
  cell.begin('first'); cell.commit();
  cell.begin('printing');
  const active = cell.active, belt = cell.belt, collector = cell.collector;
  assert.deepEqual(cell.clearCollector(), collector);
  assert.equal(cell.active, active);
  assert.deepEqual(cell.belt, belt);
  assert.deepEqual(cell.collector, []);
  assert.equal(cell.begin('duplicate'), false);
  cell.commit();
  assert.equal(cell.belt[1], active);
});

test('a full tray blocks starting until the user removes its contents', () => {
  const cell = new CellInventory(demos, 1);
  cell.begin('one'); cell.commit();
  assert.equal(cell.canStart(), false);
  const before = cell.snapshot();
  assert.equal(cell.begin('two'), false);
  assert.deepEqual(cell.snapshot(), before);
  cell.clearCollector();
  assert.ok(cell.canStart());
  assert.ok(cell.begin('two'));
});

test('reset restores the original demonstration portraits with fresh unique records', () => {
  const cell = new CellInventory(demos);
  const oldIds = new Set(ids(cell.snapshot()));
  cell.begin('finished'); cell.commit();
  cell.begin('unfinished');
  cell.reset();
  assert.equal(cell.active, null);
  assert.deepEqual(cell.collector, []);
  assert.deepEqual(cell.belt.map(record => record?.portrait ?? null), [null, ...demos]);
  for (const id of ids(cell.snapshot())) assert.equal(oldIds.has(id), false);
});

test('snapshot array edits cannot discard or duplicate owned inventory records', () => {
  const cell = new CellInventory(demos);
  cell.begin('print'); cell.commit();
  const before = ids(cell.snapshot()), snapshot = cell.snapshot();
  snapshot.belt.splice(0); snapshot.collector.push(snapshot.active);
  cell.belt.splice(0); cell.collector.splice(0);
  assert.deepEqual(ids(cell.snapshot()), before);
  assert.ok(Object.isFrozen(cell.belt[1]));
});

test('an empty demonstration belt still retains all newly made pieces', () => {
  const cell = new CellInventory();
  for (let cycle = 0; cycle < 4; cycle++) {
    cell.begin(cycle);
    const before = ids(cell.snapshot());
    cell.commit();
    assert.deepEqual(ids(cell.snapshot()), before);
  }
  assert.equal(cell.collector.length, 1);
  assert.equal(records(cell.snapshot()).length, 4);
});
