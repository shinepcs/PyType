export function renderProgress(skills, history = [], { root = document } = {}) {
  const summary = root.querySelector("#progress-summary");
  const grid = root.querySelector("#mastery-grid");
  summary.replaceChildren();
  grid.replaceChildren();

  const attempts = Object.values(skills).reduce((total, skill) => total + Number(skill.attempts ?? 0), 0);
  const sessions = history.length;
  const average = Object.keys(skills).length
    ? Math.round(Object.values(skills).reduce((total, skill) => total + Number(skill.mastery ?? 0), 0) / Object.keys(skills).length)
    : 0;
  for (const [label, value] of [["SESSIONS", sessions], ["PROBLEM ATTEMPTS", attempts], ["AVG MASTERY", `${average}%`]]) {
    const card = document.createElement("div");
    card.className = "summary-card";
    const small = document.createElement("small");
    small.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    card.append(small, strong);
    summary.append(card);
  }

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
