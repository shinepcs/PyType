function set(id, value, root = document) {
  const node = root.querySelector(`#${id}`);
  if (node) node.textContent = String(value ?? "");
}

export function renderResult(result, { root = document, formatTime = (ms) => String(ms) } = {}) {
  const gameOver = result.endReason === "danger" || result.endReason === "game-over";
  set("result-reason", gameOver ? "SYSTEM OVERRUN" : result.endReason === "quit" ? "SESSION ENDED" : "SESSION COMPLETE", root);
  set("result-title", gameOver ? "위험도 한계 도달" : "훈련 완료", root);
  set("result-score", Number(result.score ?? 0).toLocaleString(), root);
  set("result-accuracy", `${Number(result.accuracy ?? 0).toFixed(1)}%`, root);
  set("result-wpm", Number(result.wpm ?? 0).toFixed(1), root);
  set("result-solved", result.problemsSolved ?? result.solvedCount ?? 0, root);
  set("result-combo", result.bestCombo ?? 0, root);
  set("result-time", formatTime(result.survivalMs ?? 0), root);
  set("result-keys", result.correctKeystrokes ?? 0, root);

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
