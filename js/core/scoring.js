import { clamp, nonNegativeMilliseconds } from "../utils/time.js";

export const SCORING = Object.freeze({
  basePoints: 80,
  pointsPerCharacter: 2,
  maximumScoredLength: 40,
  levelMultipliers: Object.freeze({ 1: 1, 2: 1.15 }),
  maximumSpeedBonusRatio: 0.25,
  comboStep: 5,
  comboStepBonus: 0.05,
  maximumComboBonus: 0.5,
  maximumFinalScore: 10_000_000,
  maximumWpm: 250,
});

export function roundTo(value, decimalPlaces = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateAccuracy(correctKeystrokes, totalKeystrokes) {
  const total = Math.max(0, Math.trunc(Number(totalKeystrokes) || 0));
  if (total === 0) {
    return 0;
  }
  const correct = clamp(Math.trunc(Number(correctKeystrokes) || 0), 0, total);
  return roundTo((correct / total) * 100, 2);
}

export function calculateWpm(correctKeystrokes, activeTypingMs) {
  const correct = Math.max(0, Math.trunc(Number(correctKeystrokes) || 0));
  const duration = nonNegativeMilliseconds(activeTypingMs);
  if (correct === 0 || duration === 0) {
    return 0;
  }
  const minutes = duration / 60_000;
  return roundTo(Math.max(0, correct / 5 / minutes), 2);
}

export function calculateKeystrokesPerSecond(correctKeystrokes, activeTypingMs) {
  const correct = Math.max(0, Math.trunc(Number(correctKeystrokes) || 0));
  const duration = nonNegativeMilliseconds(activeTypingMs);
  if (correct === 0 || duration === 0) {
    return 0;
  }
  return roundTo(correct / (duration / 1_000), 2);
}

export function getAccuracyMultiplier(accuracy) {
  const safeAccuracy = clamp(accuracy, 0, 100);
  if (safeAccuracy >= 98) return 1.25;
  if (safeAccuracy >= 95) return 1.15;
  if (safeAccuracy >= 90) return 1;
  if (safeAccuracy >= 80) return 0.8;
  return 0.5;
}

export function getComboMultiplier(comboAfterSolve) {
  const combo = Math.max(0, Math.trunc(Number(comboAfterSolve) || 0));
  const bonus = Math.min(
    Math.floor(combo / SCORING.comboStep) * SCORING.comboStepBonus,
    SCORING.maximumComboBonus,
  );
  return 1 + bonus;
}

export function advanceCombo(currentCombo, cleanSolve) {
  if (!cleanSolve) {
    return 0;
  }
  return Math.max(0, Math.trunc(Number(currentCombo) || 0)) + 1;
}

export function calculateProblemScore({
  answer,
  targetLength = typeof answer === "string" ? answer.length : 0,
  level,
  targetSeconds,
  elapsedSeconds,
  elapsedMs,
  comboAfterSolve = 0,
}) {
  if (level !== 1 && level !== 2) {
    throw new RangeError("level must be 1 or 2");
  }

  const length = clamp(Math.trunc(Number(targetLength) || 0), 0, Number.MAX_SAFE_INTEGER);
  const lengthPoints = Math.min(length, SCORING.maximumScoredLength) * SCORING.pointsPerCharacter;
  const basePoints = SCORING.basePoints + lengthPoints;
  const target = Math.max(0, Number(targetSeconds) || 0);
  const elapsed = elapsedSeconds === undefined
    ? nonNegativeMilliseconds(elapsedMs) / 1_000
    : Math.max(0, Number(elapsedSeconds) || 0);
  const speedRatio = target === 0 ? 0 : clamp((target - elapsed) / target, 0, 1);
  const speedBonus = basePoints * SCORING.maximumSpeedBonusRatio * speedRatio;
  const unrounded = (
    basePoints * SCORING.levelMultipliers[level]
    + speedBonus
  ) * getComboMultiplier(comboAfterSolve);

  // Decimal multipliers such as 1.15 can produce 127.49999999999999 in binary.
  // Stabilize the documented mathematical half before applying integer rounding.
  return Math.max(0, Math.round(roundTo(unrounded, 10)));
}

export function calculateFinalScore(problemScoresOrTotal, accuracy) {
  const total = Array.isArray(problemScoresOrTotal)
    ? problemScoresOrTotal.reduce((sum, score) => sum + Math.max(0, Number(score) || 0), 0)
    : Math.max(0, Number(problemScoresOrTotal) || 0);
  return clamp(
    Math.round(roundTo(total * getAccuracyMultiplier(accuracy), 10)),
    0,
    SCORING.maximumFinalScore,
  );
}

export function calculateSessionMetrics({
  correctKeystrokes = 0,
  totalKeystrokes = 0,
  activeTypingMs = 0,
  problemScores = [],
  rawScore,
} = {}) {
  const accuracy = calculateAccuracy(correctKeystrokes, totalKeystrokes);
  const scoreBeforeAccuracy = rawScore === undefined
    ? problemScores.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)
    : Math.max(0, Number(rawScore) || 0);

  return Object.freeze({
    accuracy,
    wpm: calculateWpm(correctKeystrokes, activeTypingMs),
    keystrokesPerSecond: calculateKeystrokesPerSecond(correctKeystrokes, activeTypingMs),
    rawScore: Math.round(scoreBeforeAccuracy),
    accuracyMultiplier: getAccuracyMultiplier(accuracy),
    finalScore: calculateFinalScore(scoreBeforeAccuracy, accuracy),
  });
}
