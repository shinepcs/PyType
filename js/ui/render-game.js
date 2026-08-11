const byId = (id, root = document) => root.querySelector(`#${id}`);

function setText(node, value) {
  if (node) node.textContent = String(value ?? "");
}

function renderCodeWithBlank(node, code, isFill) {
  node.replaceChildren();
  const codeNode = document.createElement("code");
  if (!isFill || !code.includes("_____")) {
    codeNode.textContent = code;
  } else {
    const [before, after] = code.split("_____");
    codeNode.append(document.createTextNode(before));
    const blank = document.createElement("span");
    blank.className = "blank-token";
    blank.textContent = "_____";
    codeNode.append(blank, document.createTextNode(after));
  }
  node.append(codeNode);
}

export function renderQuestion(question, { root = document, timed = true } = {}) {
  const isFill = question.level === 2 || question.type === "fill";
  const codeCard = byId("question-code", root)?.closest(".code-card");
  if (codeCard) codeCard.hidden = !isFill;
  setText(byId("question-level", root), `LEVEL ${question.level}`);
  setText(byId("question-skill", root), String(question.skill).toUpperCase());
  setText(
    byId("question-target", root),
    isFill && timed ? "TIME PAUSED · +3 / -2" : isFill ? "TIME LIMIT OFF" : `TARGET ${question.targetSeconds}s`,
  );
  setText(
    byId("question-label", root),
    isFill ? "정답 힌트 없이 코드와 OUTPUT만 보고 빈칸의 답을 입력하세요." : "보이는 코드를 공백과 줄바꿈까지 그대로 입력하세요.",
  );
  renderCodeWithBlank(byId("question-code", root), question.code, isFill);

  const outputPanel = byId("output-panel", root);
  outputPanel.hidden = !isFill;
  if (isFill) {
    setText(byId("output-label", root), question.outputMode === "example" ? "OUTPUT (예시)" : "OUTPUT");
    setText(byId("question-output", root), question.output);
  }
  setText(
    byId("typing-help", root),
    isFill
      ? timed
        ? "시간 정지 · 정답 +3초 · 첫 오타 -2초 · Tab으로 입력 영역을 벗어날 수 있습니다."
        : "시간 제한 없음 · Tab으로 입력 영역을 벗어날 수 있습니다."
      : "붙여넣기는 사용할 수 없습니다. Tab은 공백 4칸, Shift+Tab은 이전 조작으로 이동합니다.",
  );
  return isFill ? question.answer : question.code;
}

export function renderTypingFeedback(expected, actual, { root = document, concealPending = false } = {}) {
  const node = byId("typing-feedback", root);
  node.replaceChildren();
  const max = concealPending ? actual.length : Math.max(expected.length, actual.length + 1);
  for (let index = 0; index < max; index += 1) {
    const span = document.createElement("span");
    const expectedCharacter = expected[index];
    const actualCharacter = actual[index];
    if (index < actual.length) {
      span.className = actualCharacter === expectedCharacter ? "correct" : "incorrect";
      span.textContent = actualCharacter === "\n" ? "↵\n" : actualCharacter;
    } else if (index === actual.length && index < expected.length) {
      span.className = "cursor";
      span.textContent = expectedCharacter === "\n" ? "↵\n" : expectedCharacter;
    } else if (expectedCharacter !== undefined) {
      span.className = "pending";
      span.textContent = expectedCharacter === "\n" ? "↵\n" : expectedCharacter;
    }
    node.append(span);
  }

  setText(byId("typing-progress", root), `${actual.length} / ${expected.length}`);
  const input = byId("typing-input", root);
  const hasMismatch = [...actual].some((character, index) => character !== expected[index]);
  input.setAttribute("aria-invalid", String(hasMismatch));
  return hasMismatch;
}

export function renderHud(state, { root = document, formatTime } = {}) {
  const untimed = state.remainingMs === null;
  const remainingMs = Math.max(0, state.remainingMs ?? 0);
  setText(byId("hud-time", root), untimed ? "∞" : formatTime ? formatTime(remainingMs) : String(Math.ceil(remainingMs / 1000)));
  setText(byId("hud-score", root), Number(state.rawScore ?? state.score ?? 0).toLocaleString());
  setText(byId("battle-player-score", root), `${Number(state.rawScore ?? state.score ?? 0).toLocaleString()} PTS`);
  setText(byId("hud-combo", root), state.combo ?? 0);
  setText(byId("hud-kps", root), Number(state.keystrokesPerSecond ?? 0).toFixed(2));
  const ordinal = state.problemOrdinal ?? ((state.solvedCount ?? 0) + 1);
  setText(byId("hud-problem", root), `${Math.min(Math.max(1, ordinal), state.maxProblems ?? 40)} / ${state.maxProblems ?? 40}`);
  const dangerPanel = root.querySelector(".danger-panel");
  if (dangerPanel) dangerPanel.hidden = state.dangerEnabled === false;
  const danger = Math.min(100, Math.max(0, Number(state.danger ?? 0)));
  setText(byId("danger-value", root), `${Math.round(danger)}%`);
  const track = root.querySelector(".danger-track");
  track?.setAttribute("aria-valuenow", String(Math.round(danger)));
  const fill = byId("danger-fill", root);
  if (fill) fill.style.width = `${danger}%`;
}

export function triggerAttack({ root = document, clean = true } = {}) {
  const lane = byId("battle-lane", root);
  if (!lane) return;
  lane.dataset.attack = "false";
  lane.dataset.hit = "false";
  requestAnimationFrame(() => {
    lane.dataset.attack = "true";
    lane.dataset.hit = clean ? "true" : "false";
    window.setTimeout(() => {
      lane.dataset.attack = "false";
      lane.dataset.hit = "false";
    }, 320);
  });
}
