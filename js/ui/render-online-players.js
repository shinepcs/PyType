function renderPanel(panel, state) {
  const list = panel.querySelector("[data-online-list], #online-player-list");
  const status = panel.querySelector("[data-online-state], #online-player-state");
  const count = panel.querySelector("[data-online-count], #online-player-count");
  if (!list || !status || !count) return;
  list.replaceChildren();
  const messages = {
    loading: "접속자를 확인하는 중…",
    empty: "현재 표시할 접속자가 없습니다.",
    offline: "온라인 목록에 연결할 수 없습니다.",
    error: "온라인 목록을 갱신하지 못했습니다.",
  };
  if (state.kind !== "ready") {
    status.hidden = false;
    status.textContent = messages[state.kind] ?? messages.error;
    count.textContent = "0 ONLINE";
    return;
  }
  status.hidden = true;
  count.textContent = `${state.players.length} ONLINE`;
  for (const player of state.players) {
    const item = document.createElement("li");
    const marker = document.createElement("span");
    marker.className = "online-dot";
    marker.setAttribute("aria-label", "온라인");
    const name = document.createElement("strong");
    name.textContent = player.playerName;
    const score = document.createElement("span");
    score.textContent = `BEST ${player.bestScore.toLocaleString()}`;
    item.append(marker, name, score);
    list.append(item);
  }
}

export function renderOnlinePlayers(state, { root = document } = {}) {
  const panels = [...root.querySelectorAll("[data-online-players]")];
  if (panels.length === 0 && root.matches?.("[data-online-players]")) panels.push(root);
  for (const panel of panels) renderPanel(panel, state);
}
