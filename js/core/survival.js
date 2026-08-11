import { clamp, nonNegativeMilliseconds } from "../utils/time.js";

export const SURVIVAL = Object.freeze({
  startingDanger: 20,
  maximumDanger: 100,
  normalRatePerSecond: 2,
  overtimeRatePerSecond: 3,
  typoPenalty: 1,
  maximumTypoPenaltyPerQuestion: 5,
  solveRecovery: 15,
  cleanSolveRecovery: 3,
});

export function clampDanger(value) {
  return clamp(value, 0, SURVIVAL.maximumDanger);
}

export function calculateTimedDangerIncrease({
  fromElapsedMs = 0,
  toElapsedMs,
  deltaMs,
  targetMs,
}) {
  const start = nonNegativeMilliseconds(fromElapsedMs);
  const end = toElapsedMs === undefined
    ? start + nonNegativeMilliseconds(deltaMs)
    : Math.max(start, nonNegativeMilliseconds(toElapsedMs));
  const target = nonNegativeMilliseconds(targetMs);
  const normalEnd = Math.min(end, target);
  const normalMs = Math.max(0, normalEnd - Math.min(start, target));
  const overtimeMs = Math.max(0, end - Math.max(start, target));

  return (
    normalMs * SURVIVAL.normalRatePerSecond
    + overtimeMs * SURVIVAL.overtimeRatePerSecond
  ) / 1_000;
}

export function advanceDanger(danger, options) {
  return clampDanger(danger + calculateTimedDangerIncrease(options));
}

export function applyTypoPenalty(danger, penaltiesAlreadyApplied = 0, attempts = 1) {
  const already = clamp(
    Math.trunc(Number(penaltiesAlreadyApplied) || 0),
    0,
    SURVIVAL.maximumTypoPenaltyPerQuestion,
  );
  const requested = Math.max(0, Math.trunc(Number(attempts) || 0));
  const applied = Math.min(requested, SURVIVAL.maximumTypoPenaltyPerQuestion - already);

  return Object.freeze({
    danger: clampDanger(danger + applied * SURVIVAL.typoPenalty),
    applied,
    penaltiesApplied: already + applied,
  });
}

export function applySolveRecovery(danger, cleanSolve) {
  const recovery = SURVIVAL.solveRecovery + (cleanSolve ? SURVIVAL.cleanSolveRecovery : 0);
  return clampDanger(danger - recovery);
}

export function isGameOver(danger) {
  return clampDanger(danger) >= SURVIVAL.maximumDanger;
}

export function millisecondsUntilGameOver({ danger, questionElapsedMs = 0, targetMs }) {
  let remainingDanger = SURVIVAL.maximumDanger - clampDanger(danger);
  if (remainingDanger <= 0) {
    return 0;
  }

  const elapsed = nonNegativeMilliseconds(questionElapsedMs);
  const target = nonNegativeMilliseconds(targetMs);
  if (elapsed < target) {
    const normalWindowMs = target - elapsed;
    const normalWindowDanger = normalWindowMs * SURVIVAL.normalRatePerSecond / 1_000;
    if (remainingDanger <= normalWindowDanger) {
      return remainingDanger / SURVIVAL.normalRatePerSecond * 1_000;
    }
    remainingDanger -= normalWindowDanger;
    return normalWindowMs + remainingDanger / SURVIVAL.overtimeRatePerSecond * 1_000;
  }

  return remainingDanger / SURVIVAL.overtimeRatePerSecond * 1_000;
}
