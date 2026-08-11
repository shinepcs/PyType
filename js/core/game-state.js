import { asClock, clamp, createSystemClock, nonNegativeMilliseconds, timestampOf } from "../utils/time.js";
import { createTypingEngine } from "./typing-engine.js";
import {
  advanceCombo,
  calculateProblemScore,
  calculateSessionMetrics,
} from "./scoring.js";
import {
  advanceDanger,
  applySolveRecovery,
  applyTypoPenalty,
  clampDanger,
  isGameOver,
  millisecondsUntilGameOver,
  SURVIVAL,
} from "./survival.js";
import { createSessionConfig, GAME_MODES } from "./session.js";

const TERMINAL_REASONS = new Set(["time-limit", "game-over", "question-limit", "completed"]);
export const LEVEL_2_TIME_RULES = Object.freeze({ bonusMs: 3_000, penaltyMs: 2_000 });

function defaultSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function immutableStatus(state, extra = {}) {
  return Object.freeze({
    phase: state.phase,
    ended: state.phase === "ended",
    endReason: state.endReason,
    ...extra,
  });
}

function safeIso(timestamp) {
  const value = timestampOf(timestamp, Date.now());
  return new Date(value).toISOString();
}

function weakSkillsFrom(results, limit = 3) {
  const skills = new Map();
  for (const result of results) {
    if (!result.skill) continue;
    const current = skills.get(result.skill) ?? { penalty: 0, attempts: 0 };
    current.penalty += Math.max(0, Number(result.errorCount) || 0) * 3;
    current.penalty += result.slow ? 2 : 0;
    current.penalty += result.cleanSolve ? 0 : 1;
    current.attempts += 1;
    skills.set(result.skill, current);
  }
  return [...skills.entries()]
    .filter(([, value]) => value.penalty > 0)
    .sort(([skillA, left], [skillB, right]) => (
      right.penalty - left.penalty
      || right.attempts - left.attempts
      || skillA.localeCompare(skillB)
    ))
    .slice(0, limit)
    .map(([skill]) => skill);
}

export class GameState {
  constructor({
    mode = GAME_MODES.QUICK,
    config = {},
    clock = createSystemClock(),
    wallClock = { now: () => Date.now() },
    sessionId = defaultSessionId(),
    contentVersion = "",
    clientVersion = "",
    sessionQueue = null,
  } = {}) {
    this.clock = asClock(clock);
    this.wallClock = asClock(wallClock);
    this.config = createSessionConfig(mode, config);
    this.sessionQueue = sessionQueue;
    this.sessionId = String(sessionId);
    this.contentVersion = String(contentVersion);
    this.clientVersion = String(clientVersion);

    this.phase = "idle";
    this.createdAt = this.clock.now();
    this.readyStartedAt = null;
    this.readyEndsAt = null;
    this.startedAt = null;
    this.endedAt = null;
    this.completedAt = null;
    this.endReason = null;
    this.lastTickAt = null;
    this.lastObservedAt = this.createdAt;

    this.activeSessionMs = 0;
    this.level2TimeAdjustmentMs = 0;
    this.danger = SURVIVAL.startingDanger;
    this.combo = 0;
    this.bestCombo = 0;
    this.problemsSolved = 0;
    this.problemScores = [];
    this.problemResults = [];
    this.correctKeystrokes = 0;
    this.totalKeystrokes = 0;
    this.activeTypingMs = 0;

    this.currentQuestion = null;
    this.typingEngine = null;
    this.problemToken = 0;
    this.currentProblemElapsedMs = 0;
    this.currentTypoPenalties = 0;
    this.currentLevel2TimePenaltyApplied = false;

    this.pauseReasons = new Set();
    this.pauseStartedAt = null;
    this.pausedFromPhase = null;
    this.readyRemainingAtPauseMs = null;
    this.manualPauseExpiresAt = null;
    this.manualPauseCount = 0;
    this.accumulatedPauseMs = 0;

    this.rankEligible = this.config.ranked;
    this.finalResult = null;
  }

  _time(timestamp) {
    const requested = timestamp === undefined ? this.clock.now() : timestampOf(timestamp);
    const now = Math.max(this.lastObservedAt, requested);
    this.lastObservedAt = now;
    return now;
  }

  beginReady(timestamp) {
    if (this.phase !== "idle") return false;
    const now = this._time(timestamp);
    this.phase = "ready";
    this.readyStartedAt = now;
    this.readyEndsAt = now + this.config.readyMs;
    return true;
  }

  start(timestamp) {
    if (this.phase !== "idle" && this.phase !== "ready") return false;
    const now = this._time(timestamp);
    this.phase = "playing";
    this.startedAt = now;
    this.lastTickAt = now;
    return true;
  }

  tick(timestamp) {
    const now = this._time(timestamp);
    if (this.phase === "ended" || this.phase === "idle") {
      return immutableStatus(this);
    }
    if (this.phase === "ready") {
      if (now < this.readyEndsAt) {
        return immutableStatus(this, { readyRemainingMs: this.readyEndsAt - now });
      }
      const startAt = this.readyEndsAt;
      this.phase = "playing";
      this.startedAt = startAt;
      this.lastTickAt = startAt;
    }
    if (this.phase === "paused") {
      this._tickPaused(now);
      return immutableStatus(this);
    }
    this._advancePlaying(now);
    return immutableStatus(this);
  }

  _advancePlaying(now) {
    if (this.phase !== "playing") return;
    const from = this.lastTickAt ?? now;
    const requestedDelta = Math.max(0, now - from);
    if (requestedDelta === 0) return;
    if (this.currentQuestion?.level === 2) {
      this.lastTickAt = now;
      return;
    }

    const sessionRemaining = this.remainingMs === null
      ? Number.POSITIVE_INFINITY
      : this.remainingMs;
    const dangerRemainingMs = this.currentQuestion
      && this.config.dangerEnabled
      && this.config.gameOverEnabled
      ? millisecondsUntilGameOver({
        danger: this.danger,
        questionElapsedMs: this.currentProblemElapsedMs,
        targetMs: this.currentQuestion.targetSeconds * 1_000,
      })
      : Number.POSITIVE_INFINITY;
    const advanceMs = Math.min(requestedDelta, sessionRemaining, dangerRemainingMs);

    if (advanceMs > 0) {
      const previousProblemElapsed = this.currentProblemElapsedMs;
      this.activeSessionMs += advanceMs;
      if (this.currentQuestion) {
        this.currentProblemElapsedMs += advanceMs;
        if (this.config.dangerEnabled) {
          this.danger = advanceDanger(this.danger, {
            fromElapsedMs: previousProblemElapsed,
            toElapsedMs: this.currentProblemElapsedMs,
            targetMs: this.currentQuestion.targetSeconds * 1_000,
          });
        }
      }
      this.lastTickAt = from + advanceMs;
    }

    const reachedSessionLimit = sessionRemaining <= requestedDelta
      && sessionRemaining <= dangerRemainingMs;
    const reachedDangerLimit = dangerRemainingMs <= requestedDelta
      && dangerRemainingMs < sessionRemaining;
    if (reachedSessionLimit) {
      this._finish("time-limit", from + sessionRemaining);
      return;
    }
    if (reachedDangerLimit || (this.config.gameOverEnabled && isGameOver(this.danger))) {
      this._finish("game-over", from + dangerRemainingMs);
      return;
    }
    this.lastTickAt = now;
  }

  startProblem(question, timestamp) {
    const now = this._time(timestamp);
    this.tick(now);
    if (this.phase !== "playing" || this.currentQuestion || !question) return false;
    if (this.problemsSolved >= this.config.maxQuestions) {
      this._finish("question-limit", now);
      return false;
    }
    const targetSeconds = Number(question.targetSeconds);
    if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) {
      throw new RangeError("question.targetSeconds must be positive");
    }
    this.currentQuestion = question;
    this.typingEngine = createTypingEngine(question);
    this.problemToken += 1;
    this.currentProblemElapsedMs = 0;
    this.currentTypoPenalties = 0;
    this.currentLevel2TimePenaltyApplied = false;
    return true;
  }

  startNextProblem(timestamp, selectionOptions) {
    if (!this.sessionQueue) {
      throw new Error("startNextProblem requires a sessionQueue");
    }
    const now = this._time(timestamp);
    this.tick(now);
    if (this.phase !== "playing" || this.currentQuestion) return null;
    const question = this.sessionQueue.next(selectionOptions);
    if (!question) {
      if (this.phase === "playing") this.end("completed", now);
      return null;
    }
    return this.startProblem(question, now) ? question : null;
  }

  handleKey(eventOrKey, timestamp, problemToken = eventOrKey?.problemToken) {
    return this._typingAction(
      timestamp,
      (engine, now) => engine.handleKey(eventOrKey, now),
      problemToken,
    );
  }

  handleBeforeInput(event, timestamp, problemToken = event?.problemToken) {
    return this._typingAction(
      timestamp,
      (engine, now) => engine.handleBeforeInput(event, now),
      problemToken,
    );
  }

  input(value, timestamp, options = {}) {
    return this._typingAction(
      timestamp,
      (engine, now) => engine.insert(value, now, options),
      options.problemToken,
    );
  }

  backspace(timestamp, problemToken) {
    return this._typingAction(timestamp, (engine, now) => engine.backspace(now), problemToken);
  }

  compositionStart() {
    if (!this.typingEngine || this.phase !== "playing") return immutableStatus(this, { ignored: true });
    return this.typingEngine.compositionStart();
  }

  compositionEnd(text, timestamp, problemToken) {
    return this._typingAction(
      timestamp,
      (engine, now) => engine.compositionEnd(text, now),
      problemToken,
    );
  }

  _typingAction(timestamp, operation, expectedProblemToken) {
    const now = this._time(timestamp);
    this.tick(now);
    if (this.phase !== "playing" || !this.typingEngine || !this.currentQuestion) {
      return immutableStatus(this, { ignored: true });
    }
    if (expectedProblemToken !== undefined && expectedProblemToken !== this.problemToken) {
      return immutableStatus(this, { ignored: true, staleProblemEvent: true });
    }
    const event = operation(this.typingEngine, now);
    let timeAdjustmentMs = 0;
    if (event.errors > 0) {
      if (this.currentQuestion.level === 2 && this.config.durationMs !== null) {
        if (!this.currentLevel2TimePenaltyApplied) {
          const remaining = this.remainingMs;
          const applied = Math.min(LEVEL_2_TIME_RULES.penaltyMs, remaining);
          this.level2TimeAdjustmentMs -= applied;
          timeAdjustmentMs = -applied;
          this.currentLevel2TimePenaltyApplied = true;
        }
      } else {
        const penalty = applyTypoPenalty(
          this.danger,
          this.currentTypoPenalties,
          event.errors,
        );
        this.danger = penalty.danger;
        this.currentTypoPenalties = penalty.penaltiesApplied;
      }
      if (event.comboBroken) this.combo = 0;
      if (this.remainingMs !== null && this.remainingMs <= 0) {
        this._finish("time-limit", now);
        return Object.freeze({ ...event, timeAdjustmentMs, ended: true, endReason: this.endReason });
      }
      if (this.config.gameOverEnabled && isGameOver(this.danger)) {
        this._finish("game-over", now);
        return Object.freeze({ ...event, ended: true, endReason: this.endReason });
      }
    }
    if (event.completed && this.phase === "playing") {
      if (this.currentQuestion.level === 2 && this.config.durationMs !== null) {
        this.level2TimeAdjustmentMs += LEVEL_2_TIME_RULES.bonusMs;
        timeAdjustmentMs += LEVEL_2_TIME_RULES.bonusMs;
      }
      const problemResult = this._completeProblem(now);
      return Object.freeze({ ...event, timeAdjustmentMs, problemResult, ended: this.phase === "ended", endReason: this.endReason });
    }
    return timeAdjustmentMs === 0 ? event : Object.freeze({ ...event, timeAdjustmentMs });
  }

  _completeProblem(now) {
    const question = this.currentQuestion;
    const engine = this.typingEngine;
    const engineState = engine.snapshot(now);
    const cleanSolve = engineState.cleanSolve;
    this.combo = advanceCombo(this.combo, cleanSolve);
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const score = calculateProblemScore({
      answer: question.answer,
      level: question.level,
      targetSeconds: question.targetSeconds,
      elapsedMs: this.currentProblemElapsedMs,
      comboAfterSolve: this.combo,
    });
    const result = Object.freeze({
      questionId: String(question.sourceId ?? question.id ?? question.instanceId ?? ""),
      skill: String(question.skill ?? ""),
      level: question.level,
      elapsedMs: Math.round(this.currentProblemElapsedMs),
      targetMs: Math.round(question.targetSeconds * 1_000),
      correctKeystrokes: engineState.correctKeystrokes,
      totalKeystrokes: engineState.totalKeystrokes,
      errorCount: engineState.errorCount,
      cleanSolve,
      slow: this.currentProblemElapsedMs > question.targetSeconds * 1_000,
      completedAt: safeIso(this.wallClock.now()),
      problemScore: score,
    });

    this.correctKeystrokes += engineState.correctKeystrokes;
    this.totalKeystrokes += engineState.totalKeystrokes;
    this.activeTypingMs += engineState.activeTypingMs;
    this.problemScores.push(score);
    this.problemResults.push(result);
    this.problemsSolved += 1;
    this.danger = applySolveRecovery(this.danger, cleanSolve);
    if (this.sessionQueue) this.sessionQueue.recordResult(question, result);

    this.currentQuestion = null;
    this.typingEngine = null;
    this.currentProblemElapsedMs = 0;
    this.currentTypoPenalties = 0;
    this.currentLevel2TimePenaltyApplied = false;

    if (this.problemsSolved >= this.config.maxQuestions) {
      this._finish("question-limit", now);
    }
    return result;
  }

  skipCurrentProblem(timestamp) {
    const now = this._time(timestamp);
    this.tick(now);
    if (!this.config.allowSkip || this.phase !== "playing" || !this.currentQuestion) {
      return false;
    }
    const question = this.currentQuestion;
    const state = this.typingEngine.snapshot(now);
    const result = Object.freeze({
      questionId: String(question.sourceId ?? question.id ?? question.instanceId ?? ""),
      skill: String(question.skill ?? ""),
      level: question.level,
      elapsedMs: Math.round(this.currentProblemElapsedMs),
      targetMs: Math.round(question.targetSeconds * 1_000),
      correctKeystrokes: state.correctKeystrokes,
      totalKeystrokes: state.totalKeystrokes,
      errorCount: Math.max(1, state.errorCount),
      cleanSolve: false,
      slow: this.currentProblemElapsedMs > question.targetSeconds * 1_000,
      completedAt: safeIso(this.wallClock.now()),
      skipped: true,
      problemScore: 0,
    });
    this.correctKeystrokes += state.correctKeystrokes;
    this.totalKeystrokes += state.totalKeystrokes;
    this.activeTypingMs += state.activeTypingMs;
    this.problemResults.push(result);
    this.combo = 0;
    if (this.sessionQueue) this.sessionQueue.recordResult(question, result);
    this.currentQuestion = null;
    this.typingEngine = null;
    this.currentProblemElapsedMs = 0;
    this.currentTypoPenalties = 0;
    this.currentLevel2TimePenaltyApplied = false;
    return result;
  }

  pause(reason = "manual", timestamp) {
    if (reason !== "manual" && reason !== "visibility") {
      throw new RangeError("pause reason must be manual or visibility");
    }
    const now = this._time(timestamp);
    this.tick(now);
    if (this.phase !== "playing" && this.phase !== "ready" && this.phase !== "paused") return false;
    if (this.pauseReasons.has(reason)) return false;
    if (reason === "manual" && (this.phase === "ready" || this.pausedFromPhase === "ready")) {
      return false;
    }
    if (reason === "manual") {
      if (this.manualPauseCount >= this.config.maximumManualPauses) return false;
      this.manualPauseCount += 1;
      if (Number.isFinite(this.config.maximumManualPauseMs)) {
        this.manualPauseExpiresAt = now + this.config.maximumManualPauseMs;
      }
    }
    if (this.phase === "playing" || this.phase === "ready") {
      this.pausedFromPhase = this.phase;
      if (this.phase === "ready") {
        this.readyRemainingAtPauseMs = Math.max(0, this.readyEndsAt - now);
      }
      this.phase = "paused";
      this.pauseStartedAt = now;
      this.lastTickAt = now;
      if (this.pausedFromPhase === "playing") this.typingEngine?.pause(now);
    }
    this.pauseReasons.add(reason);
    return true;
  }

  resume(reason = "manual", timestamp) {
    const now = this._time(timestamp);
    this.tick(now);
    if (this.phase !== "paused" || !this.pauseReasons.has(reason)) return false;
    this.pauseReasons.delete(reason);
    if (reason === "manual") this.manualPauseExpiresAt = null;
    if (this.pauseReasons.size === 0) {
      this._finishPause(now);
    }
    return true;
  }

  setVisibility(hidden, timestamp) {
    return hidden ? this.pause("visibility", timestamp) : this.resume("visibility", timestamp);
  }

  _tickPaused(now) {
    if (this.phase !== "paused") return;
    if (
      this.pauseReasons.has("manual")
      && this.manualPauseExpiresAt !== null
      && now >= this.manualPauseExpiresAt
    ) {
      const expiration = this.manualPauseExpiresAt;
      this.pauseReasons.delete("manual");
      this.manualPauseExpiresAt = null;
      if (this.pauseReasons.size === 0) {
        this._finishPause(expiration);
        this._advancePlaying(now);
        return;
      }
    }
    this._updateRankEligibilityForPause(now);
  }

  _finishPause(now) {
    const pauseEnd = Math.max(this.pauseStartedAt, now);
    this.accumulatedPauseMs += pauseEnd - this.pauseStartedAt;
    this._updateRankEligibilityForPause(pauseEnd, false);
    this.pauseStartedAt = null;
    if (this.pausedFromPhase === "ready") {
      this.phase = "ready";
      this.readyEndsAt = pauseEnd + nonNegativeMilliseconds(this.readyRemainingAtPauseMs);
      this.readyRemainingAtPauseMs = null;
      this.lastTickAt = null;
    } else {
      this.phase = "playing";
      this.lastTickAt = pauseEnd;
      this.typingEngine?.resume(pauseEnd);
    }
    this.pausedFromPhase = null;
  }

  _updateRankEligibilityForPause(now, includeOngoing = true) {
    if (!this.config.ranked) return;
    const ongoing = includeOngoing && this.pauseStartedAt !== null
      ? Math.max(0, now - this.pauseStartedAt)
      : 0;
    if (this.accumulatedPauseMs + ongoing > this.config.maximumRankedPauseMs) {
      this.rankEligible = false;
    }
  }

  end(reason = "completed", timestamp) {
    const now = this._time(timestamp);
    if (this.phase === "playing" || this.phase === "ready") this.tick(now);
    if (this.phase === "paused") this._updateRankEligibilityForPause(now);
    if (this.phase !== "ended") this._finish(reason, now);
    return this.finalResult;
  }

  _finish(reason, timestamp) {
    if (this.phase === "ended") return this.finalResult;
    const now = timestampOf(timestamp);
    if (!TERMINAL_REASONS.has(reason)) this.rankEligible = false;
    if (this.config.ranked && !TERMINAL_REASONS.has(reason)) this.rankEligible = false;
    if (this.typingEngine) this.typingEngine.lock(now);
    if (this.pauseStartedAt !== null) {
      this.accumulatedPauseMs += Math.max(0, now - this.pauseStartedAt);
      this.pauseStartedAt = null;
    }
    this.phase = "ended";
    this.endReason = reason;
    this.endedAt = now;
    this.completedAt = safeIso(this.wallClock.now());
    this.pauseReasons.clear();
    this.manualPauseExpiresAt = null;
    this.pausedFromPhase = null;
    this.readyRemainingAtPauseMs = null;
    this.finalResult = this._buildResult(now);
    return this.finalResult;
  }

  _aggregateTyping(now) {
    if (!this.typingEngine) {
      return {
        correctKeystrokes: this.correctKeystrokes,
        totalKeystrokes: this.totalKeystrokes,
        activeTypingMs: this.activeTypingMs,
      };
    }
    const current = this.typingEngine.snapshot(now);
    return {
      correctKeystrokes: this.correctKeystrokes + current.correctKeystrokes,
      totalKeystrokes: this.totalKeystrokes + current.totalKeystrokes,
      activeTypingMs: this.activeTypingMs + current.activeTypingMs,
    };
  }

  _buildResult(now) {
    const typing = this._aggregateTyping(now);
    const metrics = calculateSessionMetrics({
      ...typing,
      problemScores: this.problemScores,
    });
    return Object.freeze({
      sessionId: this.sessionId,
      gameMode: this.config.mode,
      contentVersion: this.contentVersion,
      clientVersion: this.clientVersion,
      endReason: this.endReason,
      completed: this.phase === "ended",
      endedNormally: TERMINAL_REASONS.has(this.endReason),
      rankEligible: this.rankEligible && TERMINAL_REASONS.has(this.endReason),
      score: metrics.finalScore,
      rawScore: metrics.rawScore,
      accuracyMultiplier: metrics.accuracyMultiplier,
      accuracy: metrics.accuracy,
      wpm: metrics.wpm,
      problemsSolved: this.problemsSolved,
      bestCombo: this.bestCombo,
      survivalMs: Math.round(nonNegativeMilliseconds(this.activeSessionMs)),
      correctKeystrokes: typing.correctKeystrokes,
      totalKeystrokes: typing.totalKeystrokes,
      activeTypingMs: Math.round(typing.activeTypingMs),
      accumulatedPauseMs: Math.round(this._effectivePauseMs(now)),
      problemScores: Object.freeze([...this.problemScores]),
      problemResults: Object.freeze([...this.problemResults]),
      weakSkills: Object.freeze(weakSkillsFrom(this.problemResults)),
      completedAt: this.completedAt,
    });
  }

  _effectivePauseMs(now) {
    const ongoing = this.pauseStartedAt === null ? 0 : Math.max(0, now - this.pauseStartedAt);
    return this.accumulatedPauseMs + ongoing;
  }

  get remainingMs() {
    if (this.config.durationMs === null) return null;
    return Math.max(0, this.config.durationMs + this.level2TimeAdjustmentMs - this.activeSessionMs);
  }

  get rawScore() {
    return this.problemScores.reduce((sum, score) => sum + score, 0);
  }

  get score() {
    return this.finalResult?.score ?? this.rawScore;
  }

  get solvedCount() {
    return this.problemsSolved;
  }

  get maxProblems() {
    return this.config.maxQuestions;
  }

  getResult(timestamp) {
    if (this.finalResult) return this.finalResult;
    const now = this._time(timestamp);
    this.tick(now);
    if (this.finalResult) return this.finalResult;
    const previousReason = this.endReason;
    this.endReason = "in-progress";
    const result = this._buildResult(now);
    this.endReason = previousReason;
    return result;
  }

  snapshot(timestamp) {
    const now = this._time(timestamp);
    return Object.freeze({
      phase: this.phase,
      mode: this.config.mode,
      danger: clampDanger(this.danger),
      combo: this.combo,
      bestCombo: this.bestCombo,
      rawScore: this.rawScore,
      problemsSolved: this.problemsSolved,
      solvedCount: this.problemsSolved,
      problemOrdinal: this.sessionQueue?.issuedCount ?? (this.problemsSolved + (this.currentQuestion ? 1 : 0)),
      maxProblems: this.config.maxQuestions,
      dangerEnabled: this.config.dangerEnabled,
      activeSessionMs: Math.round(this.activeSessionMs),
      remainingMs: this.remainingMs === null ? null : Math.round(this.remainingMs),
      rankEligible: this.rankEligible,
      accumulatedPauseMs: Math.round(this._effectivePauseMs(now)),
      pauseReasons: Object.freeze([...this.pauseReasons]),
      currentQuestion: this.currentQuestion,
      problemToken: this.problemToken,
      currentProblemElapsedMs: Math.round(this.currentProblemElapsedMs),
      typing: this.typingEngine?.snapshot(now) ?? null,
      endReason: this.endReason,
    });
  }
}
