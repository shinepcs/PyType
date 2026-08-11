import test from "node:test";
import assert from "node:assert/strict";

import { GameState } from "../js/core/game-state.js";
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

test("mode configs preserve Quick, Daily, and configurable Practice contracts", () => {
  const quick = createSessionConfig(GAME_MODES.QUICK);
  assert.equal(quick.durationMs, 240_000);
  assert.equal(quick.maxQuestions, 40);
  assert.equal(quick.readyMs, 3_000);
  assert.equal(quick.ranked, true);
  const daily = createSessionConfig(GAME_MODES.DAILY);
  assert.equal(daily.maxQuestions, 30);
  assert.equal(daily.durationMs, 240_000);
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
});

test("Daily seed uses local date and content version", () => {
  const date = new Date(2026, 7, 11, 23, 59);
  assert.equal(localDateKey(date), "2026-08-11");
  assert.equal(createDailySeed(date, "1.0.0"), "daily:2026-08-11:1.0.0");
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

test("problem/session time, danger and WPM stop during visibility pause", () => {
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
