# Vision Label Conflict Workflow Visibility TDD

작성일: 2026-07-27

## 목적

승인 라벨 충돌은 `packet -> decision-template -> verify-decisions -> apply
dry-run -> --apply -> post-HITL verification` 순서로 닫아야 한다. 이전에는
worklist 명령은 보였지만 readiness audit과 Settings UI에서 현재 단계가
명확히 보이지 않았다.

## RED

다음 테스트를 먼저 추가했다.

- `tests/visionOperationalReadinessAudit.test.js`
- `tests/visionOperationalBlockerWorklist.test.js`
- `tests/visionOperationalHitlWorkflowDisplay.test.js`

RED 결과:

```text
Cannot read properties of undefined (reading 'status')
summarizeVisionOperationalLabelConflictWorkflowDisplay is not a function
```

## GREEN 구현

추가/변경된 동작:

- `gates.labelConflictWorkflow`가 conflict packet, template, verification,
  apply report를 요약한다.
- `resolve_label_conflicts.workflowStatus`가 worklist와 Common Agent handoff
  item에 포함된다.
- `summarizeVisionOperationalLabelConflictWorkflowDisplay`가 Settings UI용
  status label, severity, summary text, next command를 만든다.
- Settings의 `Vision 운영 작업 목록`에 `Label Conflict Workflow` 카드가
  추가된다.

## 안전 정책

라벨 충돌 workflow는 사람이 판정하고 `--apply`를 승인하기 전까지 dry-run으로
멈춘다. Graph promotion, Reference learning, model training은 계속 금지된다.
로컬 fixture 반영 후에도 반드시 `npm run migration:verify-post-hitl`로 blocker가
닫혔는지 다시 검증해야 한다.
