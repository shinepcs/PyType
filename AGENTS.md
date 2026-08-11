# Python Typing Survival — Codex 개발 규칙

이 파일은 저장소 전체에 적용된다. 모든 개발 에이전트는 작업 전에 이 파일과 `PRD.md`를 끝까지 읽어야 한다.

## 1. 임무

`PRD.md`에 정의된 **Python Typing Survival MVP**를 실제 브라우저에서 플레이 가능하고 GitHub Pages에 배포 가능한 상태로 구현한다.

최우선 제품 가치는 다음 한 문장이다.

> 짧은 Python 코드를 정확하게, 많이, 직접 타이핑하게 만든다.

기능·연출·추상화·도구 선택이 이 가치를 방해하면 단순한 쪽을 선택한다.

---

## 2. 작업 시작 규칙

1. `AGENTS.md`, `PRD.md`, `README.md`, 기존 코드와 테스트를 읽는다.
2. 현재 Git 상태와 사용자의 기존 변경을 확인한다.
3. 요청 범위와 PRD 수용 기준을 작업 체크리스트로 바꾼다.
4. 관련 데이터 흐름을 끝까지 추적한 뒤 수정한다.
5. 모호한 세부사항은 PRD의 핵심 가치와 기존 구조에 맞춰 작은 가정으로 해결하고 완료 보고에 기록한다.
6. 범위를 바꾸거나 MVP 외 기능을 추가해야 하는 결정은 임의로 하지 않는다.

기존 변경은 사용자의 작업으로 간주한다. 관련 없는 파일을 되돌리거나 정리하지 않는다.

---

## 3. 절대 유지할 제품 규칙

- 레벨은 `Level 1`과 `Level 2`만 존재한다.
- `Level 1`은 보이는 전체 코드를 그대로 입력한다.
- `Level 2`는 빈칸 하나가 있는 코드와 `OUTPUT`을 동시에 보고 짧은 답을 입력한다.
- 한 문제의 목표 시간은 5~15초다.
- 표준 세션은 3~5분, 20~40문제다.
- 정확도는 분당 타수보다 점수와 학습에서 중요하다.
- 오타와 느린 문제는 재출제한다.
- 정답 후 다음 문제는 700ms 이내 보여준다.
- 전투 연출은 코드를 가리거나 입력을 잠그지 않는다.
- 개인 학습 데이터는 `localStorage`, 공개 랭킹 최소 데이터는 Supabase에 저장한다.
- 온라인 장애는 게임 플레이를 중단시키지 않는다.
- 온라인 랭킹 대상은 표준 `Quick Play`만이다.
- GitHub Pages의 저장소 하위 경로에서 동작해야 한다.

---

## 4. 금지사항

사용자의 별도 승인 없이 다음을 구현하지 않는다.

- `Level 3`, `Level 4`, 전체 프로그램 작성
- 알고리즘 문제, 코딩 테스트, 긴 보스 문제
- 실제 Python 인터프리터, Pyodide 등 대형 런타임
- React, Vue, Svelte 등 UI 프레임워크
- 필수 런타임 번들러 또는 무거운 게임 엔진
- AI 문제 생성
- 이메일·비밀번호·소셜 로그인 화면
- 멀티플레이, 채팅, 친구, 길드
- 장비, 인벤토리, 아이템, 상점, 파밍, 스토리, 복잡한 성장 시스템
- 결제, 광고, 분석·추적 SDK
- `eval`, `new Function`, JSON 속 실행 코드
- 사용자 입력 또는 닉네임의 `innerHTML` 렌더링
- 온라인 연결 성공을 게임 시작의 선행 조건으로 만들기
- 모든 로직을 `index.html` 또는 `app.js` 한 파일에 넣기
- PRD 범위와 무관한 리팩터링
- 테스트를 통과시키기 위한 요구사항 약화 또는 실패 테스트 삭제
- 확인하지 않은 실행·배포를 완료했다고 보고하기

Lyphica: Typing Survival은 게임 루프 참고 대상일 뿐이다. 명칭, 그래픽, 코드, 레이아웃, 사운드 또는 고유 표현을 복제하지 않는다.

---

## 5. 기술 기준

### 5.1 런타임

- Vanilla HTML/CSS/JavaScript를 사용한다.
- JavaScript는 ES Modules로 구성한다.
- 정적 GitHub Pages에서 별도 애플리케이션 서버 없이 실행한다.
- npm은 테스트·검증 도구에 사용할 수 있지만, 단순한 런타임을 불필요하게 빌드 산출물에 묶지 않는다.
- 외부 라이브러리를 추가하기 전 표준 Web API로 해결 가능한지 확인한다.
- 라이브러리를 추가하면 목적, 크기, 라이선스와 보안 영향을 README에 기록한다.

### 5.2 모듈 경계

아래 책임을 분리한다.

| 영역 | 책임 | 금지 |
|---|---|---|
| `core` | 세션, 판정, 점수, 전투, 숙련도, 출제 | DOM·네트워크 직접 접근 |
| `content` | JSON 로드, 템플릿 생성, 스키마 검증 | UI 렌더링 |
| `services` | 로컬 저장, Supabase, 랭킹 | 게임 규칙 재계산 |
| `ui` | 화면 상태, 이벤트 바인딩, 접근성 | 점수·숙련도 공식 소유 |
| `data` | 검증 가능한 콘텐츠 | 실행 코드 포함 |

점수·분당 타수·정확도·위험도·숙련도·문제 선택은 DOM 없는 순수 함수로 테스트 가능해야 한다.

### 5.3 상태 관리

- 변경 가능한 전역 변수를 흩어 놓지 않는다.
- 한 세션의 상태는 명시적 `GameState`에 둔다.
- 시간은 가능한 한 주입 가능한 clock 또는 명시적 timestamp로 전달한다.
- 난수는 seed 가능한 generator를 사용한다.
- 같은 seed와 입력에서 같은 문제 순서와 점수가 나와야 한다.
- 화면 전환 시 타이머, 이벤트 리스너, animation frame을 정리한다.

### 5.4 URL과 파일 경로

- project Pages 경로를 지원하기 위해 정적 asset과 fetch URL은 `./` 기반 상대 경로를 사용한다.
- `/css/style.css`, `/data/questions.json`처럼 도메인 루트를 가리키는 URL을 쓰지 않는다.
- 로컬 테스트는 `file://`이 아니라 HTTP 서버로 실행한다.
- 클라이언트 라우터가 필요한 경우 hash 또는 단일 화면 상태를 사용하고 새로고침 404를 만들지 않는다.

---

## 6. 콘텐츠 개발 규칙

- `data/questions.json`과 `data/question-templates.json`은 `PRD.md` 스키마를 따른다.
- 모든 문제에 안정적인 `id`, `contentVersion`, `skill`, `level`, `type`, `targetSeconds`가 있어야 한다.
- `Level 1`의 `answer`는 정규화 후 `code`와 같아야 한다.
- `Level 2`에는 빈칸이 정확히 하나 있고 `output`과 `answer`가 있어야 한다.
- `acceptedAnswers`를 정답을 느슨하게 만드는 용도로 남용하지 않는다.
- Python의 대소문자, 공백, 따옴표, 콜론, 괄호, 들여쓰기를 정확히 유지한다.
- 탭을 콘텐츠에 저장하지 않고 들여쓰기는 공백 4개를 사용한다.
- 출력은 실제 Python 의미와 일치하도록 사전 검증한다.
- 비결정적 출력은 `outputMode: "example"`로 표시한다.
- `random.shuffle()` 같은 문제는 가능한 예시 출력인지 검증하고 `OUTPUT (예시)`로 렌더링한다.
- 템플릿 생성기는 등록된 `generatorId`로만 호출하며 같은 seed에서 결정적이어야 한다.
- 콘텐츠 수를 채우기 위해 사실상 같은 문제를 의미 없이 복제하지 않는다.
- 콘텐츠 추가 시 자동 검증과 대표 문제 수동 검토를 모두 수행한다.

---

## 7. 타이핑 엔진 규칙

- 키 입력 시 기대 문자와 현재 위치를 비교한다.
- 오타는 사용자가 지워 고칠 수 있지만 정확도 손실은 유지한다.
- `Backspace`, 방향키, 기능키는 정확도 분모에 넣지 않는다.
- 붙여넣기와 drop은 게임 입력에서 차단한다.
- 닉네임 입력, 접근성 기능, 일반 브라우저 단축키를 전역 차단하지 않는다.
- IME composition 이벤트와 일반 키 입력을 구분한다.
- Level 1의 탭 입력을 지원한다면 정확히 공백 4개로 변환한다.
- CRLF는 내부에서 LF로 정규화하되 다른 공백을 임의로 무시하지 않는다.
- 자동 제출은 정답 전체가 정확히 일치할 때만 발생한다.
- 입력 중 화면 전체를 매번 다시 렌더링하지 않는다.

다음 경계를 반드시 테스트한다.

- 빈 입력
- 첫 글자 오타 후 수정
- 같은 위치에서 여러 번 오타
- 줄바꿈과 4칸 들여쓰기
- 따옴표 종류 불일치
- 한글 IME가 활성화된 상태
- paste와 drop
- 정답 완료 직전 pause 또는 time over
- 빠른 연속 입력 중 다음 문제로 이벤트가 새는 현상

---

## 8. 점수·전투·시간 규칙

- 모든 공식과 상수는 `PRD.md`를 단일 기준으로 구현한다.
- 점수 상수를 UI 파일에 복제하지 않는다.
- 부동소수점 중간값의 반올림 위치를 테스트로 고정한다.
- 정확도 배율은 세션 종료 시 한 번만 적용한다.
- 첫 오타가 발생하면 그 문제의 `cleanSolve`는 끝까지 false다.
- 첫 오타가 발생하는 즉시 콤보를 0으로 만든다.
- 분당 타수는 올바르게 입력한 keystroke 수와 active typing time으로 계산한다.
- 탭 숨김 자동 일시정지와 사용자 일시정지를 명확히 구분한다.
- 일시정지 중에는 위험도, 세션 시간, 문제 시간, 분당 타수 측정 시간이 진행되지 않는다.
- Quick Play의 수동·자동 일시정지 누적이 30초를 넘으면 세션을 `rankEligible = false`로 만들고 온라인 제출하지 않는다.
- 종료 후 남은 timer callback이 점수나 화면을 바꾸지 않게 한다.
- `danger`는 항상 0~100, 점수와 시간은 유효 범위로 clamp한다.

밸런스 상수를 조정할 때는 최소 다음 시뮬레이션 결과를 남긴다.

- 정확하고 빠른 플레이
- 정확하지만 느린 플레이
- 빠르지만 오타가 많은 플레이
- 초보 수준의 느리고 불규칙한 플레이

빠르지만 부정확한 플레이가 같은 해결 수의 정확한 플레이보다 유리해지면 안 된다.

---

## 9. 로컬 저장 규칙

- 루트 키는 `pythonTypingSurvival:v1`을 사용한다.
- read/validate/migrate/write 책임을 한 저장소 모듈에 모은다.
- 모든 로드 값은 스키마와 범위를 검증한다.
- 손상된 JSON, 알 수 없는 필드, 이전 버전, quota 오류를 테스트한다.
- 쓰기는 가능한 한 완성된 새 객체를 한 번 직렬화해 교체한다.
- 세션 히스토리, 분당 타수 추세, 최근 결과는 PRD의 보존 한도를 지킨다.
- 저장 실패가 현재 플레이를 중단시키지 않게 한다.
- 데이터 초기화는 확인을 거치며 닉네임·설정·진행도 중 무엇이 지워지는지 표시한다.
- 테스트는 실제 사용자 localStorage를 건드리지 않고 격리된 adapter를 사용한다.

---

## 10. Supabase 및 보안 규칙

### 10.1 키와 구성

- 프런트엔드에는 Project URL과 `publishable key`만 사용한다.
- 구형 `anon key`도 RLS와 함께 쓰는 공개 키로만 취급한다.
- `secret key`, `service_role key`, DB 비밀번호, 개인 액세스 토큰을 코드, 환경 예시, 로그, 테스트 fixture, README, Git history에 넣지 않는다.
- `.env`나 GitHub Actions secret을 정적 JavaScript에 주입하면 공개된다는 사실을 전제로 한다.
- 구성 파일 예시에는 placeholder만 넣는다.
- Supabase 구성이 없으면 명확한 `offline ranking` 상태로 실행한다.

### 10.2 익명 인증

- 회원가입 UI를 만들지 않는다.
- 온라인 랭킹이 활성화되면 Supabase Anonymous Sign-In을 백그라운드에서 사용한다.
- 인증 세션 전체나 access token을 직접 로그로 남기지 않는다.
- 인증 실패·만료·재시도는 게임 루프와 분리한다.
- `auth.uid()`는 닉네임과 별개의 브라우저 설치 단위 소유자다.

### 10.3 데이터베이스

- `supabase/schema.sql`을 source of truth로 둔다.
- public/exposed schema의 랭킹 테이블에 RLS를 활성화한다.
- 읽기와 자기 기록 삽입만 허용한다.
- 클라이언트용 `UPDATE`, `DELETE` 정책을 만들지 않는다.
- 삽입 정책은 `(select auth.uid()) = user_id`를 확인한다.
- 타입 범위, 닉네임, game mode, 중복 session에 DB `CHECK`/`UNIQUE` 제약을 둔다.
- `created_at`은 DB 서버 기본값을 사용한다.
- 쿼리는 현재 `contentVersion`과 `game_mode = 'quick'`을 필터링한다.
- 사용자별 최고 기록과 상위 100명 집계는 제한 전 서버 측 SQL 함수 또는 뷰에서 수행한다. 제한된 원시 행을 클라이언트에서 그룹화하지 않는다.
- UI에는 `user_id`, `session_id`를 표시하지 않는다.
- 닉네임과 서버 문자열은 항상 text로 렌더링한다.
- SQL 함수에 `security definer`가 필요하면 고정 `search_path`, 최소 권한, 명시적 입력 검증을 적용하고 보안 이유를 주석으로 남긴다.

### 10.4 RLS 검증

스키마 작성만으로 완료 처리하지 않는다. 별도 테스트 프로젝트에서 최소 다음을 확인한다.

1. `anon` 또는 미인증 사용자가 임의 기록을 삽입하지 못한다.
2. 익명 로그인한 사용자가 자신의 `user_id`로 유효 기록을 삽입한다.
3. 같은 사용자가 다른 `user_id`로 삽입하지 못한다.
4. 어느 클라이언트도 기록을 update/delete하지 못한다.
5. 범위 밖 score, accuracy, cpm, time, nickname이 거부된다.
6. 동일 `(user_id, session_id)`가 두 번 저장되지 않는다.
7. Global/Today/My Best의 필터와 정렬이 요구사항과 일치한다.

치팅 방지를 과장하지 않는다. 클라이언트 계산 점수는 조작될 수 있음을 README의 제한사항에 기록한다.

### 10.5 웹 보안

- 사용자 또는 서버 값을 `innerHTML`에 넣지 않는다.
- 동적 스크립트 실행을 사용하지 않는다.
- 외부 CDN을 쓰면 고정 버전과 필요 시 integrity를 검토한다.
- 원시 오류와 stack trace를 사용자 화면에 노출하지 않는다.
- 네트워크 요청에 timeout과 제한된 retry를 둔다.
- retry는 같은 `sessionId`를 사용해 멱등성을 유지한다.

---

## 11. 단계별 구현 순서

각 단계가 동작하고 검증된 뒤 다음 단계로 간다. 이후 단계 때문에 앞 단계의 책임 경계를 무너뜨리지 않는다.

### Phase 0 — 기준선

- 저장소와 기존 변경 확인
- 디렉터리 구조와 실행 방법 확정
- PRD 수용 기준 체크리스트 작성
- 최소 테스트 실행 환경 구성

### Phase 1 — 정적 앱 골격

- `index.html`, CSS tokens/base/layout
- Home, Game, Result의 접근 가능한 빈 화면
- 화면 상태 전환과 GitHub Pages 상대 경로
- Supabase 없이 로컬 HTTP에서 실행 확인

### Phase 2 — 콘텐츠 시스템

- skill, 정적 문제, 템플릿 데이터
- seed random과 generator registry
- 런타임 question instance
- 콘텐츠 schema validator와 자동 테스트
- 최소 콘텐츠 수와 분포 검증

### Phase 3 — 타이핑 엔진

- Level 1/2 입력과 문자별 판정
- 정확도와 active typing time
- paste/drop 차단, multiline, indentation
- DOM 없는 단위 테스트와 실제 키보드 수동 테스트

### Phase 4 — 세션·점수·Survival

- `GameState`, timer, pause, visibility 처리
- 점수, 분당 타수, 콤보, danger
- 정답 후 전환과 종료 조건
- fake clock 기반 경계 테스트
- 네 가지 플레이 프로필 밸런스 시뮬레이션

### Phase 5 — 재출제·숙련도·로컬 저장

- 오류·느린 문제 queue
- skill mastery와 due scheduling
- versioned localStorage schema와 migration
- 손상·용량·저장 실패 테스트

### Phase 6 — 완성 UI

- Game HUD, 전투 피드백, Pause, Result
- Daily Training, Practice, Progress, Settings
- 360px 반응형
- keyboard-only, focus, reduced motion 검증

### Phase 7 — Supabase 스키마와 서비스

- `supabase/schema.sql`, 인덱스, 제약, RLS
- Anonymous Sign-In
- ranking service와 offline fallback
- 실제 테스트 프로젝트에서 RLS 행위 검증
- secret scan

### Phase 8 — 랭킹 UI

- Global, Today(UTC), My Best
- 사용자별 최고 기록, 동점 정렬, top 100
- 결과 제출, 중복 방지, 실패 재시도
- loading/empty/error/offline 상태

### Phase 9 — 배포

- README 설정·실행·Supabase·배포 안내
- GitHub Pages publishing source 또는 workflow
- 테스트 후 배포
- 실제 공개 URL에서 asset, JSON, 한 판 플레이, 랭킹 왕복 확인

### Phase 10 — 최종 감사

- PRD 수용 기준 전부 확인
- MVP 제외 기능이 섞이지 않았는지 확인
- 콘솔의 새 오류와 네트워크 실패 확인
- 모바일 폭, 키보드, 오프라인, 새 브라우저 상태 확인
- 미검증 사항과 제한을 정직하게 보고

---

## 12. 테스트 기준

### 12.1 자동 테스트

Node의 기본 `node:test` 등 가벼운 도구를 우선한다. 최소 대상:

- 콘텐츠 schema와 모든 generator seed 결정성
- Level 1/2 입력 판정
- 정확도에서 오타 수정이 손실로 남는지
- WPM의 0시간, pause, inactive 구간
- 점수 경계 `79.99`, `80`, `89.99`, `90`, `94.99`, `95`, `97.99`, `98`
- 콤보 5단계와 최대 배율
- danger clamp와 정확한 종료 시점
- timer/pause/visibility race
- 재출제 간격 3~7, 연속 중복 금지, 최대 2회
- 숙련도 빈 기록과 최근 20회 제한
- localStorage 기본값, 마이그레이션, 손상 JSON, quota 오류
- 랭킹 payload validation과 중복 session 처리

테스트는 실제 시간을 기다리지 않고 fake clock 또는 주입 가능한 시간을 사용한다.

### 12.2 브라우저 통합 테스트

최소 시나리오:

1. 새 브라우저 상태에서 닉네임 입력
2. Level 1 다중 행 문제 해결
3. Level 2 코드와 OUTPUT 확인 후 해결
4. 오타·수정·콤보 초기화 확인
5. 느린 문제의 재출제 확인
6. pause와 탭 숨김 복귀
7. game over와 time over 각각 결과 확인
8. 새로고침 후 진행도와 최고 기록 확인
9. Supabase 없는 상태의 전체 플레이
10. Supabase 있는 상태의 제출과 세 랭킹 탭

### 12.3 수동 시각 검증

- 폭 `360`, `768`, `1280`에서 확인한다.
- 코드, OUTPUT, 입력, timer, danger가 겹치지 않는지 본다.
- 긴 12자 닉네임과 큰 점수에서도 표가 깨지지 않는지 본다.
- error, empty, loading, offline 상태를 각각 본다.
- reduced motion과 키보드 focus를 확인한다.

### 12.4 배포 검증

로컬 통과만으로 배포 완료라 하지 않는다. GitHub Pages 실제 URL에서 다음을 확인한다.

- `index.html`, CSS, ES modules, JSON의 HTTP 성공
- 콘솔 error 없음
- 저장소 하위 경로 asset 정상 표시
- Quick Play 한 판 완료
- localStorage 재접속 유지
- Supabase 인증, 제출, 조회
- 비밀 키 미포함

---

## 13. 품질 게이트

변경을 완료하기 전에 다음을 모두 만족한다.

- 포맷·정적 검사 통과
- 자동 테스트 통과
- 콘텐츠 검증 통과
- 변경된 흐름의 실제 브라우저 재현 통과
- 관련 PRD 수용 기준 통과
- 새 console error 없음
- 관련 없는 사용자 변경 보존
- diff에 secret, 임시 로그, 빌드 쓰레기 없음

테스트 실패를 환경 문제로 단정하기 전에 재현 조건과 실제 오류를 확인한다. 실행할 수 없는 검증은 이유와 영향, 사용자가 실행할 명령을 완료 보고에 적는다.

---

## 14. Git 및 변경 관리

- 작은 단위의 응집된 변경을 만든다.
- 자동 생성 파일과 소스 파일을 구분한다.
- unrelated formatting을 피한다.
- 기존 미커밋 변경을 덮어쓰거나 되돌리지 않는다.
- 파괴적인 Git 명령을 사용하지 않는다.
- 커밋을 요청받으면 변경 범위와 테스트 결과를 먼저 확인한다.
- 배포 또는 push는 사용자가 요청한 범위에서만 수행한다.
- PRD 변경이 필요한 구현상의 발견은 코드로 몰래 우회하지 말고 문서 변경 제안과 함께 보고한다.

---

## 15. 완료 보고 형식

완료 보고는 결과 중심으로 간결하게 작성하되 다음을 포함한다.

1. 구현한 사용자 동작
2. 중요한 파일과 아키텍처 결정
3. 실행한 자동·브라우저·Supabase·배포 검증과 결과
4. 실제 GitHub Pages URL 또는 아직 배포하지 않은 이유
5. 알려진 제한, 미검증 항목, 치팅 방지 한계

컴파일, diff, 테스트 exit code만으로 “게임이 동작한다”고 말하지 않는다. 사용자가 실제로 보는 Quick Play와 랭킹 흐름을 확인해야 한다.

---

## 16. 충돌 처리

- 명시적인 최신 사용자 요청이 가장 우선한다.
- 그다음 이 `AGENTS.md`의 작업 규칙을 따른다.
- 제품 동작은 `PRD.md`를 기준으로 한다.
- 코드와 문서가 다르면 임의로 문서를 무시하지 말고 원인을 확인한다.
- 보안, 개인정보, 데이터 손실 위험이 있는 모호함은 보수적으로 처리하고 보고한다.
- 범위를 크게 바꾸는 선택만 사용자에게 확인하며, 발견 가능한 세부사항 때문에 구현을 멈추지 않는다.
