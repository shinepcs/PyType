export const MILLISECONDS_PER_SECOND = 1_000;
export const MILLISECONDS_PER_MINUTE = 60_000;
export const MILLISECONDS_PER_DAY = 86_400_000;

export function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return minimum;
  }
  if (number === Number.POSITIVE_INFINITY) return maximum;
  if (number === Number.NEGATIVE_INFINITY) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

export function nonNegativeMilliseconds(value) {
  return clamp(value, 0, Number.MAX_SAFE_INTEGER);
}

export function timestampOf(value, fallback = 0) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : fallback;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : fallback;
  }

  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

export function elapsedMilliseconds(start, end) {
  return Math.max(0, timestampOf(end) - timestampOf(start));
}

export function createSystemClock() {
  return {
    now() {
      if (globalThis.performance?.now) {
        return globalThis.performance.now();
      }
      return Date.now();
    },
  };
}

export function asClock(clock = createSystemClock()) {
  if (typeof clock === "function") {
    return { now: clock };
  }
  if (clock && typeof clock.now === "function") {
    return clock;
  }
  throw new TypeError("clock must be a function or an object with now()");
}

export class ManualClock {
  constructor(initialTime = 0) {
    this.currentTime = timestampOf(initialTime);
  }

  now() {
    return this.currentTime;
  }

  set(time) {
    const next = timestampOf(time, Number.NaN);
    if (!Number.isFinite(next) || next < this.currentTime) {
      throw new RangeError("manual clock cannot move backwards");
    }
    this.currentTime = next;
    return this.currentTime;
  }

  advance(milliseconds) {
    const delta = nonNegativeMilliseconds(milliseconds);
    this.currentTime += delta;
    return this.currentTime;
  }
}
