import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateMastery,
  calculateReviewDueAt,
  createEmptySkillMastery,
  getRecentPerformance,
  isReviewDue,
  MAX_RECENT_RESULTS,
  normalizeProblemResult,
  updateSkillMastery,
} from "../js/core/mastery.js";

const DAY = 86_400_000;

function result(overrides = {}) {
  return {
    questionId: "q1",
    skill: "print",
    level: 1,
    elapsedMs: 5_000,
    targetMs: 10_000,
    correctKeystrokes: 10,
    totalKeystrokes: 10,
    errorCount: 0,
    cleanSolve: true,
    slow: false,
    completedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

test("an empty skill has zero mastery and stable defaults", () => {
  assert.deepEqual(createEmptySkillMastery(), {
    attempts: 0,
    cleanSolves: 0,
    correctKeystrokes: 0,
    totalKeystrokes: 0,
    averageElapsedMs: 0,
    recentResults: [],
    lastSeenAt: null,
    dueAt: null,
    mastery: 0,
  });
  assert.equal(calculateMastery([]), 0);
});

test("mastery follows 60% accuracy, 25% clean, 15% speed", () => {
  const results = [
    result(),
    result({ correctKeystrokes: 8, totalKeystrokes: 10, cleanSolve: false, errorCount: 2, elapsedMs: 20_000 }),
  ];
  // accuracy .9, clean .5, speed (.1? target/elapsed=.5 plus 1)/2=.75
  assert.equal(calculateMastery(results), Math.round(100 * (0.6 * 0.9 + 0.25 * 0.5 + 0.15 * 0.75)));
});

test("only the most recent 20 results feed mastery while totals remain cumulative", () => {
  let record = createEmptySkillMastery();
  for (let index = 0; index < 25; index += 1) {
    record = updateSkillMastery(record, result({
      questionId: `q${index}`,
      cleanSolve: index >= 5,
      errorCount: index >= 5 ? 0 : 1,
      correctKeystrokes: index >= 5 ? 10 : 0,
      completedAt: new Date(Date.UTC(2026, 7, 1 + index)).toISOString(),
    }));
  }
  assert.equal(record.attempts, 25);
  assert.equal(record.recentResults.length, MAX_RECENT_RESULTS);
  assert.equal(record.recentResults[0].questionId, "q5");
  assert.equal(record.mastery, 100);
});

test("review due dates use immediate, one-day, then 3/7/14-day intervals", () => {
  const at = Date.parse("2026-08-11T00:00:00.000Z");
  assert.equal(Date.parse(calculateReviewDueAt(result({ errorCount: 1, cleanSolve: false }))), at);
  assert.equal(Date.parse(calculateReviewDueAt(result({ slow: true, elapsedMs: 11_000 }))), at + DAY);
  const first = result();
  assert.equal(Date.parse(calculateReviewDueAt(first)), at + 3 * DAY);
  assert.equal(Date.parse(calculateReviewDueAt(first, [first])), at + 7 * DAY);
  assert.equal(Date.parse(calculateReviewDueAt(first, [first, first])), at + 14 * DAY);
});

test("negative clock intervals are clamped to due now", () => {
  assert.equal(isReviewDue({ dueAt: "2026-08-10T00:00:00.000Z" }, "2026-08-11T00:00:00.000Z"), true);
  assert.equal(isReviewDue({ dueAt: "2026-08-12T00:00:00.000Z" }, "2026-08-11T00:00:00.000Z"), false);
});

test("Level 2 recommendation needs ten attempts, 90% accuracy and 70% clean", () => {
  const nine = Array.from({ length: 9 }, () => result());
  assert.equal(getRecentPerformance({ recentResults: nine }).preferLevel2, false);
  const threshold = [
    ...Array.from({ length: 7 }, () => result({ correctKeystrokes: 9, totalKeystrokes: 10 })),
    ...Array.from({ length: 3 }, () => result({ cleanSolve: false, errorCount: 1, correctKeystrokes: 9, totalKeystrokes: 10 })),
  ];
  const performance = getRecentPerformance({ recentResults: threshold });
  assert.equal(performance.accuracy, 90);
  assert.equal(performance.firstTryRate, 70);
  assert.equal(performance.preferLevel2, true);
});

test("normalization derives slow and never allows correct keys above total", () => {
  const normalized = normalizeProblemResult(result({ elapsedMs: 11_000, correctKeystrokes: 99, totalKeystrokes: 10, slow: undefined }));
  assert.equal(normalized.slow, true);
  assert.equal(normalized.correctKeystrokes, 10);
});
