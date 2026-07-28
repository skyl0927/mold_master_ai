# Vision Operational HITL Workflow Display TDD

작성일: 2026-07-27

## 목적

운영 readiness/worklist에 연결된 HITL workflow 상태를 Settings 화면에서 바로
확인할 수 있게 한다. 운영자는 artifact JSON을 직접 열지 않아도 queue 수,
template 수, 미판정 수, 오류 수, 다음 명령, 안전 정책을 확인할 수 있어야 한다.
또한 운영 전환 단계의 실제 병목인 `operational-hitl-pipeline-status/v1`를
Settings에 등록해 현재 개발 완료 단계, HITL 미입력 수, 추천 분포, 다음 명령을
한 카드에서 확인할 수 있어야 한다. `operational-hitl-decision-worktable-suggestion/v1`
도 Settings에서 등록해 사람이 승인할 후보와 위험 행을 빠르게 검토할 수 있어야 한다.
`operational-hitl-review-session-plan/v1`는 세션별 검토 순서와 복사 후보/사람 확인
필드를 Settings에서 확인할 수 있어야 한다.
`operational-hitl-review-session-packet/v1`와
`operational-hitl-human-decision-brief/v1`도 Settings에서 등록해 실제 판정자가
열어야 할 세션 파일, 원본 worktable CSV, 다음 decision id, 자동 적용 금지 정책을
한 화면에서 확인할 수 있어야 한다.
`mold-master-development-progress-report/v1`도 Settings에서 등록해 소프트웨어
scaffold 진행률, 운영 전환 진행률, Vision/HITL/Web 병목, 다음 1순위 작업을
한 카드에서 확인할 수 있어야 한다.

## RED

테스트 파일: `tests/visionOperationalHitlWorkflowDisplay.test.js`

처음에는 `visionOperationalHitlWorkflowDisplay` 모듈이 없어 실패했다.

```powershell
npm run test:vision-operational-hitl-display
```

기대 실패:

```text
Cannot find module '../visionOperationalHitlWorkflowDisplay'
```

## GREEN

구현 파일:

- `visionOperationalHitlWorkflowDisplay.js`
- `components/SettingsModal.tsx`

검증 기준:

- `close_hitl_reviews.workflowStatus` 또는 Common Agent handoff item의
  workflowStatus를 Settings 표시용 요약으로 변환한다.
- `awaiting_human_review`는 `판정 작성/검증 대기`로 표시한다.
- queue/template/pending 카운트를 `큐 12건 · 템플릿 12건 · 미판정 12건`처럼
  한 줄로 표시한다.
- `invalid_decisions`는 위험 상태로 표시하고 오류 건수를 포함한다.
- `ready_for_manual_import` 상태에서 non-approval worklist item이 있으면
  `비승인 조치 N건`을 같은 요약 줄에 표시한다.
- `nextCommands`가 있으면 authorization bridge와 non-approval worklist 생성
  명령을 모두 보존한다.
- 안전 배지는 `자동 적용 금지`, `Graph 승격 금지`, `Reference 학습 금지`를
  항상 표시한다.
- `operational-hitl-pipeline-status/v1`는 `HITL Pipeline Status` 카드로 표시하고
  `CSV 판정 입력 대기`, `미입력 56건`, `작업표 59건`, `추천 59건`,
  `검토세션 4건`, `고위험 9건`, `재촬영 5건`, `Vision 후보 7건`,
  `Web 후보 43건`을 요약한다.
- Pipeline Status 카드의 안전 배지는 `Artifact-only`, `자동 적용 금지`,
  `Graph 승격 금지`, `Reference 학습 금지`, `Model 학습 금지`를 표시한다.
- `operational-hitl-decision-worktable-suggestion/v1`는 `HITL Worktable
  Suggestions` 카드로 표시하고 추천 59건, 재촬영 5건, Vision 후보 7건,
  Web 후보 43건, 검토필요 4건, 위험도 분포와 상위 row preview를 보여준다.
- Suggestion 카드는 `Suggestion-only`, `newAction 자동 입력 금지`, `자동 적용 금지`,
  `Graph 승격 금지`, `Model 학습 금지`를 표시한다.
- `operational-hitl-review-session-plan/v1`는 `HITL Review Session Plan` 카드로
  표시하고 전체 59건, 세션 4건, 고위험 9건, 세션별 row preview, copyableFields,
  manualConfirmationFields를 보여준다.
- Review Session 카드는 `Session-plan only`, `newAction 자동 입력 금지`,
  `자동 적용 금지`, `Graph 승격 금지`, `Model 학습 금지`를 표시한다.
- `operational-hitl-review-session-packet/v1`는 `HITL Review Session Packet`
  카드로 표시하고 세션별 CSV/Markdown 파일, 고위험 row, packet directory를
  보여준다.
- `operational-hitl-human-decision-brief/v1`는 `HITL Human Decision Brief`
  카드로 표시하고 현재 단계, 전체/완료/대기/오류/고위험 row 수, 다음 세션,
  다음 decision id, 원본 worktable CSV, 작업 순서, 다음 입력 row를 보여준다.
- Human Brief 카드는 `Brief-only`, `newAction 자동 입력 금지`, `자동 적용 금지`,
  `Graph 승격 금지`, `Model 학습 금지`를 표시한다.
- `mold-master-development-progress-report/v1`는 `Mold Master Development
  Progress` 카드로 표시하고 현재 phase, 소프트웨어/운영 진행률, Vision blocker,
  HITL 미입력, Web 승인대기, Vision Top-1/Top-3/촬영 프로토콜 병목, 다음 작업,
  stage preview를 보여준다.
- Development Progress 카드는 `Artifact-only`, `자동 적용 금지`, `Graph 승격 금지`,
  `Reference 학습 금지`, `Model 학습 금지`를 표시한다.

## 확인 결과

```text
npm run test:vision-operational-hitl-display
PASS 24
```

Settings의 `Vision 운영 작업 목록` 아래에는 `HITL Workflow` 카드가 표시되고,
다음 실행 명령으로 `npm run vision:hitl:verify-decisions -- --decisions
<filled-common-agent-hitl-decisions.json>`를 안내한다.

`Pipeline Status 등록` 버튼으로 최신
`artifacts/operational-hitl-pipeline-status-*.json`을 등록하면 `HITL Pipeline
Status` 카드가 표시된다. 현재 실제 상태는 소프트웨어 scaffold 100%, 운영 전환
0%, HITL decision 입력 56건 미완료, Vision Top-1 46.2% / Top-3 53.8% 병목이다.

`Progress 등록` 버튼으로 최신
`artifacts/mold-master-development-progress-report-*.json`을 등록하면
`Mold Master Development Progress` 카드가 표시된다. 현재 실제 상태는
소프트웨어 100%, 운영 0%, Vision blocker 8건, HITL 56건, Web 승인대기 40건,
Vision Top-1 46.2%, Top-3 53.8%, 촬영 프로토콜 0%, 다음 1순위
`승인 이미지 라벨 충돌 해결`이다. 이 카드는 진행 상황 설명과 stage preview를
제공하지만 자동 적용이나 Graph/Reference/Model 승격은 수행하지 않는다.

`Suggestion 등록` 버튼으로 최신
`artifacts/operational-hitl-decision-worktable-suggestion-*.json`을 등록하면
`HITL Worktable Suggestions` 카드가 표시된다. 이 카드는 추천 후보를 보여주지만
자동으로 승인하거나 CSV `newAction`을 채우지 않는다.

`Session Plan 등록` 버튼으로 최신
`artifacts/operational-hitl-review-session-plan-*.json`을 등록하면 `HITL Review
Session Plan` 카드가 표시된다. 이 카드는 세션별 우선 검토 순서와 사람이 확인할
필드를 보여주지만, 역시 자동 승인이나 CSV 수정을 수행하지 않는다.

`Session Packet 등록` 버튼으로 최신
`artifacts/operational-hitl-review-session-packet-*.json`을 등록하면 세션별
CSV/Markdown 경로를 볼 수 있다. `Human Brief 등록` 버튼으로 최신
`artifacts/operational-hitl-human-decision-brief-*.json`을 등록하면 현재 실제
상태인 `ready_for_human_entry`, 전체 59건, 완료 0건, 대기 59건, 고위험 9건,
다음 세션 `label_conflict_session`, 다음 decision `conflict-001`, 원본
worktable CSV 경로를 Settings에서 확인할 수 있다.
