import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionStatistics,
  calculateAverageProblemMs,
  createSessionVariant,
} from "../js/core/session-statistics.js";

function session(overrides = {}) {
  return {
    sessionId: crypto.randomUUID(),
    gameMode: "quick",
    sessionVariant: "quick",
    endedNormally: true,
    score: 1_000,
    accuracy: 95,
    wpm: 30,
    problemsSolved: 20,
    averageProblemMs: 8_000,
    ...overrides,
  };
}

test("session variants keep Practice pools separate while preserving standard modes", () => {
  assert.equal(createSessionVariant("quick"), "quick");
  assert.equal(createSessionVariant("daily"), "daily");
  assert.equal(createSessionVariant("practice", { sampleLogic: true }), "sample-logic");
  assert.equal(createSessionVariant("practice", { beginnerGuide: true }), "beginner-guide");
  assert.equal(
    createSessionVariant("practice", { skills: ["range", "print", "range"] }),
    "practice:print,range",
  );
});

test("average problem time includes each completed problem result", () => {
  assert.equal(calculateAverageProblemMs([{ elapsedMs: 1_000 }, { elapsedMs: 3_001 }]), 2_001);
  assert.equal(calculateAverageProblemMs([]), null);
});

test("statistics compare only the same variant and use the latest five sessions", () => {
  const unrelated = session({ sessionVariant: "daily", score: 99_999 });
  const old = session({ score: 100, accuracy: 80 });
  const recent = Array.from({ length: 5 }, (_, index) => session({
    score: 200 + index * 100,
    accuracy: 90 + index,
  }));
  const current = session({ score: 800, accuracy: 96, wpm: 35, averageProblemMs: 7_000 });
  const statistics = buildSessionStatistics(current, [old, unrelated, ...recent]);

  assert.equal(statistics.recentCount, 5);
  assert.equal(statistics.previous.sessionId, recent.at(-1).sessionId);
  assert.equal(statistics.metrics.score.recentAverage, 400);
  assert.equal(statistics.metrics.score.delta, 200);
  assert.equal(statistics.metrics.averageProblemMs.direction, "improved");
  assert.equal(statistics.trend, "improved");
});

test("accuracy and score moving in opposite directions produce an honest mixed trend", () => {
  const previous = session({ score: 1_000, accuracy: 98 });
  const current = session({ score: 1_200, accuracy: 95 });
  assert.equal(buildSessionStatistics(current, [previous]).trend, "mixed");
});

test("a first comparable session reports a first-record baseline", () => {
  const current = session({ sessionVariant: "sample-logic", gameMode: "practice" });
  const statistics = buildSessionStatistics(current, [session()]);
  assert.equal(statistics.trend, "first");
  assert.equal(statistics.recentCount, 0);
  assert.equal(statistics.metrics.score.previous, null);
});
