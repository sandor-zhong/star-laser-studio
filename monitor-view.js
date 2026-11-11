import { PRINT_SURFACE, LASER_ORIGIN } from './scan-path.js';

export const HEADER_SIZE = Object.freeze({ width: 1080, height: 760 });
export const MONITOR_SCREEN = Object.freeze({ x: 135, y: 205, width: 810, height: 395 });
export const MONITOR_RADIUS = 28;
export const MONITOR_FEED = Object.freeze({ width: 1024, height: 512 });
export const MONITOR_TOKEN = Object.freeze({ x: 420, y: 260, a: 426, b: -104, c: 64, d: 210 });
export const MONITOR_THICKNESS = 18;

const cosine = Math.cos(PRINT_SURFACE.angle), sine = Math.sin(PRINT_SURFACE.angle);
const source = {
  a: cosine * PRINT_SURFACE.rx, b: sine * PRINT_SURFACE.rx,
  c: -sine * PRINT_SURFACE.ry, d: cosine * PRINT_SURFACE.ry,
};
const determinant = source.a * source.d - source.b * source.c;
// Apply the inverse photographed fixture basis, then the monitor token basis.
const matrix = {
  a: (MONITOR_TOKEN.a * source.d - MONITOR_TOKEN.c * source.b) / determinant,
  b: (MONITOR_TOKEN.b * source.d - MONITOR_TOKEN.d * source.b) / determinant,
  c: (-MONITOR_TOKEN.a * source.c + MONITOR_TOKEN.c * source.a) / determinant,
  d: (-MONITOR_TOKEN.b * source.c + MONITOR_TOKEN.d * source.a) / determinant,
};
const projectVector = (x, y) => ({ x: matrix.a * x + matrix.c * y, y: matrix.b * x + matrix.d * y });

export function projectMonitorPoint(point) {
  const projected = projectVector(point.x - PRINT_SURFACE.x, point.y - PRINT_SURFACE.y);
  return { x: MONITOR_TOKEN.x + projected.x, y: MONITOR_TOKEN.y + projected.y };
}

// The macro feed uses the real nozzle height and the same camera as the token.
// In particular, Z lift is a world-space movement before projection, rather
// than a fixed display offset from the engraving spot.
export function projectMonitorTool(pose) {
  return {
    tip: projectMonitorPoint({
      x: LASER_ORIGIN.x + pose.x,
      y: LASER_ORIGIN.nozzleY + pose.y - pose.lift,
    }),
    impact: pose.impact ? projectMonitorPoint(pose.impact) : null,
  };
}

// The pose must already include its physical lift. This affine projection
// moves both the center and its two basis vectors without applying lift twice.
export function projectMonitorPose(pose) {
  const center = projectMonitorPoint(pose);
  const horizontal = projectVector(pose.a, pose.b), vertical = projectVector(pose.c, pose.d);
  return { ...pose, ...center, a: horizontal.x, b: horizontal.y, c: vertical.x, d: vertical.y };
}

// Takes a projected feed pose. The floating HUD has no opaque bottom strip;
// zero-area contact at the full feed border has no visible pixels. The caller
// additionally clips the displayed feed to its rounded screen aperture.
export function monitorPoseVisible(pose) {
  if (!pose || !['x', 'y', 'a', 'b', 'c', 'd'].every(key => Number.isFinite(pose[key]))) return false;
  const rx = Math.hypot(pose.a, pose.c), ry = Math.hypot(pose.b, pose.d);
  // Rotated bounds contain square roots; ignore subpixel roundoff at tangency.
  const epsilon = 1e-9;
  return rx > 0 && ry > 0
    && pose.x + rx > epsilon && pose.x - rx < MONITOR_FEED.width - epsilon
    && pose.y + ry > epsilon && pose.y - ry < MONITOR_FEED.height - epsilon;
}
