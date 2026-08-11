import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceDanger,
  applySolveRecovery,
  applyTypoPenalty,
  calculateTimedDangerIncrease,
  clampDanger,
  isGameOver,
  millisecondsUntilGameOver,
  SURVIVAL,
} from "../js/core/survival.js";

test("danger starts at 20 and clamps to 0..100", () => {
  assert.equal(SURVIVAL.startingDanger, 20);
  assert.equal(clampDanger(-1), 0);
  assert.equal(clampDanger(101), 100);
  assert.equal(clampDanger(Number.POSITIVE_INFINITY), 100);
  assert.equal(isGameOver(99.999), false);
  assert.equal(isGameOver(100), true);
});

test("timed danger splits exactly at target time", () => {
  assert.equal(calculateTimedDangerIncrease({ fromElapsedMs: 0, toElapsedMs: 5_000, targetMs: 10_000 }), 10);
  assert.equal(calculateTimedDangerIncrease({ fromElapsedMs: 5_000, toElapsedMs: 15_000, targetMs: 10_000 }), 25);
  assert.equal(advanceDanger(90, { fromElapsedMs: 0, toElapsedMs: 10_000, targetMs: 10_000 }), 100);
});

test("typo penalty is capped at five per problem", () => {
  let penalty = applyTypoPenalty(20, 0, 4);
  assert.deepEqual(penalty, { danger: 24, applied: 4, penaltiesApplied: 4 });
  penalty = applyTypoPenalty(penalty.danger, penalty.penaltiesApplied, 10);
  assert.deepEqual(penalty, { danger: 25, applied: 1, penaltiesApplied: 5 });
  penalty = applyTypoPenalty(penalty.danger, penalty.penaltiesApplied, 1);
  assert.equal(penalty.danger, 25);
  assert.equal(penalty.applied, 0);
});

test("solve recovery gives an additional three for clean solves", () => {
  assert.equal(applySolveRecovery(50, false), 35);
  assert.equal(applySolveRecovery(50, true), 32);
  assert.equal(applySolveRecovery(5, true), 0);
});

test("time to game over accounts for crossing target threshold", () => {
  assert.equal(millisecondsUntilGameOver({ danger: 90, questionElapsedMs: 0, targetMs: 10_000 }), 5_000);
  assert.equal(millisecondsUntilGameOver({ danger: 90, questionElapsedMs: 10_000, targetMs: 10_000 }), 10_000 / 3);
  assert.equal(
    millisecondsUntilGameOver({ danger: 70, questionElapsedMs: 5_000, targetMs: 10_000 }),
    5_000 + 20_000 / 3,
  );
  assert.equal(millisecondsUntilGameOver({ danger: 100, questionElapsedMs: 0, targetMs: 10_000 }), 0);
});
