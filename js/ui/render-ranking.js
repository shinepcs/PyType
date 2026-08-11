const HEADERS = ["rank", "playerName", "score", "accuracy", "wpm", "problemsSolved", "createdAt"];

function formatCell(key, value) {
  if (key === "rank") return Number.isFinite(Number(value)) ? `#${value}` : String(value ?? "—");
  if (key === "score") return Number(value).toLocaleString();
  if (key === "accuracy") return `${Number(value).toFixed(1)}%`;
  if (key === "wpm") return Number(value).toFixed(1);
  if (key === "createdAt") return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(new Date(value));
  return String(value ?? "—");
}

export function renderRankingRows(rows, { root = document } = {}) {
  const body = root.querySelector("#ranking-body");
  body.replaceChildren();
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    if (row.isCurrentUser) tr.dataset.currentUser = "true";
    const normalized = { ...row, rank: row.rank ?? index + 1 };
    for (const key of HEADERS) {
      const td = document.createElement("td");
      td.textContent = formatCell(key, normalized[key]);
      tr.append(td);
    }
    body.append(tr);
  });
}

export function renderRankingState(kind, { message, rows = [], root = document } = {}) {
  const state = root.querySelector("#ranking-state");
  const wrap = root.querySelector("#ranking-table-wrap");
  const retry = root.querySelector("#retry-ranking-list");
  const messages = {
    loading: "랭킹을 불러오는 중입니다…",
    offline: "Supabase가 설정되지 않았거나 연결할 수 없습니다. 게임과 로컬 기록은 정상적으로 사용할 수 있습니다.",
    empty: "아직 표시할 Quick Play 기록이 없습니다.",
    error: "랭킹을 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
    ready: "",
  };
  if (kind === "ready" && rows.length > 0) renderRankingRows(rows, { root });
  state.textContent = message ?? messages[kind] ?? messages.error;
  state.hidden = kind === "ready" && rows.length > 0;
  wrap.hidden = !(kind === "ready" && rows.length > 0);
  retry.hidden = kind !== "error" && kind !== "offline";
}

export function selectRankingTab(tabName, { root = document } = {}) {
  for (const tab of root.querySelectorAll("[data-ranking-tab]")) {
    tab.setAttribute("aria-selected", String(tab.dataset.rankingTab === tabName));
    tab.tabIndex = tab.dataset.rankingTab === tabName ? 0 : -1;
  }
}
