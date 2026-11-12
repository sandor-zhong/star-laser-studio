// Entertainment score for one workpiece. Generate once when a job is created;
// keep that assessment through gift upgrades, rendering and completion.
export const CHALLENGE_MAX_SCORE = 100000;
const RANGE = CHALLENGE_MAX_SCORE + 1;
const UINT32_RANGE = 0x100000000;

function makeAssessment(score) {
  return { score, label: '随机作品分', mode: 'random', min: 0, max: CHALLENGE_MAX_SCORE };
}

function secureScore() {
  const cryptoSource = globalThis.crypto;
  if (typeof cryptoSource?.getRandomValues === 'function') {
    // Reject the incomplete tail so all 100001 possible scores are equally likely.
    const limit = Math.floor(UINT32_RANGE / RANGE) * RANGE;
    const sample = new Uint32Array(1);
    do { cryptoSource.getRandomValues(sample); } while (sample[0] >= limit);
    return sample[0] % RANGE;
  }
  return Math.floor(Math.random() * RANGE);
}

export function createChallengeAssessment(random) {
  if (random === undefined) return makeAssessment(secureScore());
  if (typeof random !== 'function') throw new TypeError('随机采样器必须为函数');
  const sample = random();
  if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0 || sample > 1) {
    throw new RangeError('随机采样结果应在 0–1 之间');
  }
  return makeAssessment(Math.min(CHALLENGE_MAX_SCORE, Math.floor(sample * RANGE)));
}

export function normalizeChallengeAssessment(assessment) {
  if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)
      || assessment.mode !== 'random'
      || typeof assessment.score !== 'number' || !Number.isInteger(assessment.score)
      || assessment.score < 0 || assessment.score > CHALLENGE_MAX_SCORE
      || (assessment.min !== undefined && assessment.min !== 0)
      || (assessment.max !== undefined && assessment.max !== CHALLENGE_MAX_SCORE)) return null;
  return makeAssessment(assessment.score);
}

export function formatChallengeScore(value) {
  const score = typeof value === 'number' && Number.isFinite(value)
    ? Math.min(CHALLENGE_MAX_SCORE, Math.max(0, Math.round(value))) : 0;
  return score.toLocaleString('en-US');
}
