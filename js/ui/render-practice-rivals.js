function createRow(entry) {
  const row = document.createElement("li");
  row.className = "rival-row";
  if (entry.isCurrentUser) row.dataset.current = "true";
  const rank = document.createElement("span");
  rank.textContent = `#${entry.rank}`;
  const name = document.createElement("strong");
  name.textContent = entry.playerName;
  const score = document.createElement("span");
  score.textContent = Number(entry.score).toLocaleString();
  row.append(rank, name, score);
  return row;
}

export function renderPracticeRivals(state, { root = document } = {}) {
  const panel = root.querySelector("#practice-rivals");
  if (!panel) return;
  panel.hidden = state.kind === "hidden";
  if (panel.hidden) return;
  const list = root.querySelector("#practice-rival-list");
  const message = root.querySelector("#practice-rival-state");
  const paceScore = root.querySelector("#practice-pace-score");
  const target = root.querySelector("#practice-rival-target");
  paceScore.textContent = Number(state.score ?? 0).toLocaleString();
  list.replaceChildren();

  const messages = {
    loading: "내 Quick 순위 주변 라이벌을 불러오는 중입니다…",
    empty: "Quick Play 기록을 등록하면 내 순위 위·아래 5명의 라이벌이 표시됩니다.",
    offline: "랭킹 연결 없이도 Practice는 계속됩니다.",
    error: "라이벌 정보를 불러오지 못했습니다. Practice는 정상 진행됩니다.",
  };
  if (state.kind !== "ready") {
    message.hidden = false;
    message.textContent = messages[state.kind] ?? messages.error;
    target.textContent = "연습 점수는 랭킹에 제출되지 않습니다.";
    return;
  }

  message.hidden = true;
  for (const entry of state.entries ?? []) list.append(createRow(entry));
  const score = Number(state.score ?? 0);
  const next = [...(state.entries ?? [])]
    .filter((entry) => Number(entry.score) > score)
    .sort((left, right) => Number(left.score) - Number(right.score))[0];
  target.textContent = next
    ? `${next.playerName}까지 ${(Number(next.score) - score).toLocaleString()}점 · Practice 점수는 비랭크입니다.`
    : "주변 라이벌 점수를 앞섰습니다 · Practice 점수는 비랭크입니다.";
}
