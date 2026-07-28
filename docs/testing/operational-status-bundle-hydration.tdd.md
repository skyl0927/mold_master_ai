# Operational Status Bundle Hydration TDD

작성일: 2026-07-28

## 목적

`operational-status-bundle/v1`은 로그아웃, 새 계정 로그인, 다른 PC, 다른 agent가
현재 작업을 이어받기 위한 상태 인수인계 파일이다. 단순 경로 목록만 있으면 새
환경에서 원본 artifact를 다시 찾아야 하므로, 주요 운영 artifact snapshot을 bundle
내부에 함께 싣고 Settings의 `Status Bundle 등록` 흐름에서 복원할 수 있게 한다.

복원은 브라우저 `localStorage`와 Settings 화면 상태에만 적용되며, 서버, SQL DB,
Common Agent, Graph DB, Reference store, 모델 학습에는 쓰지 않는다.

## 사용자 여정

- 운영자는 status bundle 하나만 등록해도 Progress, Pipeline Status, Human Brief,
  Session Packet, Suggestion 상태가 복원되기를 원한다.
- 다음 작업자는 같은 bundle에서 decision review packet과 reviewer worksheet까지
  확인해 남은 HITL 입력 큐를 바로 이어받고 싶다.
- 운영자는 계약 버전이 맞는 snapshot만 복원되고, 변조되거나 지원하지 않는
  snapshot은 거부되기를 원한다.

## RED 증거

| Command | Result | Intended Failure |
|---|---|---|
| `npm run test:operational-status-bundle` | FAIL | `embeddedSnapshotCount`가 없고 `extractRestorableStatusBundleArtifacts` 함수가 없어 one-file restore를 증명하지 못했다. |
| `npm run test:operational-status-bundle` | FAIL, 5/6 pass | decision-review packet과 reviewer worksheet payload를 넣어도 snapshot count가 `7`에서 `9`로 늘지 않았다. |

RED checkpoint commits:

- `c07dc9a test: require HITL review snapshots in status bundle`

## GREEN 증거

| Command | Result | Guarantee |
|---|---|---|
| `npm run test:operational-status-bundle` | PASS, 6/6 | bundle이 지원 계약 artifact snapshot만 포함하고 복원 대상으로 추출한다. |
| `npm run test:vision-operational-hitl-display` | PASS, 28/28 | Settings display 요약이 status bundle 안의 decision-review/reviewer worksheet 상태를 계속 표시한다. |
| `npm run operational:status-bundle` | PASS | 최신 실제 bundle이 `embeddedSnapshotCount=10`을 출력하고 reviewer worksheet 경로를 포함한다. |
| `node -e "...extractRestorableStatusBundleArtifacts(...)"` | PASS | 최신 실제 bundle에서 10개 snapshot이 복원 가능하고 rejected snapshot은 0개다. |

최신 실제 복원 키:

```text
developmentProgress
pipelineStatus
humanDecisionBrief
reviewSessionPacket
worktableSuggestion
visionCaptureWorkOrderPlan
labelConflictReviewGuide
webKnowledgeCommonAgentPackage
operationalDecisionInputReviewPacket
operationalReviewerWorksheet
```

## 보장

| # | 보장 내용 | 증거 |
|---|---|---|
| 1 | bundle은 주요 운영 artifact snapshot을 포함한다. | `embeds restorable source artifact snapshots for one-file Settings restore` |
| 2 | 계약 버전이 맞는 JSON만 복원 대상으로 추출한다. | `extractRestorableStatusBundleArtifacts` assertions |
| 3 | 계약 불일치 snapshot은 복원하지 않고 rejected list로 분리한다. | `rejects unsupported or contract-mismatched status bundle snapshots` |
| 4 | decision-review packet과 reviewer worksheet도 새 로그인/다른 PC handoff 증거로 보존된다. | snapshot key assertions |
| 5 | 복원은 artifact/state hydration이며 자동 승인, SQL 쓰기, Graph 승격, Reference 학습, 모델 학습을 수행하지 않는다. | status bundle policy assertions |

## 현재 상태

최신 bundle 기준 운영 상태는 `awaiting_human_hitl`이다. 남은 HITL 입력은 56건이고,
첫 큐는 `vision_label_conflicts`이다. 이 hydration 보강은 인수인계 안정성을 높인
것이며, 사람이 decision file 또는 worktable CSV를 검토해 채우는 절차 자체를
대체하지 않는다.
