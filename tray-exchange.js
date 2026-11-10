// Wall-clock seconds: the tray changer does not speed up with engraving.
export const TRAY_EXCHANGE_TIMING = Object.freeze({
  withdrawEnd: 1.5,
  handoffEnd: 2.05,
  returnEnd: 3.55,
  total: 3.8,
});

// The tray's left edge starts at x=550 in the photo plane. This travel puts
// the entire loaded tray beyond the wide camera's right edge before handoff.
export const TRAY_TRAVEL = 430;

const smooth = value => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * p * (p * (p * 6 - 15) + 10);
};

export function getTrayExchangePose(elapsed = 0) {
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const T = TRAY_EXCHANGE_TIMING;
  let phase;
  let offsetX;
  if (t < T.withdrawEnd) {
    phase = 'withdraw';
    offsetX = TRAY_TRAVEL * smooth(t / T.withdrawEnd);
  } else if (t < T.handoffEnd) {
    phase = 'handoff';
    offsetX = TRAY_TRAVEL;
  } else if (t < T.returnEnd) {
    phase = 'return';
    offsetX = TRAY_TRAVEL * (1 - smooth((t - T.handoffEnd) / (T.returnEnd - T.handoffEnd)));
  } else {
    phase = 'dock';
    offsetX = 0;
  }
  return {
    phase,
    offsetX,
    loaded: t < T.handoffEnd,
    // This is a latched event flag. The scene commits the inventory transfer
    // once, on the first true value, while the full tray is out of view.
    transferReady: t >= T.withdrawEnd,
    complete: t >= T.total,
  };
}
