function set(id, value, root = document) {
  const node = root.querySelector(`#${id}`);
  if (node) node.textContent = String(value ?? "");
}

const COMPARISON_METRICS = Object.freeze([
  { key: "score", label: "SCORE", format: (value) => Math.round(value).toLocaleString(), deltaSuffix: "" },
  { key: "accuracy", label: "ACCURACY", format: (value) => `${value.toFixed(1)}%`, deltaSuffix: "%p" },
  { key: "cpm", label: "분당 타수", format: (value) => `${value.toFixed(1)}타/분`, deltaSuffix: "타/분" },
  { key: "problemsSolved", label: "SOLVED", format: (value) => Math.round(value).toLocaleString(), deltaSuffix: "" },
  { key: "averageProblemMs", label: "AVG / PROBLEM", format: (value) => `${(value / 1_000).toFixed(1)}s`, deltaSuffix: "s", milliseconds: true },
]);

function modeLabel(variant) {
  if (variant === "quick") return "QUICK PLAY";
  if (variant === "daily") return "DAILY TRAINING";
  if (variant === "sample-logic") return "SAMPLE LOGIC";
  if (variant === "beginner-guide") return "BEGINNER GUIDE";
  return variant?.startsWith("practice:") ? "PRACTICE · SAME SKILLS" : "PRACTICE";
}

function formatDelta(metric, delta) {
  if (delta === null) return "—";
  const converted = metric.milliseconds ? delta / 1_000 : delta;
  const precision = metric.key === "score" || metric.key === "problemsSolved" ? 0 : 1;
  const sign = converted > 0 ? "+" : "";
  return `${sign}${converted.toFixed(precision)}${metric.deltaSuffix}`;
}

function renderSessionStatistics(statistics, root) {
  const container = root.querySelector("#result-progress");
  const grid = root.querySelector("#result-comparison-grid");
  if (!container || !grid || !statistics) return;

  container.dataset.trend = statistics.trend;
  set("result-progress-mode", `${modeLabel(statistics.variant)} · LOCAL PROGRESS`, root);
  const trendCopy = {
    first: { badge: "FIRST RECORD", summary: "이 모드의 첫 기록입니다. 다음 플레이부터 변화량을 보여드립니다." },
    improved: { badge: "IMPROVED", summary: "직전 기록보다 점수와 정확도의 흐름이 좋아졌습니다." },
    declined: { badge: "TRY AGAIN", summary: "직전 기록보다 점수 또는 정확도가 낮습니다. 약한 문법을 한 번 더 연습해 보세요." },
    mixed: { badge: "MIXED", summary: "점수와 정확도의 변화 방향이 엇갈립니다. 아래 지표를 함께 확인하세요." },
    steady: { badge: "STEADY", summary: "직전 기록과 비슷한 수준을 유지했습니다." },
  }[statistics.trend];
  set("result-trend-badge", trendCopy.badge, root);
  set("result-progress-summary", trendCopy.summary, root);
  set(
    "result-comparison-note",
    statistics.recentCount > 0
      ? `같은 모드의 직전 기록과 최근 ${statistics.recentCount}회 평균을 비교합니다.`
      : "같은 모드의 완료 기록만 비교합니다.",
    root,
  );

  grid.replaceChildren();
  for (const definition of COMPARISON_METRICS) {
    const metric = statistics.metrics[definition.key];
    const card = document.createElement("div");
    card.className = "comparison-card";
    card.dataset.direction = metric.direction;
    const label = document.createElement("small");
    label.textContent = definition.label;
    const delta = document.createElement("strong");
    delta.textContent = formatDelta(definition, metric.delta);
    const previous = document.createElement("span");
    previous.textContent = metric.previous === null
      ? "이전 기록 없음"
      : `이전 ${definition.format(metric.previous)}`;
    const average = document.createElement("span");
    average.textContent = metric.recentAverage === null
      ? "최근 평균 없음"
      : `최근 평균 ${definition.format(metric.recentAverage)}`;
    card.append(label, delta, previous, average);
    grid.append(card);
  }
}

export function renderResult(result, {
  root = document,
  formatTime = (ms) => String(ms),
  statistics = null,
} = {}) {
  const gameOver = result.endReason === "danger" || result.endReason === "game-over";
  set("result-reason", gameOver ? "SYSTEM OVERRUN" : result.endReason === "quit" ? "SESSION ENDED" : "SESSION COMPLETE", root);
  const reachedPracticeBoundary = ["time-limit", "danger", "game-over"].includes(result.endReason);
  set("result-title", reachedPracticeBoundary ? "현재 문장까지 연습을 마쳤어요" : "훈련 완료", root);
  set("result-score", Number(result.score ?? 0).toLocaleString(), root);
  set("result-accuracy", `${Number(result.accuracy ?? 0).toFixed(1)}%`, root);
  set("result-cpm", `${Number(result.cpm ?? 0).toFixed(1)}타/분`, root);
  set("result-solved", result.problemsSolved ?? result.solvedCount ?? 0, root);
  set("result-combo", result.bestCombo ?? 0, root);
  set("result-time", formatTime(result.survivalMs ?? 0), root);
  set("result-keys", result.correctKeystrokes ?? 0, root);
  renderSessionStatistics(statistics, root);

  const best = root.querySelector("#new-best");
  if (best) best.hidden = !result.isPersonalBest;
  const weakList = root.querySelector("#weak-skill-list");
  weakList?.replaceChildren();
  for (const skill of (result.weakSkills ?? []).slice(0, 3)) {
    const pill = document.createElement("span");
    pill.className = "weak-skill-pill";
    pill.textContent = typeof skill === "string" ? skill : `${skill.skill} · ${Math.round(skill.mastery ?? 0)}%`;
    weakList?.append(pill);
  }
  if (weakList && weakList.childElementCount === 0) {
    const message = document.createElement("span");
    message.textContent = "이번 세션에서 두드러진 약점이 없습니다.";
    weakList.append(message);
  }
}

export function renderRankingSubmission(status, { root = document } = {}) {
  const container = root.querySelector("#ranking-submit-status");
  const label = root.querySelector("#ranking-submit-label");
  const retry = root.querySelector("#retry-ranking");
  const states = {
    local: "로컬 결과 저장 완료 · 비랭크 모드",
    ineligible: "이 세션은 온라인 등록 조건을 충족하지 않습니다.",
    offline: "랭킹 오프라인 · 결과를 보관했으며 다시 시도할 수 있습니다.",
    submitting: "온라인 랭킹에 등록하는 중…",
    success: status.rank ? `온라인 등록 완료 · Global #${status.rank}` : "온라인 랭킹 등록 완료",
    duplicate: "이미 등록된 세션입니다 · 기존 기록을 확인했습니다.",
    error: "온라인 등록 실패 · 같은 세션으로 다시 시도할 수 있습니다.",
  };
  if (container) container.dataset.status = status.kind;
  if (label) label.textContent = states[status.kind] ?? states.local;
  if (retry) retry.hidden = status.kind !== "error" && status.kind !== "offline";
}
