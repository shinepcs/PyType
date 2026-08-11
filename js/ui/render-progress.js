import { buildSpeedTrend } from "../core/speed-history.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgNode(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function renderSpeedTrend(speedHistory, root) {
  const chart = root.querySelector("#speed-trend-chart");
  const empty = root.querySelector("#speed-trend-empty");
  const summary = root.querySelector("#speed-trend-summary");
  if (!chart || !empty || !summary) return;

  const trend = buildSpeedTrend(speedHistory);
  chart.replaceChildren();
  if (trend.count === 0) {
    chart.setAttribute("hidden", "");
    empty.removeAttribute("hidden");
    summary.textContent = "완료한 세션부터 분당 타수 추세를 기록합니다.";
    return;
  }

  const width = 640;
  const height = 200;
  const padding = { top: 18, right: 16, bottom: 30, left: 46 };
  const low = Math.max(0, Math.floor((trend.minimum - Math.max(10, (trend.maximum - trend.minimum) * 0.12)) / 10) * 10);
  const high = Math.ceil((trend.maximum + Math.max(10, (trend.maximum - trend.minimum) * 0.12)) / 10) * 10;
  const range = Math.max(1, high - low);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xAt = (index) => padding.left + (trend.points.length <= 1 ? 0 : index * plotWidth / (trend.points.length - 1));
  const yAt = (value) => padding.top + ((high - value) / range) * plotHeight;

  chart.removeAttribute("hidden");
  empty.setAttribute("hidden", "");
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.setAttribute("aria-label", `완료한 세션 ${trend.count}개의 분당 타수 추세. 최근 ${Math.round(trend.latest)}타/분`);
  chart.append(svgNode("line", { x1: padding.left, y1: padding.top, x2: padding.left, y2: height - padding.bottom, class: "speed-chart-axis" }));
  chart.append(svgNode("line", { x1: padding.left, y1: height - padding.bottom, x2: width - padding.right, y2: height - padding.bottom, class: "speed-chart-axis" }));
  for (const value of [low, Math.round((low + high) / 2), high]) {
    const y = yAt(value);
    chart.append(svgNode("line", { x1: padding.left, y1: y, x2: width - padding.right, y2: y, class: "speed-chart-grid" }));
    const label = svgNode("text", { x: padding.left - 8, y: y + 4, class: "speed-chart-label", "text-anchor": "end" });
    label.textContent = String(value);
    chart.append(label);
  }
  const line = svgNode("polyline", {
    points: trend.points.map((entry, index) => `${xAt(index)},${yAt(entry.cpm)}`).join(" "),
    class: "speed-chart-line",
  });
  chart.append(line);
  const latest = trend.points.at(-1);
  chart.append(svgNode("circle", { cx: xAt(trend.points.length - 1), cy: yAt(latest.cpm), r: 4, class: "speed-chart-dot" }));
  const startLabel = svgNode("text", { x: padding.left, y: height - 8, class: "speed-chart-label" });
  startLabel.textContent = "처음";
  const endLabel = svgNode("text", { x: width - padding.right, y: height - 8, class: "speed-chart-label", "text-anchor": "end" });
  endLabel.textContent = "최근";
  chart.append(startLabel, endLabel);
  const change = trend.previousAverage === null ? "비교 기준을 쌓는 중" : `${trend.recentAverage >= trend.previousAverage ? "+" : ""}${(trend.recentAverage - trend.previousAverage).toFixed(1)}타/분`;
  summary.textContent = `최근 ${Math.min(10, trend.count)}회 평균 ${trend.recentAverage.toFixed(1)}타/분 · 이전 구간 대비 ${change}`;
}

export function renderProgress(skills, history = [], speedHistory = [], { root = document } = {}) {
  const summary = root.querySelector("#progress-summary");
  const grid = root.querySelector("#mastery-grid");
  summary.replaceChildren();
  grid.replaceChildren();

  const attempts = Object.values(skills).reduce((total, skill) => total + Number(skill.attempts ?? 0), 0);
  const sessions = history.length;
  const average = Object.keys(skills).length
    ? Math.round(Object.values(skills).reduce((total, skill) => total + Number(skill.mastery ?? 0), 0) / Object.keys(skills).length)
    : 0;
  const latestCpm = buildSpeedTrend(speedHistory).latest;
  for (const [label, value] of [["SESSIONS", sessions], ["SPEED RECORDS", speedHistory.length], ["LATEST CPM", latestCpm === null ? "—" : `${Math.round(latestCpm)}타/분`], ["AVG MASTERY", `${average}%`]]) {
    const card = document.createElement("div");
    card.className = "summary-card";
    const small = document.createElement("small");
    small.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    card.append(small, strong);
    summary.append(card);
  }

  renderSpeedTrend(speedHistory, root);
  const entries = Object.entries(skills).sort(([, a], [, b]) => Number(a.mastery ?? 0) - Number(b.mastery ?? 0));
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "아직 학습 기록이 없습니다. Quick Play나 Practice를 시작해 보세요.";
    grid.append(empty);
    return;
  }
  for (const [name, skill] of entries) {
    const card = document.createElement("article");
    card.className = "mastery-card";
    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = name;
    const value = document.createElement("span");
    value.textContent = `${Math.round(skill.mastery ?? 0)}%`;
    header.append(title, value);
    const detail = document.createElement("small");
    detail.textContent = `${skill.attempts ?? 0} attempts · ${skill.cleanSolves ?? 0} clean`;
    const meter = document.createElement("div");
    meter.className = "mastery-meter";
    const fill = document.createElement("span");
    fill.style.width = `${Math.min(100, Math.max(0, Number(skill.mastery ?? 0)))}%`;
    meter.append(fill);
    card.append(header, detail, meter);
    grid.append(card);
  }
}
