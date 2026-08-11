# Python Typing Survival

짧은 Python 코드를 정확하게, 많이, 직접 타이핑하는 3~5분 웹 학습 게임입니다. Level 1은 보이는 전체 코드를 그대로 입력합니다. Level 2는 같은 문장을 Level 1에서 두 번 완료한 뒤 열리며, 코드의 빈칸 하나와 OUTPUT만 보고 정답을 입력합니다.

**[GitHub Pages에서 플레이](https://shinepcs.github.io/PyType/)**

## 실행

Node.js 20.11 이상이 필요합니다. 앱은 `file://`이 아니라 로컬 HTTP로 여세요.

```powershell
npm install
npm test
npm run validate:content
npm run simulate
npm run test:browser
npm run serve
```

그 뒤 <http://127.0.0.1:4173>을 엽니다. 런타임은 빌드가 필요 없는 Vanilla HTML/CSS/JavaScript ES Modules이며, npm은 검증 도구에만 사용합니다.

## 게임 모드

- Quick Play: 240초, 최대 40문제, 유일한 온라인 랭크 모드
- Daily Training: 로컬 날짜와 콘텐츠 버전으로 결정되는 30문제 비랭크 훈련
- Practice: 원하는 문법을 골라 연습하는 비랭크 모드
- Sample Logic: 실제 실행 가능한 2~3줄 Python 로직만 연습하는 Practice 계열 비랭크 모드

오타와 목표 시간을 넘긴 문제는 같은 세션에서 3~7문제 뒤 다시 등장합니다. 정확도, WPM, 콤보, 점수, 위험도, 문법별 숙련도는 `PRD.md`의 공식으로 계산됩니다.

Level 2에서는 미입력 정답 문자를 화면에 미리 표시하지 않습니다. 문제를 푸는 동안 세션 시간과 위험도는 멈추며, 완료하면 3초 보너스, 첫 오타에는 한 번만 2초 패널티가 적용됩니다. 이 규칙 이후 Quick 랭킹은 `1.0.0-r2` 그룹으로 분리됩니다.

Practice 화면은 자신의 Quick 최고 순위를 기준으로 위·아래 최대 5명의 닉네임과 점수를 보여 줍니다. Practice 점수는 비교용 pace일 뿐 온라인 랭킹에는 제출되지 않습니다. 홈의 ONLINE PLAYERS는 최근 90초 안에 heartbeat를 보낸 브라우저의 닉네임과 현재 랭킹 버전 Quick 최고 점수를 표시합니다.

QUESTIONS에서는 이메일이나 관리자 계정 없이 Supabase 익명 인증으로 문제를 추가하거나 기존 정적 문제의 새 revision을 저장할 수 있습니다. 최신 검증 revision은 모든 사용자의 Practice에 병합되며 Quick/Daily 공식 문제와 랭킹 기준은 변경하지 않습니다.

## 구조

```text
css/          디자인 토큰, 기본 스타일, 반응형 레이아웃, 컴포넌트
data/         실행 코드가 없는 skill·정적 문제·템플릿 JSON
js/core/      DOM 없는 세션·판정·점수·전투·숙련도·출제 규칙
js/content/   콘텐츠 로드·결정적 생성·스키마 검증
js/services/  localStorage·Supabase REST·랭킹
js/ui/        화면 전환·렌더링·접근성
supabase/     재실행 가능한 PostgreSQL/RLS 스키마
tests/        node:test 단위 및 통합 테스트
scripts/      콘텐츠 검증·밸런스 시뮬레이션·Pages artifact 준비
```

구현 단계와 품질 게이트는 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)에 정리되어 있습니다.

## 로컬 데이터

개인 학습 데이터는 브라우저의 `pythonTypingSurvival:v1` 키 하나에 저장합니다. 닉네임, 설정, 최근 100개 세션, 개인 최고 기록, 문법별 최근 20회 결과를 포함합니다. Settings에서 무엇이 삭제되는지 확인한 뒤 전체 초기화할 수 있습니다.

손상된 JSON이나 저장 용량 오류가 플레이를 막지 않도록 메모리 fallback을 사용합니다. 데이터는 브라우저나 사이트 저장소를 삭제하면 복구할 수 없습니다.

## Supabase 설정

브라우저에는 공개 가능한 Project URL과 publishable key만 둡니다. PAT, DB 비밀번호, secret key, `service_role` key는 저장소나 Pages artifact에 넣지 마세요.

1. Supabase 프로젝트에서 Anonymous Sign-Ins를 활성화합니다.
2. SQL Editor에서 [`supabase/schema.sql`](./supabase/schema.sql)을 실행합니다.
3. `js/config.example.js`를 참고해 `js/config.js`의 공개 설정을 채웁니다.
4. `supabase/README.md`의 RLS 시나리오를 별도 테스트 사용자로 검증합니다.

Supabase 설정이 없거나 인증·네트워크 요청이 실패해도 모든 게임 모드와 localStorage는 계속 동작합니다. 온라인에는 공개 닉네임, Quick Play 랭킹 최소 결과, 90초 온라인 heartbeat, 공유 Practice 문제 revision만 전송합니다.

## GitHub Pages

`.github/workflows/pages.yml`은 `main` push 때 자동 테스트, 콘텐츠 검증, 밸런스 시뮬레이션을 통과한 공개 파일만 `.pages-dist`에 모아 GitHub Pages에 배포합니다. 모든 정적 URL은 저장소 하위 경로에서 동작하도록 `./` 상대 경로를 사용합니다.

저장소 Settings → Pages → Source는 **GitHub Actions**로 설정해야 합니다.

## 보안 및 한계

- 닉네임과 랭킹 문자열은 `textContent`로만 렌더링하며 `eval`, `new Function`, 동적 HTML 실행을 사용하지 않습니다.
- RLS는 공개 조회와 로그인한 익명 사용자의 자기 기록 INSERT만 허용합니다. 클라이언트 UPDATE/DELETE 정책은 없습니다.
- 동일 `(user_id, session_id)`는 한 번만 저장됩니다.
- 점수는 GitHub Pages 클라이언트에서 계산되므로 정상 범위 안에서 조작된 점수까지 완전히 증명할 수 없습니다. 랭킹은 교육용·친선 경쟁 용도입니다.
- 익명 Supabase 사용자는 브라우저 데이터 삭제나 다른 브라우저로 이동했을 때 기존 ID를 복구할 수 없습니다.
- 공유 문제는 구조·길이·Level 계약을 브라우저와 DB 양쪽에서 검증하고 5초 저장 간격과 500문제 상한을 적용하지만, 이메일 없는 공개 익명 편집이므로 내용의 교육적 정확성이나 악의적 수정까지 보장할 수 없습니다. 운영 규모가 커지면 신고·검수 큐와 CAPTCHA를 추가해야 합니다.

## 의존성

프로덕션 런타임 외부 라이브러리는 없습니다. 개발 의존성 `@playwright/test` `1.62.1`은 실제 Chromium 브라우저 통합 검증에만 사용하며 lockfile에 고정했습니다. Playwright 패키지는 Apache-2.0(선택적 macOS `fsevents`는 MIT)이고, 로컬 npm 패키지는 브라우저 바이너리를 제외해 약 18 MiB입니다. 브라우저 바이너리는 테스트 환경에만 설치되며 Pages artifact, 게임 로딩 크기, 런타임 권한에는 영향을 주지 않습니다. `npm audit`과 CI 테스트를 통해 고정 버전을 검증합니다.
