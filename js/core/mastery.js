import { clamp, MILLISECONDS_PER_DAY, timestampOf } from "../utils/time.js";

export const MAX_RECENT_RESULTS = 20;
export const LEVEL_TRANSITION_WINDOW = 10;

function finiteInteger(value, minimum = 0) {
  return Math.max(minimum, Math.trunc(Number(value) || 0));
}

function resultTimestamp(result, fallback = Date.now()) {
  return timestampOf(result?.completedAt, fallback);
}

function toIsoString(timestamp) {
  try {
    return new Date(timestamp).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

export function normalizeProblemResult(result, fallbackCompletedAt = Date.now()) {
  if (!result || typeof result !== "object") {
    throw new TypeError("problem result is required");
  }
  const elapsedMs = finiteInteger(result.elapsedMs);
  const targetMs = finiteInteger(result.targetMs);
  const totalKeystrokes = finiteInteger(result.totalKeystrokes);
  const correctKeystrokes = clamp(
    finiteInteger(result.correctKeystrokes),
    0,
    totalKeystrokes,
  );
  const errorCount = finiteInteger(result.errorCount);
  const completedAtMs = resultTimestamp(result, timestampOf(fallbackCompletedAt, Date.now()));

  return Object.freeze({
    questionId: String(result.questionId ?? ""),
    skill: String(result.skill ?? ""),
    level: result.level === 2 ? 2 : 1,
    elapsedMs,
    targetMs,
    correctKeystrokes,
    totalKeystrokes,
    errorCount,
    cleanSolve: Boolean(result.cleanSolve) && errorCount === 0,
    slow: result.slow === undefined ? elapsedMs > targetMs : Boolean(result.slow),
    completedAt: toIsoString(completedAtMs),
  });
}

export function calculateMastery(recentResults = []) {
  const recent = recentResults.slice(-MAX_RECENT_RESULTS);
  if (recent.length === 0) return 0;

  const totalKeystrokes = recent.reduce(
    (sum, result) => sum + finiteInteger(result.totalKeystrokes),
    0,
  );
  const correctKeystrokes = recent.reduce(
    (sum, result) => sum + finiteInteger(result.correctKeystrokes),
    0,
  );
  const accuracyScore = totalKeystrokes === 0
    ? 0
    : clamp(correctKeystrokes / totalKeystrokes, 0, 1);
  const cleanScore = recent.filter((result) => result.cleanSolve).length / recent.length;
  const speedScore = recent.reduce((sum, result) => {
    const targetMs = finiteInteger(result.targetMs);
    const elapsedMs = finiteInteger(result.elapsedMs);
    const ratio = elapsedMs === 0 ? (targetMs > 0 ? 1 : 0) : targetMs / elapsedMs;
    return sum + clamp(ratio, 0, 1);
  }, 0) / recent.length;

  return Math.round(100 * (
    0.6 * accuracyScore
    + 0.25 * cleanScore
    + 0.15 * speedScore
  ));
}

export function calculateReviewDueAt(result, previousRecentResults = []) {
  const normalized = normalizeProblemResult(result);
  const completedAt = timestampOf(normalized.completedAt);

  if (normalized.errorCount > 0 || !normalized.cleanSolve) {
    return toIsoString(completedAt);
  }
  if (normalized.slow) {
    return toIsoString(completedAt + MILLISECONDS_PER_DAY);
  }

  let consecutiveFastClean = 1;
  for (let index = previousRecentResults.length - 1; index >= 0; index -= 1) {
    const previous = previousRecentResults[index];
    if (!previous.cleanSolve || previous.slow || finiteInteger(previous.errorCount) > 0) break;
    consecutiveFastClean += 1;
  }
  const intervalDays = consecutiveFastClean === 1 ? 3 : consecutiveFastClean === 2 ? 7 : 14;
  return toIsoString(completedAt + intervalDays * MILLISECONDS_PER_DAY);
}

export function createEmptySkillMastery() {
  return {
    attempts: 0,
    cleanSolves: 0,
    correctKeystrokes: 0,
    totalKeystrokes: 0,
    averageElapsedMs: 0,
    recentResults: [],
    lastSeenAt: null,
    dueAt: null,
    mastery: 0,
  };
}

export function updateSkillMastery(previousRecord, result) {
  const previous = previousRecord && typeof previousRecord === "object"
    ? previousRecord
    : createEmptySkillMastery();
  const normalized = normalizeProblemResult(result);
  const previousRecent = Array.isArray(previous.recentResults)
    ? previous.recentResults.map((item) => normalizeProblemResult(item))
    : [];
  const recentResults = [...previousRecent, normalized].slice(-MAX_RECENT_RESULTS);
  const totalElapsed = recentResults.reduce((sum, item) => sum + item.elapsedMs, 0);

  return {
    attempts: finiteInteger(previous.attempts) + 1,
    cleanSolves: finiteInteger(previous.cleanSolves) + (normalized.cleanSolve ? 1 : 0),
    correctKeystrokes: finiteInteger(previous.correctKeystrokes) + normalized.correctKeystrokes,
    totalKeystrokes: finiteInteger(previous.totalKeystrokes) + normalized.totalKeystrokes,
    averageElapsedMs: recentResults.length === 0 ? 0 : Math.round(totalElapsed / recentResults.length),
    recentResults,
    lastSeenAt: normalized.completedAt,
    dueAt: calculateReviewDueAt(normalized, previousRecent),
    mastery: calculateMastery(recentResults),
  };
}

export function getRecentPerformance(record, windowSize = LEVEL_TRANSITION_WINDOW) {
  const results = Array.isArray(record?.recentResults)
    ? record.recentResults.slice(-Math.max(1, windowSize))
    : [];
  const total = results.reduce((sum, item) => sum + finiteInteger(item.totalKeystrokes), 0);
  const correct = results.reduce((sum, item) => sum + finiteInteger(item.correctKeystrokes), 0);
  const accuracy = total === 0 ? 0 : correct / total * 100;
  const firstTryRate = results.length === 0
    ? 0
    : results.filter((item) => item.cleanSolve).length / results.length * 100;

  return Object.freeze({
    attempts: results.length,
    accuracy,
    firstTryRate,
    preferLevel2: results.length >= LEVEL_TRANSITION_WINDOW
      && accuracy >= 90
      && firstTryRate >= 70,
  });
}

export function isReviewDue(record, now = Date.now()) {
  if (!record?.dueAt) return true;
  return Math.max(0, timestampOf(record.dueAt) - timestampOf(now)) === 0;
}

export function getWeakSkills(skillRecords, limit = 3) {
  return Object.entries(skillRecords ?? {})
    .filter(([, record]) => finiteInteger(record?.attempts) > 0)
    .sort(([skillA, recordA], [skillB, recordB]) => {
      const masteryDifference = finiteInteger(recordA.mastery) - finiteInteger(recordB.mastery);
      if (masteryDifference !== 0) return masteryDifference;
      return skillA.localeCompare(skillB);
    })
    .slice(0, Math.max(0, Math.trunc(limit)))
    .map(([skill]) => skill);
}
