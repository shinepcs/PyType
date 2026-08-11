export function renderQuestionSourceOptions(sources, sharedIds, { root = document } = {}) {
  const select = root.querySelector("#question-source");
  select.replaceChildren();
  const fresh = document.createElement("option");
  fresh.value = "";
  fresh.textContent = "+ 새 공유 문제 추가";
  select.append(fresh);
  for (const source of sources) {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = `${sharedIds.has(source.id) ? "공유 수정" : "기본"} · L${source.level} · ${source.skill} · ${source.id}`;
    select.append(option);
  }
}

export function fillQuestionForm(question, { root = document } = {}) {
  root.querySelector("#question-level-input").value = String(question?.level ?? 1);
  root.querySelector("#question-skill-input").value = question?.skill ?? "print";
  root.querySelector("#question-code-input").value = question?.code ?? "";
  root.querySelector("#question-answer-input").value = question?.level === 1 ? "" : question?.answer ?? "";
  root.querySelector("#question-output-input").value = question?.level === 1 ? "" : question?.output ?? "";
  root.querySelector("#question-target-input").value = String(question?.targetSeconds ?? 8);
}

export function updateQuestionFormLevel({ root = document } = {}) {
  const level = Number(root.querySelector("#question-level-input").value);
  const fields = root.querySelector("#level-two-fields");
  fields.hidden = level !== 2;
  for (const input of fields.querySelectorAll("input, textarea")) input.required = level === 2;
  root.querySelector("#question-code-help").textContent = level === 2
    ? "빈칸을 정확히 한 곳에 _____ 로 표시하세요."
    : "화면에 보이는 전체 코드가 정답으로 사용됩니다.";
}
