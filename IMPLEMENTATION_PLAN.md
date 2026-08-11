# Python Typing Survival MVP 구현 계획

기준 문서: `PRD.md` 1.0.0, `AGENTS.md`

## 제품 경계

- Vanilla HTML/CSS/JavaScript ES Modules와 정적 GitHub Pages만 사용한다.
- 학습 레벨은 전체 코드를 복사하는 Level 1과 코드의 빈칸 하나를 OUTPUT과 함께 푸는 Level 2만 제공한다.
- Quick Play는 240초·최대 40문제의 유일한 온라인 랭크 모드다.
- Daily Training과 Practice는 로컬 학습·숙련도만 갱신한다.
- 게임 규칙은 DOM과 네트워크에서 분리하고, Supabase 장애가 플레이를 막지 않게 한다.

## 단계별 구현

1. 정적 앱과 화면 상태 전환, 상대 경로, 테스트·Pages workflow 골격을 만든다.
2. 필수 skill 전부를 포함하는 120개 이상의 검증 가능한 문제/템플릿 변형과 seed 기반 생성기를 만든다.
3. 문자별 판정, IME·paste/drop 처리, 정확도와 active typing time을 구현한다.
4. 주입 가능한 시간과 seed 난수를 사용하는 GameState, 점수, danger, 콤보, pause, 종료 경쟁 조건을 구현한다.
5. 3~7문제 뒤 재출제, 최근 20회 기반 숙련도, 버전된 localStorage 저장소를 구현한다.
6. Home, Mode Setup, Game, Pause, Result, Ranking, Progress, Settings를 360/768/1280px와 키보드 흐름에 맞춰 통합한다.
7. RLS·제약·상위 100 사용자별 최고 기록 RPC를 포함한 Supabase 스키마와 익명 인증/오프라인 fallback을 구현한다.
8. 순수 로직·콘텐츠·저장소 자동 테스트와 네 가지 플레이 프로필 밸런스 시뮬레이션을 통과시킨다.
9. 로컬 HTTP 실제 브라우저에서 신규 사용자, Level 1/2, 오타 수정, pause, game/time over, 저장 복원, 랭킹 상태를 검증한다.
10. Supabase 테스트 프로젝트에 스키마를 적용해 RLS 7개 시나리오를 검증하고, GitHub Pages에 배포해 공개 URL에서 한 판과 랭킹 왕복을 재검증한다.

## 디렉터리 구조

```text
PyType/
├─ index.html, 404.html, .nojekyll
├─ css/                         # tokens, base, layout, components
├─ js/
│  ├─ app.js, config.js, config.example.js
│  ├─ core/                     # 순수 게임 규칙과 GameState
│  ├─ content/                  # JSON 로드·생성·검증
│  ├─ services/                 # localStorage·Supabase·ranking
│  ├─ ui/                       # 화면·입력·접근성 바인딩
│  └─ utils/                    # seed random·시간·공통 검증
├─ data/                        # skills, questions, templates JSON
├─ supabase/                    # 재실행 가능한 schema와 운영 안내
├─ tests/                       # node:test 단위·통합 테스트
├─ scripts/                     # 콘텐츠/밸런스/브라우저 검증 보조
└─ .github/workflows/pages.yml  # 테스트 후 Pages 배포
```

## 완료 게이트

- `npm test`, 콘텐츠 검증, 밸런스 시뮬레이션이 통과한다.
- 실제 브라우저에서 Quick Play 전체 흐름과 localStorage 복원을 확인한다.
- 360/768/1280px, 키보드, reduced motion, 오프라인 랭킹 상태를 확인한다.
- 실제 Supabase에서 익명 소유권, UPDATE/DELETE 거부, 제약, 중복, 세 랭킹 조회를 확인한다.
- 실제 GitHub Pages 하위 경로에서 HTML/CSS/JS/JSON, 한 판, 랭킹 제출·조회가 정상이다.
- 저장소·배포물·브라우저 번들에 PAT, DB 비밀번호, secret/service-role 키가 없다.
