import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceCombo,
  calculateAccuracy,
  calculateFinalScore,
  calculateProblemScore,
  calculateSessionMetrics,
  calculateWpm,
  getAccuracyMultiplier,
  getComboMultiplier,
} from "../js/core/scoring.js";

test("accuracy multiplier boundaries match the PRD exactly", () => {
  const cases = [
    [79.99, 0.5],
    [80, 0.8],
    [89.99, 0.8],
    [90, 1],
    [94.99, 1],
    [95, 1.15],
    [97.99, 1.15],
    [98, 1.25],
  ];
  for (const [accuracy, multiplier] of cases) {
    assert.equal(getAccuracyMultiplier(accuracy), multiplier, String(accuracy));
  }
});

test("accuracy and WPM handle zero and retain two decimals", () => {
  assert.equal(calculateAccuracy(0, 0), 0);
  assert.equal(calculateAccuracy(2, 3), 66.67);
  assert.equal(calculateWpm(0, 10_000), 0);
  assert.equal(calculateWpm(50, 60_000), 10);
  assert.equal(calculateWpm(100, 0), 0);
  assert.equal(calculateWpm(10_000, 1), 120_000_000, "the documented formula is not silently capped");
});

test("problem score rounds only after level, speed, and combo terms", () => {
  const base = {
    targetLength: 10,
    targetSeconds: 10,
    elapsedSeconds: 5,
  };
  assert.equal(calculateProblemScore({ ...base, level: 1, comboAfterSolve: 0 }), 113);
  assert.equal(calculateProblemScore({ ...base, level: 2, comboAfterSolve: 0 }), 128);
  assert.equal(calculateProblemScore({ ...base, level: 1, comboAfterSolve: 5 }), 118);
});

test("speed ratio and answer length are clamped", () => {
  const fast = calculateProblemScore({
    targetLength: 100,
    level: 1,
    targetSeconds: 10,
    elapsedSeconds: -100,
  });
  const atTarget = calculateProblemScore({
    targetLength: 40,
    level: 1,
    targetSeconds: 10,
    elapsedSeconds: 10,
  });
  const slow = calculateProblemScore({
    targetLength: 40,
    level: 1,
    targetSeconds: 10,
    elapsedSeconds: 100,
  });
  assert.equal(fast, 200);
  assert.equal(atTarget, 160);
  assert.equal(slow, atTarget);
});

test("combo changes in five-solve steps and caps at +50%", () => {
  assert.equal(advanceCombo(4, true), 5);
  assert.equal(advanceCombo(100, false), 0);
  assert.equal(getComboMultiplier(4), 1);
  assert.equal(getComboMultiplier(5), 1.05);
  assert.equal(getComboMultiplier(9), 1.05);
  assert.equal(getComboMultiplier(10), 1.1);
  assert.equal(getComboMultiplier(50), 1.5);
  assert.equal(getComboMultiplier(500), 1.5);
});

test("session accuracy is applied exactly once at the end", () => {
  const metrics = calculateSessionMetrics({
    correctKeystrokes: 98,
    totalKeystrokes: 100,
    activeTypingMs: 60_000,
    problemScores: [100, 100],
  });
  assert.equal(metrics.rawScore, 200);
  assert.equal(metrics.accuracyMultiplier, 1.25);
  assert.equal(metrics.finalScore, 250);
  assert.equal(calculateFinalScore(metrics.finalScore, 98), 313, "calling twice is observably different");
});

test("final score stabilizes decimal half rounding", () => {
  assert.equal(calculateFinalScore(110, 95), 127);
});

test("an accurate profile beats an equally productive inaccurate one", () => {
  const rawScore = 3_000;
  assert.ok(calculateFinalScore(rawScore, 95) > calculateFinalScore(rawScore, 79));
});
