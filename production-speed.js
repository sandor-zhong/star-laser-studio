export const DEFAULT_SPEED = 1.8;
export const SPEED_OPTIONS = Object.freeze([1, 1.5, 1.8, 2, 2.5]);

export function normalizeSpeed(value) {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return SPEED_OPTIONS.includes(number) ? number : DEFAULT_SPEED;
}

export function cycleDuration(baseSeconds, speed = DEFAULT_SPEED) {
  return Math.max(0, Number.isFinite(baseSeconds) ? baseSeconds : 0) / normalizeSpeed(speed);
}

// Speed affects only the next increment, never the accumulated position.
// Cap production time as well as wall time after a hidden or stalled frame.
export function advanceProductionTime(elapsed, wallSeconds, speed, paused = false) {
  if (paused) return elapsed;
  const delta = Number.isFinite(wallSeconds) ? Math.max(0, wallSeconds) : 0;
  return elapsed + Math.min(.075, delta * normalizeSpeed(speed));
}
