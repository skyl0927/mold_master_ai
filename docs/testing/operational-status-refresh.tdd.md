# Operational Status Refresh TDD

작성일: 2026-07-28

## 목적

사람이 HITL worktable CSV를 수정한 뒤에는 여러 상태 artifact를 순서대로 다시
생성해야 한다. `operational-status-refresh-run/v1`은 이 절차를 하나의 안전한
runner로 묶는다.

기본 실행은 계획만 생성하고, `--execute`를 명시해야 allowlist된 no-apply 상태
갱신 명령만 실행한다. 이 runner는 검증 실행, apply, SQL/Graph/Reference/Model
쓰기 작업을 허용하지 않는다.

## 사용자 여정

- 운영자는 HITL CSV 입력 후 한 번의 refresh 명령으로 최신 pipeline status, human
  brief, decision review packet, reviewer worksheet, status bundle을 재생성하고 싶다.
- 운영자는 refresh 실행이 자동 승인이나 Graph 승격을 수행하지 않는다는 증거를
  보고 싶다.
- 다음 작업자는 최신 status bundle에서 곧바로 reviewer worksheet와 첫 HITL 큐를
  확인하고 이어받고 싶다.

## 안전 경계

- `--apply` 명령은 차단한다.
- `verify-run -- --execute` 계열은 차단한다.
- 임의 shell 명령은 차단한다.
- Graph promotion, Reference learning, Model training, service write를 허용하지 않는다.
- 실행 대상은 로컬 상태 artifact 갱신 명령만 허용한다.

## RED 증거

| Command | Result | Intended Failure |
|---|---|---|
| `node --test tests/operationalStatusRefresh.test.js` | FAIL | `../operationalStatusRefresh` 모듈이 없어 refresh contract를 생성하지 못했다. |
| `npm run test:operational-status-refresh` | FAIL, 3/4 pass | refresh 계획에 `operational:hitl:decision-review-packet`과 `operational:hitl:reviewer-worksheet`가 빠져 있었다. |

RED checkpoint commits:

- `475ba4d test: require reviewer worksheet in status refresh`

## GREEN 증거

| Command | Result | Guarantee |
|---|---|---|
| `npm run test:operational-status-refresh` | PASS, 4/4 | refresh runner가 allowlist된 상태 갱신 명령만 계획/실행하고 unsafe command를 차단한다. |
| `npm run operational:refresh-status` | PASS | `plan_ready`, `commandsPlanned=9`, `commandsExecuted=0`, `serviceWritesPerformed=false`를 생성한다. |
| `npm run operational:refresh-status -- --execute` | PASS | 9개 refresh 명령이 모두 exit code 0으로 실행됐고 `serviceWritesPerformed=false`를 유지했다. |

최신 실제 refresh 실행 결과:

```text
operational:hitl:worktable-import:0
operational:hitl:session-progress:0
operational:hitl:pipeline-status:0
vision:capture:work-orders:status:0
operational:progress:0
operational:hitl:human-brief:0
operational:hitl:decision-review-packet:0
operational:hitl:reviewer-worksheet:0
operational:status-bundle:0
```

## 갱신 순서

```text
npm run operational:hitl:worktable-import
npm run operational:hitl:session-progress
npm run operational:hitl:pipeline-status
npm run vision:capture:work-orders:status
npm run operational:progress
npm run operational:hitl:human-brief
npm run operational:hitl:decision-review-packet
npm run operational:hitl:reviewer-worksheet
npm run operational:status-bundle
```

실제 실행 명령:

```powershell
npm run operational:refresh-status -- --execute
```

## 현재 상태

최신 status bundle은 `awaiting_human_hitl` 상태이며, 남은 HITL 입력은 56건이다.
첫 처리 큐는 `vision_label_conflicts`이고, 최신 reviewer worksheet Markdown은
status bundle에 함께 연결된다.
