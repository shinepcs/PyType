export const SPEED_HISTORY_LIMIT = 2_000;
export const SPEED_CHART_POINT_LIMIT = 120;

function finiteCpm(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function sampleEvenly(entries, limit) {
  if (entries.length <= limit) return entries;
  const lastIndex = entries.length - 1;
  return Array.from({ length: limit }, (_, index) => entries[
    Math.round((index * lastIndex) / (limit - 1))
  ]);
}

function average(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildSpeedTrend(history, {
  chartPointLimit = SPEED_CHART_POINT_LIMIT,
  recentWindow = 10,
} = {}) {
  const entries = (Array.isArray(history) ? history : [])
    .map((entry) => ({ ...entry, cpm: finiteCpm(entry?.cpm) }))
    .filter((entry) => entry.cpm !== null)
    .slice(-SPEED_HISTORY_LIMIT);
  const latest = entries.at(-1) ?? null;
  const window = Math.max(1, Math.trunc(recentWindow) || 10);
  const recent = entries.slice(-window).map((entry) => entry.cpm);
  const previous = entries.slice(-window * 2, -window).map((entry) => entry.cpm);
  const values = entries.map((entry) => entry.cpm);

  return Object.freeze({
    count: entries.length,
    latest: latest?.cpm ?? null,
    recentAverage: recent.length > 0 ? Math.round(average(recent) * 10) / 10 : null,
    previousAverage: previous.length > 0 ? Math.round(average(previous) * 10) / 10 : null,
    points: Object.freeze(sampleEvenly(entries, Math.max(2, Math.trunc(chartPointLimit) || SPEED_CHART_POINT_LIMIT))),
    minimum: values.length > 0 ? Math.min(...values) : null,
    maximum: values.length > 0 ? Math.max(...values) : null,
  });
}
