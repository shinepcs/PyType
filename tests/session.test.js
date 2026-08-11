import test from "node:test";
import assert from "node:assert/strict";

import { GameState, LEVEL_2_TIME_RULES } from "../js/core/game-state.js";
import { createLevel2PrerequisiteQuestion, level2PrerequisiteKey, recordLevel2Prerequisite } from "../js/core/level2-progression.js";
import {
  createDailySeed,
  createSessionConfig,
  GAME_MODES,
  localDateKey,
} from "../js/core/session.js";
import { ManualClock } from "../js/utils/time.js";

function question(overrides = {}) {
  return {
    id: "q1",
    level: 1,
    type: "copy",
    skill: "print",
    code: "ab",
    answer: "ab",
    acceptedAnswers: ["ab"],
    targetSeconds: 10,
    ...overrides,
  };
}

function gameOptions(clock, overrides = {}) {
  return {
    clock,
    wallClock: { now: () => Date.UTC(2026, 7, 11) + clock.now() },
    sessionId: "00000000-0000-4000-8000-000000000001",
    contentVersion: "1.0.0",
    clientVersion: "1.0.0",
    ...overrides,
  };
}

test("only ranked Quick has a time limit", () => {
  const quick = createSessionConfig(GAME_MODES.QUICK);
  assert.equal(quick.durationMs, 240_000);
  assert.equal(quick.maxQuestions, 40);
  assert.equal(quick.readyMs, 3_000);
  assert.equal(quick.ranked, true);
  const daily = createSessionConfig(GAME_MODES.DAILY);
  assert.equal(daily.maxQuestions, 30);
  assert.equal(daily.durationMs, null);
  assert.equal(daily.ranked, false);
  const practice = createSessionConfig(GAME_MODES.PRACTICE, {
    durationMs: false,
    dangerEnabled: false,
    gameOverEnabled: false,
  });
  assert.equal(practice.durationMs, null);
  assert.equal(practice.dangerEnabled, false);
  assert.equal(practice.gameOverEnabled, false);
  assert.equal(practice.allowSkip, true);
  assert.equal(createSessionConfig(GAME_MODES.DAILY, { durationMs: 1_000 }).durationMs, null);
  assert.equal(createSessionConfig(GAME_MODES.PRACTICE, { durationMs: 1_000 }).durationMs, null);
});

test("snapshot reports live 분당 타수 from correct input and active typing time", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.start();
  game.startProblem(question({ answer: "abcd", code: "abcd", acceptedAnswers: ["abcd"] }));
  game.handleKey("a");
  clock.advance(500);
  game.handleKey("b");
  clock.advance(500);
  assert.equal(game.snapshot().cpm, 120);
  game.pause("manual");
  clock.advance(2_000);
  assert.equal(game.snapshot().cpm, 120, "pause time is excluded");
});

test("Daily seed uses local date and content version", () => {
  const date = new Date(2026, 7, 11, 23, 59);
  assert.equal(localDateKey(date), "2026-08-11");
  assert.equal(createDailySeed(date, "1.0.0"), "daily:2026-08-11:1.0.0");
});

test("Level 2 is revealed only after two matching Level 1 copy solves", () => {
  const fill = question({
    id: "max.fill.1", sourceId: "max.fill.1", instanceId: "max.fill.1",
    level: 2, type: "fill", code: "print(_____(values))", answer: "max",
    acceptedAnswers: ["max"], tags: [],
  });
  const first = createLevel2PrerequisiteQuestion(fill, 0);
  assert.equal(first.level, 1);
  assert.equal(first.code, "print(max(values))");
  assert.equal(first.answer, first.code);
  let progress = recordLevel2Prerequisite({ questionId: first.sourceId }, {});
  progress = recordLevel2Prerequisite({ questionId: first.sourceId }, progress);
  const prerequisiteKey = level2PrerequisiteKey(fill);
  assert.equal(progress[prerequisiteKey], 2);
  assert.equal(createLevel2PrerequisiteQuestion(fill, progress[prerequisiteKey]), fill);
});

test("Level 2 freezes clocks, penalizes the first typo once, and rewards a solve", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock, { config: { durationMs: 20_000 } }));
  game.start();
  clock.advance(5_000);
  game.tick();
  game.startProblem(question({ level: 2, type: "fill", code: "_____", answer: "a", acceptedAnswers: ["a"] }));
  clock.advance(8_000);
  game.tick();
  assert.equal(game.activeSessionMs, 5_000);
  assert.equal(game.currentProblemElapsedMs, 0);
  assert.equal(game.danger, 20);

  const typo = game.handleKey("x");
  assert.equal(typo.timeAdjustmentMs, -LEVEL_2_TIME_RULES.penaltyMs);
  assert.equal(game.remainingMs, 13_000);
  game.handleKey("x");
  assert.equal(game.remainingMs, 13_000, "only the first Level 2 typo changes time");
  game.handleKey("Backspace");
  game.handleKey("Backspace");
  const typed = game.handleKey("a");
  assert.equal(typed.problemResult, undefined, "Level 2 waits for explicit submission");
  const solved = game.submitLevel2Answer();
  assert.equal(solved.timeAdjustmentMs, LEVEL_2_TIME_RULES.bonusMs);
  assert.equal(game.remainingMs, 16_000);
});

test("Level 2 submission records either visible answer outcome without auto-advance", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.start();
  game.startProblem(question({ level: 2, type: "fill", code: "____", answer: "max", acceptedAnswers: ["max"] }));
  game.input("max");
  const correct = game.submitLevel2Answer();
  assert.equal(correct.submittedLevel2Answer, true);
  assert.equal(correct.problemResult.submittedIncorrect, undefined);
  assert.equal(correct.problemResult.cleanSolve, true);

  game.startProblem(question({ level: 2, type: "fill", code: "____", answer: "min", acceptedAnswers: ["min"] }));
  game.input("max");
  const wrong = game.submitLevel2Answer();
  assert.equal(wrong.submittedLevel2Answer, true);
  assert.equal(wrong.problemResult.submittedIncorrect, true);
  assert.equal(wrong.problemResult.problemScore, 0);
});

test("ready state becomes playing after exactly three seconds", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.beginReady();
  clock.advance(2_999);
  assert.equal(game.tick().phase, "ready");
  clock.advance(1);
  assert.equal(game.tick().phase, "playing");
  assert.equal(game.activeSessionMs, 0);
});

test("visibility pause freezes the ready countdown without starting game clocks", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.beginReady();
  clock.advance(1_000);
  assert.equal(game.setVisibility(true), true);
  clock.advance(10_000);
  game.tick();
  assert.equal(game.phase, "paused");
  assert.equal(game.activeSessionMs, 0);
  assert.equal(game.danger, 20);
  assert.equal(game.activeTypingMs, 0);
  assert.equal(game.setVisibility(false), true);
  assert.equal(game.phase, "ready");
  clock.advance(1_999);
  assert.equal(game.tick().phase, "ready");
  clock.advance(1);
  assert.equal(game.tick().phase, "playing");
  assert.equal(game.activeSessionMs, 0);
});

test("clean solve updates score, combo, danger, metrics, and seals the problem", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.start();
  game.startProblem(question());
  clock.advance(1_000);
  game.handleKey("a");
  clock.advance(1_000);
  const event = game.handleKey("b");
  assert.equal(event.completed, true);
  assert.equal(event.problemResult.cleanSolve, true);
  assert.equal(game.combo, 1);
  assert.equal(game.bestCombo, 1);
  assert.equal(game.problemsSolved, 1);
  assert.equal(game.danger, 6, "20 + four timed danger - 18 clean recovery");
  assert.equal(game.currentQuestion, null);
  const late = game.handleKey("x", clock.now());
  assert.equal(late.ignored, true);
  assert.equal(game.totalKeystrokes, 2);
  assert.ok(game.rawScore > 0);
});

test("a queued event carrying the previous problem token cannot leak into the next problem", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.start();
  game.startProblem(question({ id: "first", answer: "a", code: "a", acceptedAnswers: ["a"] }));
  const previousToken = game.problemToken;
  game.handleKey("a", clock.now(), previousToken);
  game.startProblem(question({ id: "second", answer: "b", code: "b", acceptedAnswers: ["b"] }));
  assert.notEqual(game.problemToken, previousToken);
  const stale = game.handleKey("x", clock.now(), previousToken);
  assert.equal(stale.staleProblemEvent, true);
  assert.equal(game.typingEngine.input, "");
  assert.equal(game.typingEngine.totalKeystrokes, 0);
});

test("first typo immediately resets combo and remains in session accuracy after correction", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.start();
  game.combo = 8;
  game.bestCombo = 8;
  game.startProblem(question({ answer: "a", code: "a", acceptedAnswers: ["a"] }));
  clock.advance(100);
  const typo = game.handleKey("x");
  assert.equal(typo.comboBroken, true);
  assert.equal(game.combo, 0);
  game.backspace(clock.now());
  clock.advance(100);
  const solved = game.handleKey("a");
  assert.equal(solved.problemResult.cleanSolve, false);
  assert.equal(game.combo, 0);
  game.end("completed", clock.now());
  assert.equal(game.getResult().accuracy, 50);
});

test("problem/session time, danger and 분당 타수 stop during visibility pause", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.start();
  game.startProblem(question());
  clock.advance(100);
  game.handleKey("a");
  clock.advance(100);
  assert.equal(game.setVisibility(true), true);
  const before = game.snapshot();
  clock.advance(20_000);
  game.tick();
  const during = game.snapshot();
  assert.equal(during.activeSessionMs, before.activeSessionMs);
  assert.equal(during.currentProblemElapsedMs, before.currentProblemElapsedMs);
  assert.equal(during.danger, before.danger);
  game.setVisibility(false);
  clock.advance(100);
  game.handleKey("b");
  assert.equal(game.problemResults[0].elapsedMs, 300);
  assert.equal(game.activeTypingMs, 200);
});

test("Quick manual pause is available once, capped at 30 seconds", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.start();
  game.startProblem(question());
  assert.equal(game.pause("manual"), true);
  clock.advance(30_100);
  game.tick();
  assert.equal(game.phase, "playing", "manual pause auto-resumes at 30 seconds");
  assert.equal(game.accumulatedPauseMs, 30_000);
  assert.equal(game.activeSessionMs, 100);
  assert.equal(game.rankEligible, true, "exactly 30 seconds remains eligible");
  assert.equal(game.pause("manual"), false);
});

test("more than 30 seconds of cumulative visibility/manual pause makes Quick unranked", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.start();
  game.setVisibility(true);
  clock.advance(30_001);
  game.tick();
  assert.equal(game.rankEligible, false);
  game.setVisibility(false);
  game.end("completed");
  assert.equal(game.getResult().rankEligible, false);
});

test("time over wins before a final key at the exact deadline", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock, { config: { durationMs: 1_000 } }));
  game.start();
  game.startProblem(question({ answer: "a", code: "a", acceptedAnswers: ["a"] }));
  clock.advance(1_000);
  const event = game.handleKey("a");
  assert.equal(game.phase, "ended");
  assert.equal(game.endReason, "time-limit");
  assert.equal(event.ignored, true);
  assert.equal(game.problemsSolved, 0);
  assert.equal(game.getResult().survivalMs, 1_000);
});

test("final key just before deadline scores, and transition time cannot add danger", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock, { config: { durationMs: 1_000 } }));
  game.start();
  game.startProblem(question({ answer: "a", code: "a", acceptedAnswers: ["a"] }));
  clock.advance(999);
  game.handleKey("a");
  const dangerAfterSolve = game.danger;
  clock.advance(1);
  game.tick();
  assert.equal(game.endReason, "time-limit");
  assert.equal(game.problemsSolved, 1);
  assert.equal(game.danger, dangerAfterSolve);
});

test("danger game over ends at the exact crossing inside a coarse tick", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.start();
  game.startProblem(question());
  game.danger = 99;
  clock.advance(5_000);
  game.tick();
  assert.equal(game.endReason, "game-over");
  assert.equal(game.getResult().survivalMs, 500);
  assert.equal(game.danger, 100);
});

test("session deadline wins an exact tie with danger", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock, { config: { durationMs: 1_000 } }));
  game.start();
  game.startProblem(question());
  game.danger = 98;
  clock.advance(2_000);
  game.tick();
  assert.equal(game.endReason, "time-limit");
  assert.equal(game.danger, 100);
});

test("late timer callbacks after end cannot mutate score, time, or danger", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock, { config: { durationMs: 1_000 } }));
  game.start();
  game.startProblem(question());
  clock.advance(1_000);
  game.tick();
  const before = game.snapshot();
  clock.advance(100_000);
  game.tick();
  game.handleKey("a");
  const after = game.snapshot();
  assert.equal(after.rawScore, before.rawScore);
  assert.equal(after.activeSessionMs, before.activeSessionMs);
  assert.equal(after.danger, before.danger);
});

test("unfinished input contributes to terminal accuracy and active typing time", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock, { config: { durationMs: 1_000 } }));
  game.start();
  game.startProblem(question({ answer: "abc", code: "abc", acceptedAnswers: ["abc"] }));
  clock.advance(100);
  game.handleKey("a");
  clock.advance(100);
  game.handleKey("x");
  clock.advance(800);
  game.tick();
  const result = game.getResult();
  assert.equal(result.correctKeystrokes, 1);
  assert.equal(result.totalKeystrokes, 2);
  assert.equal(result.accuracy, 50);
  assert.equal(result.activeTypingMs, 900);
});

test("Practice skip records an error without adding a solved problem or score", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock, {
    mode: GAME_MODES.PRACTICE,
    config: { durationMs: null, dangerEnabled: false, gameOverEnabled: false },
  }));
  game.start();
  game.startProblem(question());
  const result = game.skipCurrentProblem();
  assert.equal(result.skipped, true);
  assert.equal(result.errorCount, 1);
  assert.equal(game.problemsSolved, 0);
  assert.equal(game.rawScore, 0);
  assert.equal(game.currentQuestion, null);
});

test("Enter submission records a final-line typo as incorrect and releases the next problem", () => {
  const clock = new ManualClock(0);
  const game = new GameState(gameOptions(clock));
  game.start();
  game.startProblem(question({ answer: "ab\ncd", code: "ab\ncd", acceptedAnswers: ["ab\ncd"] }));
  game.input("ax\ncd");
  const result = game.submitIncorrectProblem(undefined, game.problemToken);
  assert.equal(result.submittedIncorrect, true);
  assert.equal(result.errorCount, 1);
  assert.equal(result.problemScore, 0);
  assert.equal(game.problemsSolved, 0);
  assert.equal(game.rawScore, 0);
  assert.equal(game.currentQuestion, null);
});
