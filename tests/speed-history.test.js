import assert from "node:assert/strict";
import test from "node:test";

import { buildSpeedTrend, SPEED_CHART_POINT_LIMIT, SPEED_HISTORY_LIMIT } from "../js/core/speed-history.js";

function record(index, cpm) {
  return { cpm, completedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, gameMode: "quick" };
}

test("speed trend keeps the latest 2,000 local records and samples chart points", () => {
  const history = Array.from({ length: SPEED_HISTORY_LIMIT + 50 }, (_, index) => record(index % 28, index));
  const trend = buildSpeedTrend(history);

  assert.equal(trend.count, SPEED_HISTORY_LIMIT);
  assert.equal(trend.latest, SPEED_HISTORY_LIMIT + 49);
  assert.equal(trend.points.length, SPEED_CHART_POINT_LIMIT);
  assert.equal(trend.points.at(-1).cpm, SPEED_HISTORY_LIMIT + 49);
});

test("speed trend reports recent and previous window averages without invalid entries", () => {
  const trend = buildSpeedTrend([
    record(0, 100), record(1, 120), { cpm: -1 }, record(2, 140), record(3, 160),
  ], { recentWindow: 2 });

  assert.equal(trend.count, 4);
  assert.equal(trend.recentAverage, 150);
  assert.equal(trend.previousAverage, 110);
});
