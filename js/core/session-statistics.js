const RECENT_SESSION_LIMIT = 5;

const METRICS = Object.freeze({
  score: Object.freeze({ tolerance: 0.5, lowerIsBetter: false }),
  accuracy: Object.freeze({ tolerance: 0.05, lowerIsBetter: false }),
  cpm: Object.freeze({ tolerance: 0.25, lowerIsBetter: false }),
  problemsSolved: Object.freeze({ tolerance: 0.5, lowerIsBetter: false }),
  averageProblemMs: Object.freeze({ tolerance: 50, lowerIsBetter: true }),
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metricValue(record, metric) {
  if (metric === "averageProblemMs") {
    const stored = finiteNumber(record?.averageProblemMs);
    return stored !== null && stored >= 0 ? stored : null;
  }
  return finiteNumber(record?.[metric]);
}

function average(values) {
  const available = values.filter((value) => value !== null);
  if (available.length === 0) return null;
  return available.reduce((sum, value) => sum + value, 0) / available.length;
}

function compareMetric(current, previous, definition) {
  if (current === null || previous === null) return "unavailable";
  const delta = current - previous;
  if (Math.abs(delta) <= definition.tolerance) return "same";
  const improved = definition.lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? "improved" : "declined";
}

function overallTrend(metrics, hasPrevious) {
  if (!hasPrevious) return "first";
  const accuracy = metrics.accuracy.direction;
  const score = metrics.score.direction;
  const improved = [accuracy, score].includes("improved");
  const declined = [accuracy, score].includes("declined");
  if (improved && declined) return "mixed";
  if (improved) return "improved";
  if (declined) return "declined";
  return "steady";
}

export function createSessionVariant(gameMode, options = {}) {
  if (options.beginnerGuide) return "beginner-guide";
  if (options.sampleLogic) return "sample-logic";
  if (gameMode !== "practice") return String(gameMode ?? "unknown");
  const skills = [...new Set(
    (Array.isArray(options.skills) ? options.skills : [])
      .filter((skill) => typeof skill === "string" && skill.length > 0),
  )].sort();
  return skills.length > 0 ? `practice:${skills.join(",")}` : "practice";
}

export function getSessionVariant(record) {
  return typeof record?.sessionVariant === "string" && record.sessionVariant.length > 0
    ? record.sessionVariant
    : String(record?.gameMode ?? record?.mode ?? "unknown");
}

export function calculateAverageProblemMs(problemResults) {
  const elapsed = (Array.isArray(problemResults) ? problemResults : [])
    .map((result) => finiteNumber(result?.elapsedMs))
    .filter((value) => value !== null && value >= 0);
  return elapsed.length > 0
    ? Math.round(elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length)
    : null;
}

export function buildSessionStatistics(current, history = [], { recentLimit = RECENT_SESSION_LIMIT } = {}) {
  const variant = getSessionVariant(current);
  const comparable = (Array.isArray(history) ? history : [])
    .filter((record) => (
      record?.sessionId !== current?.sessionId
      && record?.endedNormally !== false
      && getSessionVariant(record) === variant
    ));
  const recent = comparable.slice(-Math.max(1, Math.trunc(recentLimit) || RECENT_SESSION_LIMIT));
  const previous = recent.at(-1) ?? null;
  const metrics = {};

  for (const [metric, definition] of Object.entries(METRICS)) {
    const currentValue = metricValue(current, metric);
    const previousValue = metricValue(previous, metric);
    metrics[metric] = Object.freeze({
      current: currentValue,
      previous: previousValue,
      recentAverage: average(recent.map((record) => metricValue(record, metric))),
      delta: currentValue === null || previousValue === null ? null : currentValue - previousValue,
      direction: compareMetric(currentValue, previousValue, definition),
    });
  }

  return Object.freeze({
    variant,
    previous,
    recentCount: recent.length,
    trend: overallTrend(metrics, Boolean(previous)),
    metrics: Object.freeze(metrics),
  });
}
