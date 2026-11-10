// Scores the printed image's visual presentation, never the depicted person.
// No names, hashes, randomness or external model are used. The same RGBA pixels
// always produce the same result. Measurements exclude the circular outer rim.
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const percent = value => Math.round(clamp(value) * 100);
const empty = () => ({
  score: 0, clarity: 0, composition: 0, color: 0,
  comment: '画面信息较少，补充主体后会更完整。', label: '作品效果分',
});

export function analyzePortrait({ data, width, height } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4
    || !data || data.length < width * height * 4) return empty();

  // A bounded analysis grid makes adjacent-pixel coherence comparable across
  // canvas sizes and avoids treating an upscaled source as extra detail.
  const size = Math.min(128, width, height), middle = (size - 1) / 2;
  const radius = size * .45, radiusSquared = radius * radius;
  const luminance = new Float64Array(size * size);
  const alpha = new Float64Array(size * size);
  const chroma = new Float64Array(size * size);
  const included = new Uint8Array(size * size);
  const histogram = new Float64Array(12);
  let weight = 0, possible = 0, sum = 0, squared = 0, colorSum = 0, hueWeight = 0;

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - middle, dy = y - middle;
    if (dx * dx + dy * dy > radiusSquared) continue;
    possible++;
    const sx = Math.min(width - 1, Math.floor((x + .5) * width / size));
    const sy = Math.min(height - 1, Math.floor((y + .5) * height / size));
    const index = (sy * width + sx) * 4, slot = y * size + x;
    const a = clamp(Number(data[index + 3]) / 255);
    const r = clamp(Number(data[index]) / 255), g = clamp(Number(data[index + 1]) / 255);
    const b = clamp(Number(data[index + 2]) / 255), maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b), delta = maximum - minimum;
    const luma = .2126 * r + .7152 * g + .0722 * b;
    included[slot] = 1; alpha[slot] = a; luminance[slot] = luma; chroma[slot] = delta;
    weight += a; sum += a * luma; squared += a * luma * luma; colorSum += a * delta;
    if (delta > .035) {
      let hue = maximum === r ? (g - b) / delta
        : maximum === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
      hue = ((hue / 6) % 1 + 1) % 1;
      histogram[Math.min(11, Math.floor(hue * 12))] += a * delta;
      hueWeight += a * delta;
    }
  }
  if (weight < 1e-6) return empty();
  const coverage = weight / possible, mean = sum / weight;
  const variance = Math.max(0, squared / weight - mean * mean), deviation = Math.sqrt(variance);
  let edges = 0, edgeWeight = 0, adjacentError = 0, adjacentWeight = 0;
  let salience = 0, centerX = 0, centerY = 0, secondMoment = 0;
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const index = y * size + x;
    if (!included[index] || !included[index - 1] || !included[index + 1]
      || !included[index - size] || !included[index + size]) continue;
    const a = Math.min(alpha[index], alpha[index - 1], alpha[index + 1],
      alpha[index - size], alpha[index + size]);
    if (a <= .01) continue;
    const gradient = (Math.abs(luminance[index + 1] - luminance[index - 1])
      + Math.abs(luminance[index + size] - luminance[index - size])) / 2;
    edges += gradient * a; edgeWeight += a;
    for (const neighbor of [index + 1, index + size]) {
      adjacentError += (luminance[index] - luminance[neighbor]) ** 2 * a;
      adjacentWeight += a;
    }
    const dx = (x - middle) / radius, dy = (y - middle) / radius;
    const detail = gradient * a;
    salience += detail; centerX += detail * dx; centerY += detail * dy;
    secondMoment += detail * (dx * dx + dy * dy);
  }

  // Uncorrelated pixel noise has abundant edges, but almost no neighboring
  // continuity. It therefore cannot win the clarity score through edge count.
  const correlation = variance > 1e-6 && adjacentWeight
    ? clamp(1 - adjacentError / adjacentWeight / (2 * variance)) : 0;
  const coherence = clamp((correlation - .15) / .8);
  const contrast = clamp(deviation / .22), detail = clamp(edges / Math.max(1, edgeWeight) / .065);
  const presence = clamp(deviation / .075);
  const coverageFactor = clamp(coverage / .95);
  const clarity = percent((.55 * contrast + .45 * detail) * (.3 + .7 * coherence) * coverageFactor);
  const centering = salience > 1e-6
    ? 1 - clamp(Math.hypot(centerX, centerY) / salience / .6) : 0;
  const focus = salience > 1e-6 ? clamp((.7 - secondMoment / salience) / .55) : 0;
  const composition = percent((.7 * centering + .3 * focus) * presence * coverageFactor);
  let hueDiversity = 0;
  if (hueWeight > 1e-6) for (const bucket of histogram) {
    const probability = bucket / hueWeight;
    if (probability > 0) hueDiversity -= probability * Math.log(probability) / Math.log(12);
  }
  const color = percent((.55 * clamp(colorSum / weight / .36) + .3 * hueDiversity
    + .15 * clamp(deviation / .2)) * presence * coverageFactor);
  const noise = clamp((.6 - correlation) / .6) * detail;
  const raw = clarity * .45 + composition * .25 + color * .3;
  const score = Math.round(clamp((8 + raw * .92 - noise * 36) * presence * coverageFactor, 0, 100));
  const comment = score < 20 || coverage < .35
    ? '画面信息较少，补充主体后会更完整。'
    : noise > .4 ? '细碎噪点偏多，主体轮廓还可以更清楚。'
    : clarity < 60 ? '轮廓稍柔和，提升清晰度会更出彩。'
    : composition < 65 ? '主体略偏边，居中一些会更醒目。'
    : color < 60 ? '色彩偏素雅，增加层次会更丰富。'
    : score >= 88 ? '轮廓清楚，构图集中，色彩层次出色。'
    : '主体清楚，色彩协调，整体效果自然。';
  return { score, clarity, composition, color, comment, label: '作品效果分' };
}
