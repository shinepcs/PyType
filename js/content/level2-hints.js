const HINTS_BY_SKILL = Object.freeze({
  print: "괄호 안의 값을 화면에 출력하는 함수를 떠올려 보세요.",
  variable: "위에서 값을 저장한 변수 이름을 그대로 사용하세요.",
  assignment: "오른쪽 값을 왼쪽 변수에 저장하는 한 글자 기호가 필요합니다.",
  number: "OUTPUT에서 코드에 적용된 계산을 거꾸로 해 보세요.",
  string: "출력될 글자를 Python 문자열 리터럴로 감싸세요.",
  boolean: "참과 거짓 중 OUTPUT과 같은 값을 대문자로 시작해 입력하세요.",
  arithmetic: "두 수를 계산해 OUTPUT을 만드는 산술 연산자를 찾으세요.",
  comparison: "비교 결과가 OUTPUT과 같아지는 비교 연산자를 찾으세요.",
  if: "조건이 참일 때 아래 코드를 실행하는 조건문 키워드입니다.",
  elif: "앞 조건 다음에 다른 조건을 이어 검사하는 키워드입니다.",
  else: "앞의 모든 조건이 거짓일 때 실행하는 마지막 분기입니다.",
  for: "목록의 값을 하나씩 꺼내 반복하는 키워드입니다.",
  range: "시작값부터 끝값 직전까지 연속된 정수를 만드는 함수입니다.",
  while: "조건이 참인 동안 코드를 반복하는 키워드입니다.",
  break: "현재 반복문을 즉시 끝내는 키워드입니다.",
  continue: "이번 반복만 건너뛰고 다음 값으로 넘어가는 키워드입니다.",
  list: "여러 값을 순서대로 담는 대괄호 형태를 완성하세요.",
  append: "리스트 맨 끝에 새 값을 하나 추가하는 메서드입니다.",
  pop: "리스트에서 값을 꺼내면서 제거하는 메서드입니다.",
  sort: "리스트 자체를 오름차순으로 정렬하는 메서드입니다.",
  reverse: "리스트의 현재 순서를 반대로 뒤집는 메서드입니다.",
  len: "문자열이나 리스트에 들어 있는 항목 수를 구하는 함수입니다.",
  sum: "숫자 모음의 모든 값을 더하는 함수입니다.",
  min: "여러 값 가운데 가장 작은 값을 고르는 함수입니다.",
  max: "여러 값 가운데 가장 큰 값을 고르는 함수입니다.",
  random: "지정한 두 정수를 포함한 범위에서 정수 하나를 뽑는 random 메서드입니다.",
  shuffle: "리스트의 순서를 무작위로 섞는 random 메서드입니다.",
});

export function getLevel2Hint(question) {
  if (!question || (question.level !== 2 && question.type !== "fill")) return "";
  return HINTS_BY_SKILL[question.skill]
    ?? "코드의 빈칸이 하는 일과 OUTPUT이 만들어지는 과정을 차례로 살펴보세요.";
}

const LEVEL2_OPTION_BANK = Object.freeze([
  "if", "elif", "else", "for", "while", "break", "continue",
  "range", "len", "sum", "min", "max", "append", "pop", "sort", "reverse",
  "print", "randint", "shuffle", "True", "False", "=", "<", "//",
  "8", "lives", "\"Python\"", "[4, 9, 16]",
]);

function answerKind(value) {
  if (/^\d+$/.test(value)) return "number";
  if (/^[\"\[].*/.test(value)) return "literal";
  if (/^[^A-Za-z가-힣0-9_]+$/.test(value)) return "operator";
  return "word";
}

function stableChoiceIndex(text) {
  return [...text].reduce((sum, character) => ((sum * 31) + character.codePointAt(0)) >>> 0, 7);
}

/** Returns four visible answer choices; learners type the content rather than its number. */
export function getLevel2Choices(question) {
  const answer = String(question?.answer ?? question?.acceptedAnswers?.[0] ?? "").trim();
  if (!answer) return [];
  const kind = answerKind(answer);
  const matching = LEVEL2_OPTION_BANK.filter((option) => option !== answer && answerKind(option) === kind);
  const pool = matching.length >= 3
    ? matching
    : LEVEL2_OPTION_BANK.filter((option) => option !== answer);
  const start = stableChoiceIndex(String(question?.id ?? answer)) % pool.length;
  const distractors = [];
  for (let offset = 0; distractors.length < 3 && offset < pool.length; offset += 1) {
    const option = pool[(start + offset) % pool.length];
    if (!distractors.includes(option)) distractors.push(option);
  }
  return [answer, ...distractors].sort((left, right) => (
    stableChoiceIndex(`${question?.id ?? ""}:${left}`) - stableChoiceIndex(`${question?.id ?? ""}:${right}`)
  ));
}
