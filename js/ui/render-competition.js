const MAX_SCORE = 10_000_000;

function normalizeCompetitor(entry, playerName) {
  const name = String(entry?.playerName ?? "").trim();
  const score = Number(entry?.score ?? entry?.bestScore);
  if (!name || name === playerName || entry?.isCurrentUser === true) return null;
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null;
  return { playerName: name, score };
}

export function mergeCompetitionPlayers({ rivals = [], onlinePlayers = [], playerName = "" } = {}) {
  const byName = new Map();
  for (const entry of [...rivals, ...onlinePlayers]) {
    const competitor = normalizeCompetitor(entry, playerName);
    if (!competitor) continue;
    const previous = byName.get(competitor.playerName);
    if (!previous || competitor.score > previous.score) byName.set(competitor.playerName, competitor);
  }
  return [...byName.values()];
}

export function selectCompetitionMarkers(competitors, score, { perSide = 2 } = {}) {
  const currentScore = Math.max(0, Number(score) || 0);
  const behind = competitors
    .filter((entry) => entry.score <= currentScore)
    .sort((left, right) => right.score - left.score || left.playerName.localeCompare(right.playerName))
    .slice(0, perSide)
    .reverse();
  const ahead = competitors
    .filter((entry) => entry.score > currentScore)
    .sort((left, right) => left.score - right.score || left.playerName.localeCompare(right.playerName))
    .slice(0, perSide);
  const behindPositions = perSide === 1 ? [25] : [18, 34];
  const aheadPositions = perSide === 1 ? [75] : [66, 82];
  return [
    ...behind.map((entry, index) => ({ ...entry, relation: "behind", position: behindPositions[index] ?? 34 })),
    ...ahead.map((entry, index) => ({ ...entry, relation: "ahead", position: aheadPositions[index] ?? 66 })),
  ];
}

export function findOvertakenCompetitors(competitors, previousScore, currentScore) {
  const before = Math.max(0, Number(previousScore) || 0);
  const after = Math.max(0, Number(currentScore) || 0);
  if (after <= before) return [];
  return competitors
    .filter((entry) => entry.score > before && entry.score <= after)
    .sort((left, right) => left.score - right.score || left.playerName.localeCompare(right.playerName));
}

export function renderBattleCompetition({ competitors = [], score = 0 } = {}, { root = document } = {}) {
  const lane = root.querySelector("#battle-competitors");
  if (!lane) return [];
  const markers = selectCompetitionMarkers(competitors, score);
  const signature = markers.map((marker) => `${marker.playerName}:${marker.score}:${marker.relation}:${marker.position}`).join("|");
  if (lane.dataset.signature === signature) return markers;
  lane.dataset.signature = signature;
  lane.replaceChildren();
  for (const marker of markers) {
    const unit = document.createElement("div");
    unit.className = "rival-unit";
    unit.dataset.relation = marker.relation;
    unit.style.left = `${marker.position}%`;

    const face = document.createElement("span");
    face.className = "rival-face";
    face.textContent = "×";
    const label = document.createElement("span");
    label.className = "rival-unit-label";
    const name = document.createElement("strong");
    name.textContent = marker.playerName;
    const rivalScore = document.createElement("small");
    rivalScore.textContent = `${marker.score.toLocaleString()} PTS`;
    label.append(name, rivalScore);
    unit.append(face, label);
    lane.append(unit);
  }
  return markers;
}

export function triggerOvertakeEffect(overtaken, { root = document, durationMs = 1_050 } = {}) {
  const effect = root.querySelector("#overtake-effect");
  if (!effect || !Array.isArray(overtaken) || overtaken.length === 0) return false;
  const names = overtaken.map((entry) => entry.playerName);
  const nameNode = effect.querySelector("#overtake-player");
  if (nameNode) nameNode.textContent = names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}명`;
  if (effect._hideTimer) window.clearTimeout(effect._hideTimer);
  effect.hidden = false;
  effect.dataset.active = "false";
  requestAnimationFrame(() => { effect.dataset.active = "true"; });
  effect._hideTimer = window.setTimeout(() => {
    effect.dataset.active = "false";
    effect.hidden = true;
  }, durationMs);
  return true;
}

export function resetOvertakeEffect({ root = document } = {}) {
  const effect = root.querySelector("#overtake-effect");
  if (!effect) return;
  if (effect._hideTimer) window.clearTimeout(effect._hideTimer);
  effect._hideTimer = null;
  effect.dataset.active = "false";
  effect.hidden = true;
}
