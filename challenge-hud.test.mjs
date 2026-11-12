import test from 'node:test';
import assert from 'node:assert/strict';
import { getChallengeBoardData } from './challenge-hud.js';

const active = score => ({ nickname: '观众', assessment: { score } });

test('loading and inactive phases show no stale score', () => {
  for (const phase of ['loading', 'idle', 'tray-exchange']) {
    const data = getChallengeBoardData({ active: active(100000), phase, progress: .78, scoreProgress: 1 });
    assert.equal(data.score, null); assert.equal(data.displayScore, null); assert.equal(data.stars, 0);
  }
});

test('score advances with engraving and reaches the final value exactly at completion', () => {
  const begin = getChallengeBoardData({ active: active(100000), phase: 'engraving', progress: 0 });
  const middle = getChallengeBoardData({ active: active(100000), phase: 'engraving', progress: .5 });
  const end = getChallengeBoardData({ active: active(100000), phase: 'unloading' });
  assert.equal(begin.displayScore, 0); assert.equal(middle.displayScore, 50000);
  assert.equal(end.displayScore, 100000); assert.equal(end.scoreText, '100,000'); assert.equal(end.stars, 5);
  for(const score of [0,1,96830,100000]){
    let previous=0;
    for(let i=0;i<1000;i++){
      const data=getChallengeBoardData({active:active(score),phase:'engraving',progress:i/1000});
      assert.ok(data.displayScore>=previous&&data.displayScore<=score);
      if(score)assert.ok(data.displayScore<score,'no final score before engraving ends');
      previous=data.displayScore;
    }
    for(const phase of ['finishing','rating','unloading'])assert.equal(getChallengeBoardData({active:active(score),phase,scoreProgress:0}).displayScore,score);
  }
});

test('zero is a valid score and grants zero stars', () => {
  const data = getChallengeBoardData({ active: active(0), phase: 'rating', scoreProgress: 1 });
  assert.equal(data.score, 0); assert.equal(data.displayScore, 0); assert.equal(data.scoreText, '0');
  assert.equal(data.stars, 0);
});

test('ranking is descending, stable for ties, capped at 10 and never mutates input', () => {
  const records = Array.from({ length: 13 }, (_, i) => ({ nickname: `观众${i}`, assessment: { score: i < 2 ? 100000 : i } }));
  const before = JSON.stringify(records);
  const data = getChallengeBoardData({ ranking: records });
  assert.equal(data.ranking.length, 10);
  assert.deepEqual(data.ranking.slice(0, 3).map(item => item.nickname), ['观众0', '观众1', '观众12']);
  assert.deepEqual(data.ranking.map(item => item.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(JSON.stringify(records), before);
});

test('empty/invalid results do not create fake ranked scores; real zero is included', () => {
  const data = getChallengeBoardData({ ranking: [{ nickname: '未知' }, active(NaN), active(0)] });
  assert.equal(data.ranking.length, 1); assert.equal(data.ranking[0].score, 0);
});

test('real scan measurements, paused status and cleared active name survive each phase', () => {
  const scan = getChallengeBoardData({ active: active(12), phase: 'engraving', progress: .78, paused: true, completedCount: 8 });
  assert.equal(scan.percent, 78); assert.equal(scan.status, '已暂停'); assert.equal(scan.completedCount, 8);
  assert.ok(scan.completedRows > 0 && scan.completedRows < scan.totalRows);
  const idle = getChallengeBoardData({ active: active(99), phase: 'idle', progress: 1 });
  assert.equal(idle.hasActive, false); assert.equal(idle.nickname, ''); assert.equal(idle.percent, 0);
});
