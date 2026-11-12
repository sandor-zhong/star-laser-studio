// Rendering adapter: the established raster and handling clock stay unchanged,
// while every illuminated point is mapped onto the new upright workpiece.
import {
  getToolPose, getRasterSample, getHeadImpact,
  PRINT_SURFACE, TOOL_TIMING, ease,
} from './scan-path.js';
import { fixturePose } from './production-layout.js';

export const PRODUCTION_HEAD_PARK = Object.freeze({ x: 560, y: 510 });
export const PRODUCTION_BEAM_GAP = Object.freeze({ x: 52, y: -70 });
export const PRODUCTION_TOOL_ANGLE = Math.atan2(70, -52) - Math.PI / 2;
export const MACRO_FEED = Object.freeze({ width: 1024, height: 384 });
export const MACRO_SCREEN = Object.freeze({ x: 162, y: 70,
  width: 756, height: 284, w: 756, h: 284, radius: 24 });
export const MACRO_TOKEN = Object.freeze({ x: 390, y: 205, a: 177, b: -3, c: 0, d: 177 });
export const MACRO_THICKNESS = 9;
// Camel-case aliases match the layout vocabulary used by the scene.
export const macroFeed = MACRO_FEED;
export const macroScreen = MACRO_SCREEN;
export const macroToken = MACRO_TOKEN;

const fixture = fixturePose();
const cosine = Math.cos(PRINT_SURFACE.angle), sine = Math.sin(PRINT_SURFACE.angle);
const oldBasis = { a: PRINT_SURFACE.rx * cosine, b: PRINT_SURFACE.rx * sine,
  c: -PRINT_SURFACE.ry * sine, d: PRINT_SURFACE.ry * cosine };
const determinant = basis => basis.a * basis.d - basis.b * basis.c;

function mapBetween(from, to) {
  const det = determinant(from);
  return {
    a: (to.a * from.d - to.c * from.b) / det,
    b: (to.b * from.d - to.d * from.b) / det,
    c: (-to.a * from.c + to.c * from.a) / det,
    d: (-to.b * from.c + to.d * from.a) / det,
  };
}
const workpieceMap = mapBetween(oldBasis, fixture);
const macroMap = mapBetween(fixture, MACRO_TOKEN);
const vector = (matrix, p) => ({ x: matrix.a * p.x + matrix.c * p.y,
  y: matrix.b * p.x + matrix.d * p.y });
const point = (matrix, from, to, p) => {
  const v = vector(matrix, { x: p.x - from.x, y: p.y - from.y });
  return { x: to.x + v.x, y: to.y + v.y };
};
const mix = (a, b, p) => ({ x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p });
const interval = (t, start, end) => ease((t - start) / (end - start));

/** A logical point on the former shallow stock becomes the same local UV on
 * the upright portrait, including all individual four-line scan contacts. */
export function projectWorkpiecePoint(logicalPoint) {
  return point(workpieceMap, PRINT_SURFACE, fixture, logicalPoint);
}

function tipForSample(sample) {
  const centre = projectWorkpiecePoint(getHeadImpact(sample));
  return { x: centre.x + PRODUCTION_BEAM_GAP.x, y: centre.y + PRODUCTION_BEAM_GAP.y };
}
const firstTip = tipForSample(getRasterSample(0));
const lastTip = tipForSample(getRasterSample(1));
const retractedTip = Object.freeze({ x: lastTip.x + 70, y: lastTip.y - 50 });

/**
 * The tip is an actual nozzle position, never a display-space offset. Its
 * angled beam reaches the upright face, and is dark during loading/retract.
 */
export function getProductionTool(elapsed = 0) {
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const old = getToolPose(t), T = TOOL_TIMING;
  const scanning = t >= T.scanStart && t < T.scanEnd;
  let tip = { ...PRODUCTION_HEAD_PARK };
  if (t >= T.headLoadStart && t < T.scanStart) {
    tip = mix(PRODUCTION_HEAD_PARK, firstTip, interval(t, T.headLoadStart, T.scanStart));
  } else if (scanning) {
    tip = tipForSample(old.raster);
  } else if (t >= T.scanEnd && t < T.retractEnd) {
    tip = mix(lastTip, retractedTip, interval(t, T.scanEnd, T.retractEnd));
  } else if (t >= T.retractEnd && t < T.headReturnEnd) {
    tip = mix(retractedTip, PRODUCTION_HEAD_PARK, interval(t, T.retractEnd, T.headReturnEnd));
  }
  return { ...old, tip, angle: PRODUCTION_TOOL_ANGLE,
    laser: scanning && old.laser,
    impact: scanning && old.impact ? projectWorkpiecePoint(old.impact) : null,
    microImpacts: scanning ? (old.microImpacts ?? []).map(projectWorkpiecePoint) : [],
  };
}

/** One affine camera is used by the material, nozzle, beam and carried parts. */
export function projectMacroPoint(p) {
  return point(macroMap, fixture, MACRO_TOKEN, p);
}

export function projectMacroPose(pose) {
  const centre = projectMacroPoint(pose);
  const horizontal = vector(macroMap, { x: pose.a, y: pose.b });
  const vertical = vector(macroMap, { x: pose.c, y: pose.d });
  const result = { ...pose, ...centre, a: horizontal.x, b: horizontal.y,
    c: vertical.x, d: vertical.y };
  result.rx = Math.hypot(result.a, result.c);
  result.ry = Math.hypot(result.b, result.d);
  result.angle = Math.atan2(result.b, result.a);
  if (pose.contact) {
    result.contact = projectMacroPoint(pose.contact);
    result.supportX = result.contact.x; result.supportY = result.contact.y;
  }
  return result;
}

export function projectMacroTool(tool) {
  const down = vector(macroMap, { x: -Math.sin(tool.angle), y: Math.cos(tool.angle) });
  return { ...tool, tip: projectMacroPoint(tool.tip),
    impact: tool.impact ? projectMacroPoint(tool.impact) : null,
    microImpacts: (tool.microImpacts ?? []).map(projectMacroPoint),
    angle: Math.atan2(down.y, down.x) - Math.PI / 2,
  };
}
