import test from 'node:test';
import assert from 'node:assert/strict';
import { createChallengeAssessment, normalizeChallengeAssessment, formatChallengeScore, CHALLENGE_MAX_SCORE } from './challenge-score.js';

test('each creation samples once and includes both requested score boundaries', () => {
  const samples = [0, .5, 1];
  let calls = 0;
  const assessments = samples.map(() => createChallengeAssessment(() => samples[calls++]));
  assert.deepEqual(assessments.map(value => value.score), [0, 50000, 100000]);
  assert.equal(calls, 3);
  assert.equal(CHALLENGE_MAX_SCORE, 100000);
  assert.notEqual(assessments[0], assessments[1]);
  assert.deepEqual(assessments[0], { score: 0, label: '随机作品分', mode: 'random', min: 0, max: 100000 });
});

test('invalid samplers cannot create nonfinite, out of range or nonnumeric scores', () => {
  for (const sample of [-.01, 1.01, NaN, Infinity, -Infinity, '0.5', null, true]) {
    assert.throws(() => createChallengeAssessment(() => sample), RangeError);
  }
  assert.throws(() => createChallengeAssessment(.5), TypeError);
});

test('default entropy always produces bounded integer scores with fresh immutable-by-convention values', () => {
  const scores = Array.from({ length: 256 }, () => createChallengeAssessment());
  assert.ok(scores.every(value => Number.isInteger(value.score) && value.score >= 0 && value.score <= 100000));
  assert.ok(new Set(scores.map(value => value.score)).size > 1);
  scores[0].score = -1;
  assert.ok(scores[1].score >= 0);
});

test('crypto sampling rejects the incomplete uint32 tail before assigning a score', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let calls = 0;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    getRandomValues(values) {
      values[0] = calls++ === 0 ? 0xffffffff : 96830;
      return values;
    },
  } });
  try {
    assert.equal(createChallengeAssessment().score, 96830);
    assert.equal(calls, 2);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else delete globalThis.crypto;
  }
});

test('server normalization accepts canonical random scores and drops extra client fields', () => {
  for (const score of [0, 96830, 100000]) {
    const source = { score, mode: 'random', min: 0, max: 100000, clarity: 99, label: 'misleading AI judgement' };
    const result = normalizeChallengeAssessment(source);
    assert.deepEqual(result, { score, label: '随机作品分', mode: 'random', min: 0, max: 100000 });
    assert.notEqual(result, source);
  }
});

test('server normalization rejects malformed or historical image-analysis assessments', () => {
  for (const value of [null, [], {}, { score: 98 }, { score: '96830', mode: 'random' },
    ...[-1, 100001, 1.2, NaN, Infinity, true].map(score => ({ score, mode: 'random' })),
    { score: 1, mode: 'random', min: 1 }, { score: 1, mode: 'random', max: 100 }]) {
    assert.equal(normalizeChallengeAssessment(value), null);
  }
});

test('score formatting preserves zero and six digit upper bound without invalid display values', () => {
  assert.equal(formatChallengeScore(0), '0');
  assert.equal(formatChallengeScore(96830), '96,830');
  assert.equal(formatChallengeScore(100000), '100,000');
  assert.equal(formatChallengeScore(100001), '100,000');
  assert.equal(formatChallengeScore(-1), '0');
  assert.equal(formatChallengeScore(NaN), '0');
});
