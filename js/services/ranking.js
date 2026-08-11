import { calculateFinalScore } from "../core/scoring.js";
import {
  SupabaseClientError,
  toSafeNetworkError,
} from "./supabase-client.js";

const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9_]{2,12}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ELIGIBLE_END_REASONS = new Set([
  "time",
  "time_over",
  "danger",
  "game_over",
  "problem_limit",
  "time-limit",
  "game-over",
  "question-limit",
  "completed",
]);

function roundToTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isFiniteInRange(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isIntegerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

export function recalculateRankingScore(result) {
  if (Array.isArray(result?.problemScores)
      && result.problemScores.every((score) => Number.isFinite(score) && score >= 0)) {
    return calculateFinalScore(result.problemScores, Number(result.accuracy));
  }
  if (Number.isFinite(result?.rawScore) && result.rawScore >= 0) {
    return calculateFinalScore(result.rawScore, Number(result.accuracy));
  }
  return null;
}

export function validateRankingResult(result) {
  const errors = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, errors: ["result_invalid"] };
  }

  const normalized = {
    sessionId: firstDefined(result.sessionId, result.session_id),
    playerName: firstDefined(result.playerName, result.nickname, result.player_name),
    score: firstDefined(result.score, result.finalScore),
    accuracy: result.accuracy,
    wpm: result.wpm,
    problemsSolved: firstDefined(result.problemsSolved, result.problems_solved),
    bestCombo: firstDefined(result.bestCombo, result.best_combo),
    survivalMs: firstDefined(result.survivalMs, result.survivalTimeMs, result.survival_ms),
    gameMode: firstDefined(result.gameMode, result.mode, result.game_mode),
    contentVersion: firstDefined(result.contentVersion, result.content_version),
    clientVersion: firstDefined(result.clientVersion, result.client_version),
    rankEligible: result.rankEligible,
    endReason: firstDefined(result.endReason, result.end_reason),
  };

  if (!UUID_PATTERN.test(normalized.sessionId ?? "")) errors.push("session_id_invalid");
  if (!NICKNAME_PATTERN.test(normalized.playerName ?? "")) errors.push("player_name_invalid");
  if (!isIntegerInRange(normalized.score, 0, 10_000_000)) errors.push("score_invalid");
  if (!isFiniteInRange(normalized.accuracy, 0, 100)) errors.push("accuracy_invalid");
  if (!isFiniteInRange(normalized.wpm, 0, 250)) errors.push("wpm_invalid");
  if (!isIntegerInRange(normalized.problemsSolved, 1, 40)) errors.push("problems_solved_invalid");
  if (!isIntegerInRange(normalized.bestCombo, 0, 40)) errors.push("best_combo_invalid");
  if (!isIntegerInRange(normalized.survivalMs, 10_000, 300_000)) errors.push("survival_ms_invalid");
  if (normalized.gameMode !== "quick") errors.push("game_mode_invalid");
  if (!VERSION_PATTERN.test(normalized.contentVersion ?? "")) errors.push("content_version_invalid");
  if (!VERSION_PATTERN.test(normalized.clientVersion ?? "")) errors.push("client_version_invalid");
  if (normalized.rankEligible !== true) errors.push("rank_ineligible");

  const completed = result.completed === true
    || result.endedNormally === true
    || result.status === "finished"
    || ELIGIBLE_END_REASONS.has(normalized.endReason);
  if (!completed) errors.push("session_not_completed");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...normalized,
      playerName: normalized.playerName,
      accuracy: roundToTwo(normalized.accuracy),
      wpm: roundToTwo(normalized.wpm),
    },
  };
}

function normalizeScoreVerification(verification, submittedScore) {
  if (verification === true) return true;
  if (verification === false || verification === null || verification === undefined) return false;
  if (typeof verification === "object") {
    const candidate = firstDefined(verification.score, verification.finalScore);
    return Number.isInteger(candidate) && candidate === submittedScore;
  }
  return Number.isInteger(verification) && verification === submittedScore;
}

function toDatabasePayload(result, userId) {
  return {
    user_id: userId,
    session_id: result.sessionId,
    player_name: result.playerName,
    score: result.score,
    accuracy: result.accuracy,
    wpm: result.wpm,
    problems_solved: result.problemsSolved,
    best_combo: result.bestCombo,
    survival_ms: result.survivalMs,
    game_mode: "quick",
    content_version: result.contentVersion,
    client_version: result.clientVersion,
  };
}

function queryValidation({ limit = 100, contentVersion } = {}) {
  const safeLimit = Number(limit);
  const errors = [];
  if (!isIntegerInRange(safeLimit, 1, 100)) errors.push("limit_invalid");
  if (!VERSION_PATTERN.test(contentVersion ?? "")) errors.push("content_version_invalid");
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { limit: safeLimit, contentVersion } };
}

function normalizeRankingRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const rank = Number(row.rank);
  const score = Number(row.score);
  const accuracy = Number(row.accuracy);
  const wpm = Number(row.wpm);
  const problemsSolved = Number(row.problems_solved);
  const bestCombo = Number(row.best_combo);
  const survivalMs = Number(row.survival_ms);
  const playerName = row.player_name;
  const createdAt = row.created_at;
  if (!Number.isSafeInteger(rank) || rank < 1
      || !NICKNAME_PATTERN.test(playerName ?? "")
      || !isIntegerInRange(score, 0, 10_000_000)
      || !isFiniteInRange(accuracy, 0, 100)
      || !isFiniteInRange(wpm, 0, 250)
      || !isIntegerInRange(problemsSolved, 1, 40)
      || !isIntegerInRange(bestCombo, 0, 40)
      || !isIntegerInRange(survivalMs, 10_000, 300_000)
      || typeof createdAt !== "string"
      || !Number.isFinite(Date.parse(createdAt))) {
    return null;
  }
  return Object.freeze({
    rank,
    playerName,
    score,
    accuracy: roundToTwo(accuracy),
    wpm: roundToTwo(wpm),
    problemsSolved,
    bestCombo,
    survivalMs,
    createdAt,
  });
}

function normalizeRows(response) {
  if (!Array.isArray(response)) return null;
  const entries = response.map(normalizeRankingRow);
  return entries.every(Boolean) ? entries : null;
}

function invalidResult(errors) {
  return Object.freeze({
    ok: false,
    status: "invalid",
    retryable: false,
    errors: [...errors],
  });
}

function serviceFailure(error) {
  const safe = toSafeNetworkError(error);
  const isOffline = safe.code === "offline" || safe.code === "not_configured";
  return Object.freeze({
    ok: false,
    status: isOffline ? "offline" : "error",
    retryable: safe.retryable,
    error: safe,
  });
}

export class RankingService {
  constructor({
    client = null,
    scoreVerifier = recalculateRankingScore,
    storageRepository = null,
  } = {}) {
    this.client = client;
    this.scoreVerifier = typeof scoreVerifier === "function" ? scoreVerifier : recalculateRankingScore;
    this.storageRepository = storageRepository;
  }

  isOnlineRankingAvailable() {
    return Boolean(this.client)
      && (typeof this.client.isConfigured !== "function" || this.client.isConfigured());
  }

  queueForRetry(result) {
    try {
      this.storageRepository?.enqueueRankingSubmission(result);
    } catch {
      // A ranking/network failure must never interrupt local play.
    }
  }

  removeQueued(sessionId) {
    try {
      this.storageRepository?.removePendingRankingSubmission(sessionId);
    } catch {
      // Successful online submission remains successful if local cleanup fails.
    }
  }

  async submitRanking(result) {
    const validation = validateRankingResult(result);
    if (!validation.ok) return invalidResult(validation.errors);

    let verification;
    try {
      verification = await this.scoreVerifier(result);
    } catch {
      return invalidResult(["score_verification_failed"]);
    }
    if (!normalizeScoreVerification(verification, validation.value.score)) {
      return invalidResult([
        verification === null || verification === undefined
          ? "score_proof_missing"
          : "score_mismatch",
      ]);
    }

    if (!this.isOnlineRankingAvailable()) {
      this.queueForRetry(result);
      return serviceFailure(new SupabaseClientError("not_configured"));
    }

    try {
      const session = await this.client.ensureAnonymousSession();
      const payload = toDatabasePayload(validation.value, session.userId);
      await this.client.request("rest/v1/ranking_entries", {
        method: "POST",
        body: payload,
        accessToken: session.accessToken,
        authenticated: true,
        headers: { Prefer: "return=minimal" },
        retries: this.client.maxRetries,
        idempotent: true,
      });
      this.removeQueued(validation.value.sessionId);
      return Object.freeze({
        ok: true,
        status: "submitted",
        duplicate: false,
        sessionId: validation.value.sessionId,
      });
    } catch (error) {
      if (error instanceof SupabaseClientError && error.code === "conflict") {
        this.removeQueued(validation.value.sessionId);
        return Object.freeze({
          ok: true,
          status: "duplicate",
          duplicate: true,
          sessionId: validation.value.sessionId,
        });
      }
      const failure = serviceFailure(error);
      if (failure.retryable || failure.status === "offline") this.queueForRetry(result);
      return failure;
    }
  }

  async getRanking(functionName, options) {
    const validation = queryValidation(options);
    if (!validation.ok) return invalidResult(validation.errors);
    if (!this.isOnlineRankingAvailable()) {
      return serviceFailure(new SupabaseClientError("not_configured"));
    }
    try {
      const response = await this.client.rpc(functionName, {
        p_content_version: validation.value.contentVersion,
        p_limit: validation.value.limit,
      });
      const entries = normalizeRows(response);
      if (!entries) return serviceFailure(new SupabaseClientError("invalid_response"));
      return Object.freeze({
        ok: true,
        status: entries.length === 0 ? "empty" : "ready",
        entries,
      });
    } catch (error) {
      return serviceFailure(error);
    }
  }

  getGlobalRanking(options) {
    return this.getRanking("get_global_ranking", options);
  }

  getTodayRanking(options) {
    return this.getRanking("get_today_ranking", options);
  }

  async getMyBest({ contentVersion } = {}) {
    const validation = queryValidation({ limit: 1, contentVersion });
    if (!validation.ok) return invalidResult(validation.errors);
    if (!this.isOnlineRankingAvailable()) {
      return serviceFailure(new SupabaseClientError("not_configured"));
    }
    try {
      const response = await this.client.rpc(
        "get_my_best",
        { p_content_version: validation.value.contentVersion },
        { authenticated: true },
      );
      const entries = normalizeRows(response);
      if (!entries) return serviceFailure(new SupabaseClientError("invalid_response"));
      return Object.freeze({
        ok: true,
        status: entries.length === 0 ? "empty" : "ready",
        entry: entries[0] ?? null,
      });
    } catch (error) {
      return serviceFailure(error);
    }
  }

  async getMyRank({ sessionId, contentVersion } = {}) {
    const errors = [];
    if (!UUID_PATTERN.test(sessionId ?? "")) errors.push("session_id_invalid");
    if (!VERSION_PATTERN.test(contentVersion ?? "")) errors.push("content_version_invalid");
    if (errors.length > 0) return invalidResult(errors);
    if (!this.isOnlineRankingAvailable()) {
      return serviceFailure(new SupabaseClientError("not_configured"));
    }
    try {
      const response = await this.client.rpc(
        "get_my_rank",
        {
          p_session_id: sessionId,
          p_content_version: contentVersion,
        },
        { authenticated: true },
      );
      const entries = normalizeRows(response);
      if (!entries) return serviceFailure(new SupabaseClientError("invalid_response"));
      return Object.freeze({
        ok: true,
        status: entries.length === 0 ? "empty" : "ready",
        entry: entries[0] ?? null,
      });
    } catch (error) {
      return serviceFailure(error);
    }
  }

  async retryPendingSubmissions() {
    const pending = this.storageRepository?.read?.().pendingRankingSubmissions ?? [];
    const outcomes = [];
    for (const result of pending) {
      const outcome = await this.submitRanking(result);
      outcomes.push(outcome);
      if (!outcome.ok && outcome.retryable) break;
    }
    return outcomes;
  }
}

export function createRankingService(options) {
  return new RankingService(options);
}

export const rankingApi = Object.freeze({
  submitRanking: "submitRanking(result)",
  getGlobalRanking: "getGlobalRanking({ limit, contentVersion })",
  getTodayRanking: "getTodayRanking({ limit, contentVersion })",
  getMyBest: "getMyBest({ contentVersion })",
  getMyRank: "getMyRank({ sessionId, contentVersion })",
});
