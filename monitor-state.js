import { getHandlingState, HANDLING_TIMING as T } from './handling-cycle.js';
import { getToolPose } from './scan-path.js';

const clamp = value => Math.max(0, Math.min(1, value));

// This state describes the one physical active record. The monitor renderer
// still clips its projected bounds; candidate visibility does not duplicate it.
export function getMonitorState(elapsed, active, { trayBusy = false, paused = false } = {}) {
  if (!active) return {
    phase: trayBusy ? 'tray-exchange' : 'idle',
    partId: null, partLocation: null,
    portraitVisible: false, workpieceVisible: false,
    progress: 0, score: null, scoreProgress: 0, nickname: '', paused: Boolean(paused),
  };
  const t = Number.isFinite(elapsed) ? Math.max(0, Math.min(T.total, elapsed)) : 0;
  const handling = getHandlingState(t), progress = getToolPose(t).reveal;
  const phase = t < T.scanStart ? 'loading'
    : t < T.scanEnd ? 'engraving'
    : t < T.displayStart ? 'finishing'
    : t < T.displayEnd ? 'rating' : 'unloading';
  const workpieceVisible = handling.partLocation === 'fixture' || handling.partLocation === 'gripper';
  const assessmentScore = active.assessment?.score;
  return {
    phase, partId: active.id ?? null, partLocation: handling.partLocation,
    portraitVisible: workpieceVisible && progress > 0,
    workpieceVisible, progress,
    score: t >= T.scanStart && Number.isFinite(assessmentScore) ? assessmentScore : null,
    scoreProgress: progress,
    nickname: String(active.nickname ?? ''), paused: Boolean(paused),
  };
}
