import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePortrait } from './portrait-score.js';

function image(paint, size = 128) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    data.set(paint((x + .5) / size, (y + .5) / size, x, y), (y * size + x) * 4);
  }
  return { data, width: size, height: size };
}

// A centered, coherent illustration with several color regions and fine lines.
const illustration = (offset = 0, muted = false) => image((x, y) => {
  x -= offset;
  const face = ((x - .5) / .23) ** 2 + ((y - .5) / .3) ** 2 < 1;
  const hair = ((x - .5) / .3) ** 2 + ((y - .4) / .3) ** 2 < 1 && y < .43;
  const eyes = ((x - .41) ** 2 + (y - .49) ** 2 < .025 ** 2)
    || ((x - .59) ** 2 + (y - .49) ** 2 < .025 ** 2);
  let color = eyes ? [22, 28, 34] : hair ? [52, 34, 65] : face ? [248, 185, 143]
    : y > .7 && Math.abs(x - .5) < .32 ? [35, 132, 186]
    : [55 + y * 90, 170 + x * 45, 185 + y * 55];
  if (muted) color = color.map(value => 128 + (value - 128) * .27);
  return [...color, 255];
});

test('same pixels always produce the same bounded work-effect assessment', () => {
  const portrait = illustration(), first = analyzePortrait(portrait);
  assert.deepEqual(analyzePortrait(portrait), first);
  assert.equal(first.label, '作品效果分');
  assert.equal(typeof first.comment, 'string');
  for (const key of ['score', 'clarity', 'composition', 'color']) {
    assert.ok(Number.isInteger(first[key]) && first[key] >= 0 && first[key] <= 100);
  }
  assert.ok(first.score >= 70 && first.score <= 95, `illustration scored ${first.score}`);
});

test('transparent pixels, flat fills and empty images score below a structured illustration', () => {
  const normal = analyzePortrait(illustration());
  for (const empty of [image(() => [255, 255, 255, 255]), image(() => [190, 30, 80, 255]),
    image((x, y) => [x * 255, y * 255, 100, 0])]) {
    const result = analyzePortrait(empty);
    assert.ok(result.score < 25);
    assert.ok(result.score < normal.score);
  }
  assert.equal(analyzePortrait().score, 0);
});

test('random pixel edges cannot outrank coherent colored image content', () => {
  let value = 431;
  const noise = image(() => {
    const next = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value >>> 24; };
    return [next(), next(), next(), 255];
  });
  const normal = analyzePortrait(illustration()), noisy = analyzePortrait(noise);
  assert.ok(noisy.score < normal.score - 20, `${noisy.score} vs ${normal.score}`);
  assert.ok(noisy.clarity < normal.clarity);
});

test('outer corners and circular rim do not change the printed inner-image score', () => {
  const portrait = illustration(), altered = { ...portrait, data: portrait.data.slice() };
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    if (Math.hypot(x - 63.5, y - 63.5) > 128 * .45) {
      altered.data.set([255, 0, 255, 0], (y * 128 + x) * 4);
    }
  }
  assert.deepEqual(analyzePortrait(altered), analyzePortrait(portrait));
});

test('lower contrast and off-center composition affect their corresponding measurements', () => {
  const normal = analyzePortrait(illustration()), muted = analyzePortrait(illustration(0, true));
  const shifted = analyzePortrait(illustration(.3));
  assert.ok(muted.clarity < normal.clarity);
  assert.ok(muted.color < normal.color);
  assert.ok(muted.score < normal.score);
  assert.ok(shifted.composition < normal.composition);
  assert.notEqual(muted.score, normal.score);
});
