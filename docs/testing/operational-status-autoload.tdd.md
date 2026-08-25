# Operational Status Autoload TDD

작성일: 2026-08-25

## 목적

운영 상태 새로고침이 만든 최신 `operational-status-bundle/v1`을 Electron Settings가
자동으로 찾아 복원한다. 운영자는 매번 여러 JSON을 수동 등록하지 않고 현재 HITL
단계와 내장 artifact를 이어받을 수 있다. 수동 `Status Bundle 등록`은 자동 탐색이
불가능하거나 유효한 번들이 없을 때의 폴백으로 유지한다.

## 안전 경계

- Electron main process가 환경 변수로 지정된 운영 artifact 폴더와 앱의 알려진
  `artifacts` 폴더만 비재귀적으로 읽는다.
- 파일명, 최대 10 MB, 계약 버전, 생성 시각, `serviceWritesPerformed=false`를 검증한다.
- 현재 로컬 번들보다 생성 시각이 최신인 경우에만 채택한다.
- 복원 대상은 Settings 상태와 브라우저 `localStorage`뿐이다.
- SQL, Common Agent, Graph DB, Reference store, 모델 학습에는 쓰지 않는다.
- 자동 탐색 실패 시 기존 수동 JSON 등록을 계속 사용할 수 있다.

## RED 증거

| Commit | Intended Failure |
|---|---|
| `2ae05e1` | 최신 유효 번들을 선택하는 탐색 모듈이 없어 순수 계약 테스트가 실패했다. |
| `9196404` | Settings에 자동 복원 상태와 재시도 버튼이 없어 Electron 스모크가 실패했다. |
| `b99f9ad` | 생성된 번들의 첫 안내가 여전히 수동 artifact 등록을 요구해 안내 계약이 실패했다. |

## GREEN 증거

| Command | Result | Guarantee |
|---|---|---|
| `npm run test:operational-status-autoload` | PASS, 3/3 | 최신 유효 번들 선택, 잘못된 후보 거부, 최신 시각 채택 정책 |
| `npm run test:operational-status-bundle` | PASS, 6/6 | one-file embedded artifact 복원과 자동 복원 우선 안내 |
| `npm run test:operational-status-refresh` | PASS, 4/4 | allowlist 기반 무쓰기 상태 새로고침 |
| `npm run test:vision-operational-hitl-display` | PASS, 28/28 | Settings 운영 상태 카드 회귀 없음 |
| `npm run test:contracts` | PASS, 330/330 | Vision, Graph, HITL, 보고서 계약 전체 회귀 없음 |
| `node --test --experimental-test-coverage ...` | PASS, line 97.80% | 상태 탐색·번들 모듈의 핵심 경로 커버 |
| `npm run test:electron:operational-status-autoload` | PASS | 자동 복원, 번들/Progress 영속화, 재시도, 콘솔 오류 0건 |
| `npm run test:electron:vision-readiness` | PASS | 기존 Settings Vision 운영 화면과 충돌 없음, 콘솔 오류 0건 |

GREEN checkpoint commits:

- `85c4bc5 feat: discover latest operational status bundle`
- `197f46a feat: autoload latest operational status`
- `c8678c3 fix: align status guidance with autoload`

## 실제 운영 상태

`npm run operational:refresh-status -- --execute`는 9개 allowlist 명령을 모두
실행했고 실패 0건, 서비스 쓰기 0건으로 최신 번들을 생성했다.

최신 번들:

`artifacts/operational-status-bundle-2026-08-25T00-57-48-758Z.json`

- Software scaffold: 100%
- Operational progress: 0%
- 상태: `awaiting_human_hitl`
- HITL 입력 누락: 56건
- 첫 큐: `vision_label_conflicts`
- 대기 행: 59건, 고위험 행: 9건
- Vision Top-1: 46.2%, Top-3: 53.8%
- Web HITL 승인 대기: 40건

남은 병목은 코드 자동화가 아니라 사람이 실제 이미지·근거를 보고 확정해야 하는
HITL 데이터 판정이다. 자동 복원은 이 판정을 대신하지 않고, 최신 증거와 다음 판정
위치를 잃지 않도록 인수인계 비용만 제거한다.
