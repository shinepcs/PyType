# Python Typing Survival — 제품 요구사항 문서

| 항목 | 내용 |
|---|---|
| 문서 버전 | `1.0.0` |
| 제품 상태 | MVP 개발 기준선 |
| 플랫폼 | Web |
| 배포 | GitHub Pages |
| 기술 스택 | Vanilla HTML/CSS/JavaScript, Supabase PostgreSQL |
| 레퍼런스 | Lyphica: Typing Survival의 타이핑 생존 전투 감각 |
| 제품 문구 | 코드는 눈으로 배우는 게 아니다. 직접 쳐야 내 것이 된다. |

이 문서는 Codex가 추가 기획 결정 없이 MVP 구현을 시작할 수 있도록 제품 범위, 동작, 데이터, 보안, 배포 및 수용 기준을 고정한다.

---

## 1. 제품 정의

### 1.1 한 문장 정의

**Python Typing Survival**은 짧은 Python 코드를 빠르게 넘겨 보며 정확하게 반복 입력하고, 그 입력으로 적을 물리치는 웹 기반 타이핑 생존 학습 게임이다.

### 1.2 해결하려는 문제

Python 입문자는 문법을 읽고 이해해도 괄호, 따옴표, 콜론, 들여쓰기와 자주 쓰는 함수·구문을 직접 입력할 때 막히기 쉽다. 기존 강의, 객관식 문제, 알고리즘 문제는 이러한 손의 익숙함을 짧고 많이 훈련시키는 데 초점이 없다.

이 제품은 설명을 늘리는 대신 다음 행동을 반복시킨다.

```text
SEE CODE / OUTPUT
        ↓
TYPE PYTHON
        ↓
IMMEDIATE FEEDBACK
        ↓
ATTACK / SURVIVE
        ↓
REPEAT WEAK ITEMS
```

### 1.3 핵심 가치

우선순위는 다음과 같으며, 아래 항목일수록 상위 항목을 침해할 수 없다.

1. **짧고 많은 직접 입력**: 한 문제는 목표상 5~15초, 한 세션은 3~5분, 20~40문제다.
2. **정확도 우선**: 분당 타수보다 올바른 Python 입력과 오류 없는 연속 입력이 더 중요하다.
3. **즉시 반복**: 오답, 오타가 많았던 문제, 느린 문제를 같은 세션과 다음 세션에 다시 출제한다.
4. **전투는 학습을 돕는 피드백**: 연출이 입력을 가리거나 다음 문제를 늦추면 안 된다.
5. **설치 없는 접근**: GitHub Pages URL만으로 데스크톱과 모바일 브라우저에서 실행한다.

### 1.4 목표 사용자

- Python을 처음 배우며 기본 구문을 손에 익히려는 사용자
- 문법은 알지만 기호와 들여쓰기를 자주 틀리는 사용자
- 매일 3~5분의 짧은 훈련을 원하는 사용자
- 일반 영문 타자보다 실제 코드 입력을 연습하고 싶은 사용자

### 1.5 MVP 성공 정의

MVP는 다음 질문을 검증한다.

> 사용자가 Python 코드를 정확하게 반복 타이핑하는 행동 자체를 재미있게 느끼고, 한 판 더 플레이하는가?

제품 분석 도구는 MVP 필수가 아니다. 구현 가능한 로컬 통계로 다음 값을 확인할 수 있어야 한다.

- 완료한 세션 수와 재도전 수
- 세션당 해결 문제 수와 입력 문자 수
- 평균 정확도와 분당 타수
- 문제당 평균 소요시간
- 문법별 시도 수와 숙련도
- 오답·느린 문제의 재출제 후 개선 여부

---

## 2. 범위

### 2.1 MVP 필수 범위

- `Level 1`: 화면의 전체 Python 코드를 그대로 타이핑
- `Level 2`: 코드의 한 빈칸과 `OUTPUT`을 함께 보고 짧은 답 타이핑
- `Quick Play`, `Daily Training`, `Practice`
- 문제 템플릿과 결정적 문제 인스턴스 생성
- 실시간 문자 단위 판정과 명확한 오류 표시
- Survival 전투, 적 접근, 플레이어 위험도, 공격 피드백
- 정확도, 분당 타수, 모든 모드의 실시간 초당 타수, 콤보, 점수, 해결 문제 수, 생존 시간
- 문법별 숙련도
- 오답 및 느린 문제 재출제
- 닉네임
- 개인 설정·학습 데이터·최고 기록의 `localStorage` 저장
- Supabase PostgreSQL 온라인 랭킹 등록 및 조회
- `Global`, `Today`, `My Best` 랭킹
- 온라인 장애 시에도 가능한 오프라인 플레이
- 반응형 UI, 키보드만으로 플레이 가능한 기본 접근성
- GitHub Pages 배포

### 2.2 명시적 제외 범위

다음 기능은 MVP에 구현하지 않는다.

- `Level 3`, `Level 4` 또는 전체 프로그램 직접 작성
- 긴 알고리즘 문제, 코딩 테스트, 보스 코딩 문제
- 실제 Python 인터프리터 또는 브라우저 Python 런타임
- AI 문제 생성
- 이메일·비밀번호·소셜 로그인 UI
- 멀티플레이, 채팅, 친구, 길드
- 캐릭터 클래스, 장비, 아이템, 상점, 파밍, 스토리 등 복잡한 RPG
- 유료 결제, 광고, 분석 SDK
- 주간·월간·친구 랭킹
- 네이티브 모바일 앱
- 관리자 화면
- 완전한 서버 측 치팅 방지

레퍼런스의 에셋, 이름, UI 또는 표현을 복제하지 않는다. 참고 범위는 타이핑으로 적을 막는 짧은 생존 루프에 한정한다.

---

## 3. 게임 모드

### 3.1 Quick Play

온라인 랭킹에 등록되는 표준 모드다.

- 표준 제한시간: `240 seconds`
- 목표 세션 길이: `180~300 seconds`
- 최대 문제 수: `40`
- 권장 해결 문제 수: `20~40`
- `Level 1`과 `Level 2`를 현재 숙련도에 따라 혼합한다.
- 위험도가 `100`에 도달하거나 제한시간이 끝나면 종료한다.
- 제한시간 종료 시 현재 문제는 즉시 닫고 종료한다. 추가 점수는 주지 않는다.
- 동일한 `contentVersion`, 제한시간, 점수식을 사용하는 기록만 같은 랭킹에 표시한다.

### 3.2 Daily Training

매일 핵심 문법을 짧게 반복하는 비랭크 모드다.

- 로컬 날짜를 기준으로 하루의 `seed`를 만든다.
- 같은 날짜와 `contentVersion`에서는 같은 기본 문제 구성을 사용한다.
- 기본 구성은 `30 questions`이며 시간 제한은 없다.
- 최근 오답·느린 문제를 최대 10문제까지 끼워 넣을 수 있다.
- 결과와 개인 최고 기록은 로컬에 저장하지만 온라인 `Global`/`Today`에는 등록하지 않는다.

### 3.3 Practice

문법별 자유 연습을 위한 비랭크 모드다.

- 사용자가 `skill` 하나 이상을 고른다.
- 시간 제한과 게임오버 없이 문제 수를 기준으로 끝난다.
- 점수는 참고용으로 계산하되 온라인 랭킹에는 등록하지 않는다.
- 오답·느린 문제와 숙련도는 정상적으로 기록한다.

### 3.4 모드 공정성 원칙

MVP 온라인 랭킹은 `Quick Play`만 대상으로 한다. 적응형 출제 비중이 다른 `Daily Training`과 `Practice` 기록을 합쳐 비교하지 않는다.

---

## 4. 핵심 사용자 흐름

### 4.1 최초 방문

```text
Load app
  → Read local data
  → Ask for nickname
  → Show privacy hint
  → Save nickname locally
  → Home
```

- 닉네임은 2~12자다.
- 허용 문자는 한글 완성형, 영문, 숫자, 밑줄이다.
- 앞뒤 공백을 제거하며 빈 값, HTML, 제어 문자를 허용하지 않는다.
- 같은 닉네임을 여러 사용자가 쓸 수 있다.
- “실명이나 개인정보 대신 게임용 닉네임을 사용하세요.”를 표시한다.
- 닉네임은 설정에서 변경할 수 있으며 기존 로컬 학습 데이터는 유지한다.

### 4.2 Quick Play

```text
Home
  → Quick Play
  → 3-second ready state
  → Problem + enemy
  → Type
  → Immediate result and attack
  → Next problem within 700 ms
  → Game over / time over
  → Result
  → Submit ranking if eligible
  → Show rank / retry / home
```

온라인 제출 실패는 결과 화면을 막지 않는다. 로컬 결과를 먼저 저장하고 `Retry ranking`을 제공한다. 같은 `sessionId`의 중복 제출은 허용하지 않는다.

### 4.3 랭킹 보기

```text
Home or Result
  → Ranking
  → Global / Today / My Best
  → Loading / data / empty / error state
```

---

## 5. 학습 레벨

### 5.1 Level 1 — `copy`

목적은 Python 코드와 코딩 기호를 눈과 손에 연결하는 것이다.

```python
for i in range(3):
    print(i)
```

사용자는 위 코드를 정확히 그대로 입력한다.

규칙:

- 대상은 1~3줄, 권장 `8~60`자, 최대 `100`자다.
- 들여쓰기는 공백 4개로 표시·입력한다.
- 줄바꿈은 내부적으로 `\n`으로 정규화한다.
- 대소문자, 따옴표 종류, 공백, 괄호, 콜론, 줄바꿈을 모두 판정한다.
- 탭 입력은 공백 4개로 변환할 수 있으나 저장된 정답은 공백 4개다.
- 전체 정답과 일치하면 자동 제출한다.

### 5.2 Level 2 — `fill`

목적은 코드와 실행 결과의 관계를 짧게 생각한 뒤 핵심 식별자 또는 표현을 입력하는 것이다.

```python
for i in _____(1, 5):
    print(i)
```

```text
OUTPUT
1
2
3
4
```

정답은 `range`다.

규칙:

- 빈칸은 정확히 하나다.
- `code`와 `output`을 동시에, 입력 중에도 계속 표시한다.
- 정답은 권장 `3~20`자, 최대 `30`자다.
- 정답이 여러 표현을 허용할 때만 `acceptedAnswers`를 사용한다.
- 기본 판정은 대소문자와 공백을 포함한 정확 일치다.
- 답안을 입력한 뒤 `Enter`로 제출하며, 정답·오답 판정을 표시한 다음 아무 키나 누르면 다음 문제로 넘어간다.
- `OUTPUT`은 문제 인스턴스에 저장된 검증된 결과이며 브라우저에서 Python을 실행해 만들지 않는다.
- `random.shuffle()`처럼 결과가 비결정적인 구문은 `OUTPUT (예시)`로 표시하고, 사전 검증한 가능한 결과를 사용한다.
- 출력만으로 답을 유일하게 결정하기 어렵다면 코드 문맥을 함께 제공해 정답이 하나가 되게 한다.

예시:

```python
import random

numbers = [1, 2, 3, 4]
random._____(numbers)
print(numbers)
```

```text
OUTPUT (예시)
[3, 1, 4, 2]
```

정답은 `shuffle`이다. 이 문제를 `range` 문제로 재사용하면 안 된다.

### 5.3 레벨 전환

- 신규 `skill`은 `Level 1`에서 시작한다.
- 해당 `skill`의 최근 10회 정확도가 `90%` 이상이고 첫 시도 정답률이 `70%` 이상이면 `Level 2` 비중을 늘린다.
- `Quick Play`의 전체 문제 중 `Level 2`는 최소 20%, 최대 60%다.
- 사용자가 반복해서 실패하면 `Level 1` 비중을 다시 늘린다.
- 레벨은 난이도 확장이 아니라 “전체 보기”와 “빈칸+결과 보기”의 두 표현 방식만 의미한다.

---

## 6. 초기 학습 콘텐츠

MVP는 다음 `skill`을 포함한다.

| Category | `skill` 예 | 주요 입력 |
|---|---|---|
| Output | `print` | `print()`, 따옴표, 쉼표 |
| Variables | `variable`, `assignment` | `name = value` |
| Values | `number`, `string`, `boolean` | 정수, 문자열, `True`, `False` |
| Operators | `arithmetic`, `comparison` | `+`, `-`, `*`, `/`, `//`, `%`, `==`, `>=` |
| Conditions | `if`, `elif`, `else` | 콜론과 들여쓰기 |
| Loops | `for`, `range`, `while` | 반복 구문 |
| Flow | `break`, `continue` | 흐름 제어 |
| Collections | `list`, `append`, `pop`, `sort`, `reverse` | 리스트 기본 조작 |
| Built-ins | `len`, `sum`, `min`, `max` | 자주 쓰는 함수 |
| Modules | `random`, `shuffle` | 짧은 모듈 사용 예 |

초기 배포에는 다음을 만족하는 최소 `120`개의 검증된 문제 인스턴스 또는 동등한 템플릿 변형을 제공한다.

- 각 필수 `skill`당 최소 6문제
- `Level 1` 최소 50문제
- `Level 2` 최소 50문제
- 콜론, 괄호, 따옴표, 들여쓰기 연습을 각각 포함
- 모든 `Level 2`에 `output` 포함
- 서로 다른 정답인데 코드와 출력이 사실상 동일한 모호한 문제 없음

---

## 7. 문제 데이터와 템플릿

### 7.1 설계 원칙

- 콘텐츠 데이터와 게임 로직을 분리한다.
- JSON에 실행 가능한 JavaScript를 넣지 않는다.
- 템플릿은 `generatorId`로 코드의 등록된 생성 함수를 참조한다.
- 생성 함수는 같은 `seed`에서 같은 문제를 반환해야 한다.
- 플레이 중에는 생성된 문제 인스턴스를 변경하지 않는다.
- 정답과 출력은 콘텐츠 검증 단계에서 확인한다.

### 7.2 정적 문제 스키마

```json
{
  "id": "range.fill.001",
  "contentVersion": "1.0.0",
  "level": 2,
  "type": "fill",
  "skill": "range",
  "difficulty": 1,
  "code": "for i in _____(1, 5):\n    print(i)",
  "output": "1\n2\n3\n4",
  "outputMode": "exact",
  "answer": "range",
  "acceptedAnswers": ["range"],
  "targetSeconds": 8,
  "tags": ["loop", "builtin"],
  "enabled": true
}
```

`Level 1` 예:

```json
{
  "id": "print.copy.001",
  "contentVersion": "1.0.0",
  "level": 1,
  "type": "copy",
  "skill": "print",
  "difficulty": 1,
  "code": "print(\"Hello\")",
  "output": "Hello",
  "outputMode": "exact",
  "answer": "print(\"Hello\")",
  "acceptedAnswers": ["print(\"Hello\")"],
  "targetSeconds": 7,
  "tags": ["output", "string"],
  "enabled": true
}
```

### 7.3 템플릿 스키마

```json
{
  "id": "range.fill.template.001",
  "contentVersion": "1.0.0",
  "level": 2,
  "type": "fill",
  "skill": "range",
  "difficulty": 1,
  "generatorId": "rangeFillAscending",
  "parameters": {
    "startMin": 0,
    "startMax": 5,
    "lengthMin": 3,
    "lengthMax": 6
  },
  "targetSeconds": 8,
  "tags": ["loop", "builtin"],
  "enabled": true
}
```

생성 결과는 최소 다음 런타임 스키마를 만족한다.

```js
{
  instanceId,
  sourceId,
  seed,
  contentVersion,
  level,
  type,
  skill,
  difficulty,
  code,
  output,
  outputMode,
  answer,
  acceptedAnswers,
  targetSeconds,
  tags
}
```

### 7.4 콘텐츠 검증

자동 검증기는 다음을 실패로 처리한다.

- 중복 `id`
- 알 수 없는 `skill`, `type`, `generatorId`
- 범위를 벗어난 `level`, `difficulty`, `targetSeconds`
- `fill`인데 `_____`가 정확히 한 번 존재하지 않음
- `fill`인데 `output` 또는 `answer`가 없음
- `copy`의 `answer`와 `code`가 다름
- 빈 `acceptedAnswers` 또는 기본 `answer`가 배열에 없음
- 탭, `\r`, 후행 공백 등 의도하지 않은 포맷
- `outputMode`가 `exact` 또는 `example`이 아님
- 생성기를 여러 seed로 실행했을 때 비결정적 결과 또는 잘못된 스키마

---

## 8. 타이핑 판정과 지표

### 8.1 입력 판정

- 현재 입력 위치의 기대 문자와 새 문자를 즉시 비교한다.
- 올바른 문자는 정상 색, 잘못된 문자는 오류 색과 밑줄로 표시한다.
- 오류 색만으로 상태를 전달하지 않고 짧은 시각 표시를 함께 쓴다.
- 잘못 입력한 문자는 입력창에 남겨 사용자가 `Backspace`로 수정할 수 있게 한다.
- `paste`, `drop`, 자동완성, 드래그 입력으로 정답을 주입하는 행위는 플레이 영역에서 차단한다.
- 브라우저 단축키, 화면 읽기, 닉네임 IME 입력까지 전역으로 차단하지 않는다.
- 문제를 건너뛰는 기능은 `Practice`에만 제공하며 해당 문제는 오답으로 기록한다.

### 8.2 정확도

게임 입력에 해당하는 인쇄 문자, 공백, 줄바꿈을 `keystroke attempt`로 센다. `Backspace`, 방향키, 기능키는 분모에서 제외한다.

```text
accuracy = correctKeystrokes / totalKeystrokes * 100
```

- 기대 위치와 일치한 시도만 `correctKeystrokes`다.
- 오타 후 지우고 고쳐도 최초 오타는 정확도 손실로 남는다.
- `totalKeystrokes = 0`이면 정확도는 `0`이다.
- 화면과 저장값은 소수점 둘째 자리까지 유지하고 UI에는 한 자리로 표시할 수 있다.

### 8.3 분당 타수(타/분)

```text
cpm = correctKeystrokes / activeTypingMinutes
```

- `activeTypingTime`은 각 문제의 첫 입력부터 정답 완료까지의 합이다.
- 준비 화면, 결과 화면, 문제 사이 전환시간은 제외한다.
- 한 문제에서 3초 넘게 입력이 없으면 그 이후 정지 구간은 분당 타수 시간에서 제외할 수 없으며 계속 포함한다. 임의로 분당 타수를 부풀리는 휴지 제외 로직을 만들지 않는다.
- `activeTypingTime = 0`이면 분당 타수는 `0`이다.

### 8.4 첫 시도 정답과 깨끗한 해결

- 문제 중 잘못된 키 입력이 한 번도 없으면 `cleanSolve = true`다.
- `cleanSolve`일 때만 콤보가 1 증가한다.
- 첫 오타가 발생하는 즉시 현재 콤보를 0으로 만들고, 해당 문제를 고쳐 완료해도 콤보는 증가하지 않는다.

---

## 9. 점수 정책

점수식은 클라이언트와 테스트에 하나의 순수 함수로 구현한다. 같은 입력이면 항상 같은 정수 점수가 나와야 한다.

### 9.1 문제 점수

```text
targetLength = answer.length
lengthPoints = min(targetLength, 40) * 2
basePoints = 80 + lengthPoints
levelMultiplier = Level 1 ? 1.00 : 1.15
speedRatio = clamp((targetSeconds - elapsedSeconds) / targetSeconds, 0, 1)
speedBonus = basePoints * 0.25 * speedRatio
comboMultiplier = 1 + min(floor(comboAfterSolve / 5) * 0.05, 0.50)

problemScore = round(
  (basePoints * levelMultiplier + speedBonus) * comboMultiplier
)
```

- `elapsedSeconds`는 문제 표시부터 완료까지다.
- 속도 보너스는 전체 문제 점수의 일부일 뿐이며 정확도 손실을 상쇄하지 못한다.
- 오답 후 수정해 완료한 문제도 기본 점수는 받지만 콤보 보너스를 잃는다.

### 9.2 세션 정확도 배율

세션 종료 시 누적 문제 점수에 정확도 배율을 한 번 적용한다.

| Session accuracy | `accuracyMultiplier` |
|---:|---:|
| `>= 98%` | `1.25` |
| `>= 95%` | `1.15` |
| `>= 90%` | `1.00` |
| `>= 80%` | `0.80` |
| `< 80%` | `0.50` |

```text
finalScore = round(sum(problemScore) * accuracyMultiplier)
```

이 배율 때문에 빠르지만 부정확한 입력보다 조금 느려도 정확한 입력이 우선된다.

### 9.3 점수 표시

결과 화면은 최소 다음 값을 보여준다.

- `Score`
- `Accuracy`
- `분당 타수(타/분)`
- `Problems Solved`
- `Best Combo`
- `Survival Time`
- `Correct Keystrokes`
- `Weak Skills` 최대 3개
- 개인 최고 기록 갱신 여부
- 온라인 제출 상태와 현재 순위

---

## 10. Survival 전투

### 10.1 상태 모델

MVP는 복잡한 물리 엔진 없이 결정적인 상태 기반 전투를 사용한다.

- `danger`: `0~100`
- 시작값: `20`
- 문제 표시 중 시간이 흐르면 `danger`가 증가한다.
- 기본 증가율: 초당 `2.0`
- 해당 문제의 `targetSeconds`를 넘으면 초당 `3.0`으로 증가한다.
- 잘못된 키 입력 1회당 `danger +1`, 문제당 최대 `+5`
- 문제 해결 시 `danger -15`
- `cleanSolve`이면 추가 `danger -3`
- 모든 값은 `0~100`으로 제한한다.
- `danger = 100`이면 게임오버다.

콘텐츠 테스트 결과 세션이 지나치게 쉽거나 어렵다면 상수만 조정하되 정확도 우선 원칙과 3~5분 목표는 유지한다.

### 10.2 전투 표현

- `danger`에 따라 가장 가까운 적이 플레이어 쪽으로 이동한다.
- 문제 해결 시 가장 가까운 적을 공격하거나 처치한다.
- 콤보 구간 `5`, `10`, `20`에서 공격 효과를 강화하되 입력 영역을 가리지 않는다.
- 오타 시 `SyntaxError` 같은 짧은 피드백을 사용할 수 있으나 실제 Python 오류로 오인하게 만드는 잘못된 메시지는 쓰지 않는다.
- 정답 후 다음 문제는 `700 ms` 이내 표시한다.
- 긴 처치 애니메이션, 화면 흔들림, 입력 잠금은 금지한다.
- `prefers-reduced-motion`에서는 이동과 섬광을 줄이거나 제거한다.

### 10.3 일시정지와 포커스

- 사용자가 명시적으로 `Pause`를 누르면 타이머와 위험도 증가를 멈춘다.
- 랭크 모드의 일시정지는 세션당 최대 1회, 최대 30초다.
- 브라우저 탭이 숨겨지면 자동 일시정지하고 복귀 안내를 보여준다.
- 자동 일시정지 구간은 점수와 분당 타수 시간에서 제외한다.
- 랭크 모드에서 수동·자동 일시정지 누적이 30초를 넘으면 플레이는 계속할 수 있지만 `rankEligible = false`로 바꾸고 온라인 제출을 하지 않는다.

---

## 11. 재출제와 숙련도

### 11.1 문제 결과 분류

문제 완료 시 다음을 저장한다.

```js
{
  questionId,
  skill,
  level,
  elapsedMs,
  targetMs,
  correctKeystrokes,
  totalKeystrokes,
  errorCount,
  cleanSolve,
  slow: elapsedMs > targetMs,
  completedAt
}
```

### 11.2 같은 세션 재출제

- `errorCount > 0` 또는 `slow = true`이면 재출제 후보가 된다.
- 후보는 원문 그대로 또는 같은 `skill`의 동등한 변형으로 `3~7`문제 뒤 한 번 재출제한다.
- 같은 문제를 연속으로 출제하지 않는다.
- 한 원본 문제는 한 세션에서 최대 2회까지만 재출제한다.
- 재출제 문제도 전체 40문제 제한에 포함한다.
- 오류 문제 가중치 `+3`, 느린 문제 가중치 `+2`, 오래 보지 않은 문제 가중치 `+1`을 기본 선택 가중치에 더한다.

### 11.3 다음 세션 복습

- 오류 문제: 다음 세션 우선 출제
- 느린 문제: 1일 이내 다시 출제
- 정확하고 빠른 문제: 3일, 7일, 14일 순으로 복습 간격 확대
- 사용자의 기기 시간이 비정상이어도 데이터가 깨지지 않도록 음수 간격을 0으로 보정한다.

### 11.4 문법별 숙련도

각 `skill`에 다음 값을 저장한다.

```js
{
  attempts,
  cleanSolves,
  correctKeystrokes,
  totalKeystrokes,
  averageElapsedMs,
  recentResults,
  lastSeenAt,
  dueAt,
  mastery
}
```

최근 최대 20회로 다음 값을 계산한다.

```text
accuracyScore = correctKeystrokes / totalKeystrokes
cleanScore = cleanSolves / attempts
speedScore = average(clamp(targetMs / elapsedMs, 0, 1))
mastery = round(100 * (0.60 * accuracyScore + 0.25 * cleanScore + 0.15 * speedScore))
```

숙련도는 학습 피드백과 출제 가중치에만 쓰며 온라인 랭킹에는 저장하지 않는다.

---

## 12. UX 및 화면 요구사항

### 12.1 화면 목록

1. `Nickname Dialog`
2. `Home`
3. `Mode Setup`
4. `Game`
5. `Pause`
6. `Result`
7. `Ranking`
8. `Practice Skill Select`
9. `Progress`
10. `Settings`

SPA 라우터는 필수가 아니다. 한 문서 안에서 화면 상태를 전환해 GitHub Pages 새로고침 404를 피한다.

### 12.2 Home

최소 항목:

```text
PYTHON TYPING SURVIVAL

[ QUICK PLAY ]
[ DAILY TRAINING ]
[ PRACTICE ]
[ RANKING ]
[ PROGRESS ]

PLAYER: nickname
```

### 12.3 Game HUD

- 남은 시간
- `danger` 또는 HP에 해당하는 생존 표시
- 현재 점수
- 콤보
- 문제 번호
- `Level`, `skill`
- 코드 영역
- `OUTPUT` 영역 (`Level 2` 필수)
- 입력 영역과 실시간 문자 피드백
- 일시정지 버튼

입력 영역은 가장 높은 시각적 우선순위를 가지며 적과 효과가 코드를 가리면 안 된다.

### 12.4 Result

- 9.3절의 지표
- `New Personal Best` 표시
- 같은 모드의 직전 완료 기록과 최근 5회 평균을 기준으로 `Score`, `Accuracy`, `분당 타수`, 해결 문제 수, 문제당 평균 소요시간의 변화량 표시
- `Practice`, `Sample Logic`, `Beginner Guide` 및 서로 다른 Practice 문법 선택은 별도 비교 그룹으로 유지
- 비교할 이전 기록이 없으면 첫 기록임을 안내하고 다음 완료부터 변화량 표시
- 온라인 제출 중, 성공, 실패, 재시도 상태
- `Global Rank` 또는 `Unranked`
- `Play Again`, `Ranking`, `Home`

### 12.5 Ranking

탭:

- `Global`: 전체 기간의 사용자별 최고 Quick Play 기록
- `Today`: UTC 날짜 기준 당일 사용자별 최고 Quick Play 기록
- `My Best`: 현재 익명 Supabase 사용자와 로컬 브라우저의 최고 기록

표시 열:

```text
Rank | Player | Score | Accuracy | 분당 타수 | Problems | Date
```

상위 100개와 현재 사용자의 위치를 표시한다. 닉네임은 항상 텍스트로 렌더링하며 HTML로 삽입하지 않는다.

### 12.6 반응형·접근성

- 최소 지원 폭: `360px`
- 데스크톱에서는 코드와 전투를 함께, 좁은 화면에서는 전투를 축소해 입력을 우선한다.
- 키보드만으로 시작, 입력, 일시정지, 재시작, 홈 이동이 가능해야 한다.
- 포커스 표시를 제거하지 않는다.
- 버튼과 탭에 의미 있는 접근성 이름을 제공한다.
- 상태 변화는 필요한 경우 `aria-live`로 알리되 매 키 입력을 과도하게 읽지 않는다.
- 색상만으로 정오를 구분하지 않는다.
- 코드 글꼴은 가독성 높은 고정폭 글꼴과 시스템 폴백을 쓴다.
- 오디오가 추가되더라도 기본 음소거 선택과 볼륨 설정을 제공한다.

---

## 13. 로컬 데이터

### 13.1 저장 키

하나의 버전된 루트 키를 사용한다.

```text
pythonTypingSurvival:v1
```

예시:

```json
{
  "schemaVersion": 3,
  "profile": {
    "nickname": "PythonKing",
    "createdAt": "2026-08-11T00:00:00.000Z"
  },
  "settings": {
    "sound": false,
    "reducedMotion": false,
    "fontScale": 1
  },
  "progress": {
    "skills": {}
  },
  "history": [],
  "speedHistory": [],
  "personalBest": {
    "quick": null,
    "daily": null
  },
  "pendingRankingSubmissions": []
}
```

### 13.2 저장 정책

- 세션 결과는 최근 100개만 유지한다.
- 분당 타수 추세용 경량 기록은 완료한 세션 기준 최근 2,000개를 유지한다.
- 문제별 최근 결과는 `skill`당 20개까지만 유지한다.
- 저장 전 스키마를 검증한다.
- 손상된 JSON은 앱을 중단시키지 말고 별도 백업 문자열로 보존한 뒤 기본값으로 복구한다.
- 새 `schemaVersion`에는 명시적 마이그레이션 함수를 둔다.
- 저장 용량 초과 시 상세 히스토리를 먼저 제거하고, 그 다음 오래된 분당 타수 기록을 제거하며 프로필·설정·숙련도는 보존한다.
- 사용자에게 로컬 데이터 초기화 기능을 제공한다.

### 13.3 개인정보 최소화

로컬과 온라인 어디에도 실명, 이메일, 전화번호, 주소, 생년월일을 요구하거나 저장하지 않는다. 온라인에는 공개 닉네임과 랭킹에 필요한 최소 게임 기록만 전송한다.

---

## 14. 온라인 랭킹 정책

### 14.1 사용자 식별

- 회원가입 UI 없이 Supabase Anonymous Sign-In을 백그라운드에서 사용한다.
- 생성된 `auth.uid()`는 브라우저 설치 단위의 랭킹 소유자를 구분한다.
- 인증 실패 시 게임은 계속되지만 온라인 등록과 `My Best` 원격 조회는 비활성화한다.
- 브라우저 데이터 삭제 또는 다른 브라우저 사용 시 익명 ID를 복구할 수 없음을 안내한다.
- 닉네임은 고유 식별자가 아니며 중복을 허용한다.

### 14.2 저장 단위

완료한 랭크 대상 Quick Play 한 판을 하나의 `ranking_entries` 행으로 저장한다. 개인 학습 기록, 오답, 숙련도는 전송하지 않는다.

### 14.3 정렬과 동점

`Global`과 `Today`는 각 `user_id`의 최고 기록 한 개만 대표로 사용한다.

정렬 우선순위:

1. `score DESC`
2. `accuracy DESC`
3. `problems_solved DESC`
4. `best_combo DESC`
5. `cpm DESC`
6. `created_at ASC`

`Today`는 서버의 UTC 날짜 `00:00:00~23:59:59.999`에 생성된 기록만 사용한다. UI에 `Today 기준: UTC`를 표시한다.

### 14.4 등록 자격

다음을 모두 만족해야 온라인 등록을 시도한다.

- `gameMode = quick`
- 정상 종료 또는 게임오버
- `rankEligible = true`
- `contentVersion`과 `clientVersion` 존재
- 해결 문제 `1~40`
- 생존 시간 `10,000~300,000 ms`
- 정확도 `0~100`
- 분당 타수 `0~1250`
- 최고 콤보 `0~40`
- 점수 `0~10,000,000`
- 로컬 점수 재계산 결과와 제출 점수가 일치

클라이언트 검사는 보안 경계가 아니다. DB 제약과 RLS를 반드시 함께 적용한다.

### 14.5 중복 제출

- 각 세션은 `crypto.randomUUID()`로 `sessionId`를 만든다.
- `(user_id, session_id)`에 고유 제약을 둔다.
- 네트워크 재시도는 같은 `sessionId`를 사용한다.
- 중복 오류는 기존 제출 성공으로 취급하고 결과를 다시 조회한다.

### 14.6 치팅 한계

GitHub Pages의 클라이언트가 점수를 계산하므로 MVP에서 완전한 치팅 방지는 불가능하다. RLS와 `CHECK` 제약은 다른 사용자의 기록 변경과 명백한 범위 오류를 막지만, 조작된 정상 범위 점수까지 증명하지 못한다.

경쟁성이 커지면 다음 단계로 전환한다.

```text
GitHub Pages
  → Supabase Edge Function
  → rate limit + session proof + score validation
  → PostgreSQL
```

해당 전환 전에는 랭킹을 교육용·친선 경쟁으로 안내한다.

---

## 15. Supabase PostgreSQL 요구사항

### 15.1 테이블

`supabase/schema.sql`에 재실행 가능한 형태로 다음과 동등한 스키마를 제공한다.

```sql
create table if not exists public.ranking_entries (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  player_name text not null,
  score integer not null,
  accuracy numeric(5, 2) not null,
  cpm numeric(7, 2) not null,
  problems_solved smallint not null,
  best_combo smallint not null,
  survival_ms integer not null,
  game_mode text not null,
  content_version text not null,
  client_version text not null,
  created_at timestamptz not null default now(),

  constraint ranking_entries_user_session_key unique (user_id, session_id),
  constraint ranking_entries_player_name_check
    check (player_name ~ '^[가-힣A-Za-z0-9_]{2,12}$'),
  constraint ranking_entries_score_check check (score between 0 and 10000000),
  constraint ranking_entries_accuracy_check check (accuracy between 0 and 100),
  constraint ranking_entries_cpm_check check (cpm between 0 and 1250),
  constraint ranking_entries_problems_check check (problems_solved between 1 and 40),
  constraint ranking_entries_combo_check check (best_combo between 0 and 40),
  constraint ranking_entries_survival_check check (survival_ms between 10000 and 300000),
  constraint ranking_entries_mode_check check (game_mode = 'quick'),
  constraint ranking_entries_content_version_check
    check (char_length(content_version) between 1 and 20),
  constraint ranking_entries_client_version_check
    check (char_length(client_version) between 1 and 20)
);

create index if not exists ranking_entries_global_idx
  on public.ranking_entries
  (content_version, game_mode, score desc, accuracy desc, created_at asc);

create index if not exists ranking_entries_user_idx
  on public.ranking_entries (user_id, score desc);

create index if not exists ranking_entries_today_idx
  on public.ranking_entries (created_at desc);
```

정규식 지원과 Unicode 처리 차이를 실제 Supabase 프로젝트에서 검증한다. 제약이 대상 PostgreSQL 환경에서 기대대로 동작하지 않으면 동등한 검증 함수로 대체한다.

### 15.2 RLS

```sql
alter table public.ranking_entries enable row level security;

create policy "Leaderboard is readable"
on public.ranking_entries
for select
to anon, authenticated
using (true);

create policy "Authenticated anonymous users insert own runs"
on public.ranking_entries
for insert
to authenticated
with check ((select auth.uid()) = user_id);
```

필수 규칙:

- `UPDATE`, `DELETE` 정책을 만들지 않는다.
- 클라이언트가 `created_at`을 신뢰값으로 보내지 않으며 서버 기본값을 쓴다.
- `user_id`는 현재 `auth.uid()`만 허용한다.
- RLS를 활성화한 뒤 실제 `anon`, 익명 `authenticated`, 타 사용자 컨텍스트에서 정책을 검증한다.
- 테이블 권한은 필요한 `SELECT`, `INSERT`만 부여한다.
- 상위 100개 조회와 사용자별 최고 기록 집계는 서버 측 SQL 함수 또는 뷰로 구현한다. 제한된 원시 행을 먼저 가져와 클라이언트에서 사용자별로 합치는 방식은 중복 기록 때문에 실제 상위 100명을 누락할 수 있으므로 금지한다.
- 공개 응답에는 `user_id`, `session_id`를 UI 데이터로 노출하지 않는다. 강화 단계에서는 제한된 반환형의 RPC 또는 공개 뷰로 원본 식별자 접근도 제거한다.

### 15.3 조회 계약

클라이언트가 사용하는 서비스 함수:

```js
submitRanking(result)
getGlobalRanking({ limit: 100, contentVersion })
getTodayRanking({ limit: 100, contentVersion })
getMyBest({ contentVersion })
getMyRank({ sessionId, contentVersion })
```

- 모든 조회는 `game_mode = 'quick'`과 현재 `contentVersion`을 필터링한다.
- 원시 오류 객체나 키를 UI에 출력하지 않는다.
- 요청은 타임아웃되고 재시도 횟수가 제한되어야 한다.
- 빈 결과, 느린 네트워크, 오프라인, 권한 오류를 각각 처리한다.

### 15.4 보안 키

- 브라우저에는 Supabase Project URL과 `publishable key`만 사용한다.
- 구형 프로젝트의 `anon key`는 publishable key와 같은 공개 클라이언트 키로 취급하되 RLS와 최소 권한을 반드시 적용한다.
- `secret key`, `service_role key`, DB 비밀번호, 개인 액세스 토큰은 저장소·브라우저·GitHub Pages·클라이언트 로그에 절대 포함하지 않는다.
- `.env`는 GitHub Pages 런타임 비밀 저장소가 아니다. 정적 빌드에 주입된 값은 공개된다고 가정한다.
- 키가 없거나 Supabase가 비활성화된 개발 환경에서는 랭킹만 비활성화하고 게임은 실행한다.

---

## 16. 기술 아키텍처

### 16.1 원칙

- 런타임은 Vanilla HTML/CSS/JavaScript ES Modules를 우선한다.
- 프레임워크와 번들러는 MVP에 필요하지 않다.
- DOM, 게임 규칙, 저장소, 네트워크, 콘텐츠를 분리한다.
- 점수, 판정, 재출제, 전투는 DOM에 의존하지 않는 순수 로직으로 만든다.
- 전역 변경 가능 상태를 만들지 않고 단일 `GameState`와 명시적 이벤트를 사용한다.
- 네트워크가 게임 루프를 막지 않게 한다.

### 16.2 상태 흐름

```text
QuestionRepository → SessionQueue → TypingEngine
                            ↓             ↓
                       GameState ← result event
                          ↓   ↓
                   Survival  Scoring
                          ↓   ↓
                       UI Renderer

GameState → LocalStorageRepository
Result    → RankingService → Supabase
```

### 16.3 오류 처리

- 콘텐츠 로드 실패: 사용자에게 재시도 가능한 오류 화면
- 일부 잘못된 문제: 개발 환경에서는 실패, 운영에서는 문제를 제외하고 오류 기록
- `localStorage` 실패: 메모리 모드로 계속 플레이하고 저장 불가 안내
- Supabase 실패: 오프라인 플레이 유지, 랭킹 재시도 제공
- 예상하지 못한 오류: 입력 영역을 무한 잠금하지 말고 홈 복귀 수단 제공

---

## 17. 디렉터리 구조

```text
python-typing-survival/
├─ index.html
├─ 404.html
├─ .nojekyll
├─ README.md
├─ PRD.md
├─ AGENTS.md
├─ package.json
├─ assets/
│  ├─ icons/
│  └─ sounds/
├─ css/
│  ├─ tokens.css
│  ├─ base.css
│  ├─ layout.css
│  └─ components.css
├─ js/
│  ├─ app.js
│  ├─ config.example.js
│  ├─ core/
│  │  ├─ game-state.js
│  │  ├─ session.js
│  │  ├─ typing-engine.js
│  │  ├─ scoring.js
│  │  ├─ survival.js
│  │  ├─ mastery.js
│  │  └─ question-selector.js
│  ├─ content/
│  │  ├─ question-repository.js
│  │  ├─ generators.js
│  │  └─ validate-content.js
│  ├─ services/
│  │  ├─ storage.js
│  │  ├─ ranking.js
│  │  └─ supabase-client.js
│  ├─ ui/
│  │  ├─ router.js
│  │  ├─ render-game.js
│  │  ├─ render-results.js
│  │  ├─ render-ranking.js
│  │  └─ accessibility.js
│  └─ utils/
│     ├─ random.js
│     ├─ time.js
│     └─ validation.js
├─ data/
│  ├─ skills.json
│  ├─ questions.json
│  └─ question-templates.json
├─ supabase/
│  ├─ schema.sql
│  └─ README.md
├─ tests/
│  ├─ content.test.js
│  ├─ typing-engine.test.js
│  ├─ scoring.test.js
│  ├─ survival.test.js
│  ├─ mastery.test.js
│  ├─ question-selector.test.js
│  └─ storage.test.js
└─ .github/
   └─ workflows/
      └─ pages.yml
```

파일이 지나치게 잘게 나뉘면 인접 모듈을 합칠 수 있으나, 모든 로직을 `app.js` 하나에 넣는 것은 금지한다.

---

## 18. GitHub Pages 배포 요구사항

- 정적 파일만으로 실행한다.
- 프로젝트 사이트 경로 `https://<owner>.github.io/<repository>/`에서 동작해야 한다.
- CSS, JS, JSON, 이미지 URL은 저장소 하위 경로를 보존하는 `./` 기반 상대 경로를 사용한다. 도메인 루트를 가리키는 `/assets/...`를 사용하지 않는다.
- 브라우저에서 JSON을 가져오므로 로컬 검증도 `file://`이 아닌 HTTP 서버로 수행한다.
- 별도 SPA 경로에 의존하지 않으며 새로고침 시 404가 발생하지 않게 한다.
- `index.html`이 진입점이다.
- 배포 소스는 `main`의 정적 루트 또는 GitHub Actions 중 하나로 고정하고 README에 기록한다.
- Actions를 사용하면 테스트 성공 후 Pages artifact를 배포한다.
- HTTPS 페이지에서 혼합 콘텐츠 요청을 만들지 않는다.
- 배포 후 실제 공개 URL에서 앱, 콘텐츠 JSON, CSS/JS, Supabase 요청을 확인한다.
- 공개 저장소와 배포 artifact에 비밀값이 없는지 검사한다.

---

## 19. 비기능 요구사항

### 19.1 성능

- 일반적인 광대역 환경에서 초기 상호작용 가능 상태를 목표 `2.5 seconds` 이내로 한다.
- 첫 문제 전 필요한 콘텐츠만 로드하고 큰 미디어를 선행 로드하지 않는다.
- 매 키 입력마다 전체 화면 DOM을 다시 만들지 않는다.
- 애니메이션은 `transform`과 `opacity` 위주로 사용한다.
- 네트워크 랭킹 요청은 게임 프레임과 분리한다.

### 19.2 호환성

- 최신 안정 버전 Chrome, Edge, Firefox, Safari의 최근 2개 주요 버전을 목표로 한다.
- 데스크톱 키보드를 우선하되 모바일 가상 키보드에서도 플레이가 가능해야 한다.
- 지원하지 않는 API는 기능 감지 후 안전한 대체 동작을 제공한다.

### 19.3 보안

- 외부 입력을 `innerHTML`로 렌더링하지 않는다.
- 닉네임과 서버 응답은 `textContent` 또는 동등한 안전한 방법으로 렌더링한다.
- 동적 코드 실행을 위해 `eval`, `new Function`을 사용하지 않는다.
- 콘텐츠 JSON을 신뢰하지 않고 스키마 검증 후 사용한다.
- 종속성을 추가하면 필요성, 라이선스, 보안 영향을 검토한다.
- 브라우저 콘솔에 토큰, 전체 인증 세션, 민감한 응답을 기록하지 않는다.

---

## 20. 수용 기준

### 20.1 핵심 플레이

- [ ] 사용자는 설치 없이 GitHub Pages URL에서 앱을 연다.
- [ ] 최초 방문에서 유효한 닉네임을 저장하고 홈으로 이동한다.
- [ ] `Quick Play`가 3초 준비 후 시작한다.
- [ ] `Level 1`에서 다중 행 Python 코드를 공백·들여쓰기까지 판정한다.
- [ ] `Level 2`에서 코드, 빈칸, `OUTPUT`을 동시에 표시하고 짧은 답을 판정한다.
- [ ] 잘못된 키가 즉시 보이고 수정 후 계속할 수 있다.
- [ ] 정답 후 700ms 이내 다음 문제로 이동한다.
- [ ] 일반적인 플레이에서 3~5분, 20~40문제로 한 판이 구성된다.
- [ ] 위험도 100 또는 제한시간 종료 시 결과 화면으로 이동한다.

### 20.2 점수와 학습

- [ ] 정확도, 분당 타수, 콤보, 점수 공식이 문서와 일치한다.
- [ ] 98% 정확도 기록이 같은 원점수의 90% 기록보다 높은 최종 점수를 얻는다.
- [ ] 오타가 발생하면 즉시 콤보가 끊긴다.
- [ ] 오답 또는 느린 문제가 3~7문제 뒤 재출제되며 연속 중복은 없다.
- [ ] 문법별 숙련도가 최근 결과에 따라 갱신된다.
- [ ] 새로고침 후 닉네임, 설정, 숙련도, 개인 최고 기록이 유지된다.
- [ ] 손상된 로컬 데이터가 앱 전체를 중단시키지 않는다.

### 20.3 콘텐츠

- [ ] 최소 120개의 검증된 문제/변형이 있다.
- [ ] 모든 `Level 2` 문제에 코드와 출력이 있다.
- [ ] 비결정적 출력은 `OUTPUT (예시)`로 구분한다.
- [ ] 같은 seed의 템플릿 생성 결과가 반복 실행에서 같다.
- [ ] 콘텐츠 검증기가 잘못된 스키마와 모호한 필수 필드를 차단한다.

### 20.4 랭킹

- [ ] `Quick Play` 결과만 온라인 랭킹에 제출된다.
- [ ] Global, Today(UTC), My Best가 로딩·빈 상태·오류 상태를 처리한다.
- [ ] Global과 Today는 사용자별 최고 기록 하나만 대표로 표시한다.
- [ ] 동점 정렬이 14.3절과 일치한다.
- [ ] 같은 `sessionId` 재시도가 중복 행을 만들지 않는다.
- [ ] 다른 익명 사용자의 기록을 수정하거나 삭제할 수 없다.
- [ ] 범위를 벗어난 기록을 DB 제약이 거부한다.
- [ ] Supabase가 중단되어도 Practice, Daily, Quick Play와 로컬 저장이 동작한다.

### 20.5 UX·배포·보안

- [ ] 360px 화면에서 코드와 입력이 가려지지 않는다.
- [ ] 키보드만으로 핵심 흐름을 완료할 수 있다.
- [ ] `prefers-reduced-motion`에서 불필요한 움직임이 줄어든다.
- [ ] 프로젝트 하위 경로 GitHub Pages에서 모든 asset과 JSON이 정상 로드된다.
- [ ] 실제 공개 URL에서 한 세션과 랭킹 조회/등록을 검증한다.
- [ ] 저장소, 배포 파일, 브라우저에 `service_role` 또는 secret key가 없다.
- [ ] 닉네임 `<img src=x onerror=alert(1)>` 같은 입력이 거부되거나 순수 텍스트로만 처리된다.

---

## 21. 구현 완료 정의

MVP 완료는 파일 생성이나 테스트 통과만을 뜻하지 않는다. 다음이 모두 필요하다.

1. `AGENTS.md`와 이 문서의 필수 범위 구현
2. 자동 테스트 및 콘텐츠 검증 통과
3. 로컬 HTTP 환경의 실제 브라우저에서 전체 Quick Play 완료
4. 모바일 폭과 키보드 흐름 수동 확인
5. 별도 Supabase 테스트 프로젝트에서 RLS와 랭킹 등록/조회 확인
6. GitHub Pages 공개 URL에서 asset 경로와 한 판 플레이 확인
7. 알려진 제한과 미검증 항목을 README 및 완료 보고에 명시

---

## 22. 향후 검토 항목

MVP 반응을 확인한 뒤에만 다음을 검토한다.

- Edge Function 기반 점수 검증과 rate limiting
- 익명 계정을 정식 계정으로 연결하는 선택 기능
- 더 정교한 spaced repetition
- 주간 랭킹
- 추가 Python 문법 콘텐츠
- 오디오와 고급 전투 연출
- 실제 Python 실행 환경

`Level 3`과 `Level 4`는 향후 검토 목록에도 자동 포함하지 않는다. 핵심 가치가 짧고 많은 타이핑이라는 점을 다시 검증한 별도 제품 결정이 있어야 한다.

---

## 23. 공식 기술 참고

- Supabase Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase 데이터 보안: <https://supabase.com/docs/guides/database/secure-data>
- Supabase Anonymous Sign-In: <https://supabase.com/docs/guides/auth/auth-anonymous>
- GitHub Pages 개요: <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
