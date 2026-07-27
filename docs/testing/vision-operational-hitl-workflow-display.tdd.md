# Vision Operational HITL Workflow Display TDD

작성일: 2026-07-27

## 목적

운영 readiness/worklist에 연결된 HITL workflow 상태를 Settings 화면에서 바로
확인할 수 있게 한다. 운영자는 artifact JSON을 직접 열지 않아도 queue 수,
template 수, 미판정 수, 오류 수, 다음 명령, 안전 정책을 확인할 수 있어야 한다.

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
- 안전 배지는 `자동 적용 금지`, `Graph 승격 금지`, `Reference 학습 금지`를
  항상 표시한다.

## 확인 결과

```text
npm run test:vision-operational-hitl-display
PASS 3
```

Settings의 `Vision 운영 작업 목록` 아래에는 `HITL Workflow` 카드가 표시되고,
다음 실행 명령으로 `npm run vision:hitl:verify-decisions -- --decisions
<filled-common-agent-hitl-decisions.json>`를 안내한다.
