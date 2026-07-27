# Vision Operational HITL Workflow Status TDD

작성일: 2026-07-27

## 목적

운영 readiness audit과 blocker worklist가 미해결 HITL 상태를 단순
`human_review_required` 숫자로만 보여주지 않고, 실제 후속 실행 경로인
queue packet, decision template, decision verification 상태까지 함께 노출한다.

## RED

테스트 파일:

- `tests/visionOperationalReadinessAudit.test.js`
- `tests/visionOperationalBlockerWorklist.test.js`

추가한 RED 보장:

- readiness audit은 `gates.hitlWorkflow`에 queue/template/verification 상태를
  노출해야 한다.
- blocker worklist의 `close_hitl_reviews` task는 새 HITL 명령 흐름과
  `workflowStatus`를 포함해야 한다.

초기 실패:

```text
Cannot read properties of undefined (reading 'status')
```

## GREEN

구현 파일:

- `visionOperationalReadinessAudit.js`
- `visionOperationalBlockerWorklist.js`
- `scripts/build-vision-operational-readiness-audit.js`

검증 기준:

- `gates.hitlWorkflow.status`가 `awaiting_human_review`,
  `decision_template_missing`, `invalid_decisions`,
  `ready_for_manual_import` 같은 세부 상태를 표현한다.
- queue, template, verification 각각의 카운트를 보존한다.
- `nextCommand`와 `nextActionKo`를 제공해 다음 사람이 어떤 명령을 실행할지
  바로 알 수 있다.
- worklist의 `close_hitl_reviews`는 다음 명령을 순서대로 안내한다:
  `vision:hitl:pending-packet`, `vision:hitl:decision-template`,
  `vision:hitl:verify-decisions`, `vision:hitl:prepare`,
  `vision:hitl:approve`, `migration:verify-post-hitl`.
- Common Agent handoff item에도 같은 `workflowStatus`가 포함된다.

## 실제 운영 데이터 확인

현재 PC artifact 기준:

```powershell
npm run vision:hitl:pending-packet
npm run vision:hitl:decision-template
npm run vision:hitl:verify-decisions
npm run vision:operational:readiness
npm run vision:operational:worklist
```

확인 결과:

```text
gates.hitlWorkflow.status=awaiting_human_review
queue.pendingHighConfidence=12
template.decisionsPrepared=12
verification.pendingQueueItems=12
nextCommand=npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>
```

해석: 현재 소프트웨어 흐름은 연결됐지만, 실제 사람이 작성한 판정 파일이 없어서
운영 승격은 계속 차단된다.
