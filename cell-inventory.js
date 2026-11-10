// The records here describe physical workpieces, independent of animation time.
// Rendering may move a record between visible stations; only commit transfers
// ownership from the running cycle to the stopped belt and receiving tray.
const copyAssessment = assessment => assessment && typeof assessment === 'object'
  ? Object.freeze({ ...assessment }) : null;

export class CellInventory {
  #initialPortraits;
  #initialAssessments;
  #sequence = 0;
  #active = null;
  #belt = [null, null, null, null];
  #collector = [];

  constructor(initialPortraits = [], capacity = 24, { initialAssessments = [] } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('Collector capacity must be a positive integer.');
    }
    this.capacity = capacity;
    this.#initialPortraits = initialPortraits.slice(0, 3);
    this.#initialAssessments = initialAssessments.slice(0, 3).map(copyAssessment);
    this.reset();
  }

  #record(portrait, prefix, { assessment = null, nickname = '' } = {}) {
    const id = `${prefix}-${String(++this.#sequence).padStart(5, '0')}`;
    return Object.freeze({ id, portrait, assessment: copyAssessment(assessment), nickname: String(nickname ?? '') });
  }

  get active() { return this.#active; }
  get belt() { return [...this.#belt]; }
  get collector() { return [...this.#collector]; }

  canStart() {
    return this.#active === null && this.#collector.length < this.capacity;
  }

  begin(portrait, { assessment = null, nickname = '' } = {}) {
    if (!this.canStart()) return false;
    this.#active = this.#record(portrait, 'work', { assessment, nickname });
    return true;
  }

  commit() {
    if (this.#active === null) return null;
    const placed = this.#active;
    const outgoing = this.#belt[3];
    if (outgoing !== null) this.#collector.push(outgoing);
    this.#belt = [null, placed, this.#belt[1], this.#belt[2]];
    this.#active = null;
    return { collected: outgoing, outgoing, placed };
  }

  clearCollector() {
    const removed = this.#collector;
    this.#collector = [];
    return [...removed];
  }

  reset() {
    this.#active = null;
    this.#collector = [];
    this.#belt = [null, null, null, null];
    this.#initialPortraits.forEach((portrait, index) => {
      this.#belt[index + 1] = this.#record(portrait, 'demo', { assessment: this.#initialAssessments[index] });
    });
  }

  snapshot() {
    return {
      active: this.#active,
      belt: [...this.#belt],
      collector: [...this.#collector],
    };
  }
}
