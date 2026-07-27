# Vision Pending HITL Authorization Bridge TDD

작성일: 2026-07-27

## Source Plan

사용자 목표인 Vision 데이터 확보/HITL 검증/Common Agent 전달/재검증 운영
루프 중, 검증 완료된 HITL decision report를 기존 `vision:hitl:approve`
authorization 입력으로 안전하게 연결하는 단계를 구현했다.

## User Journeys

- 운영자는 Common Agent가 반환한 HITL 판정 검증 보고서에서 승인 후보만 실제
  live approval 입력 파일로 변환하고 싶다.
- 운영자는 검토가 끝나지 않았거나 packet 바인딩이 맞지 않는 경우 자동 승인,
  Graph 승격, reference learning이 차단되기를 원한다.
- 운영자는 보류, 반려, 재촬영 판정이 승인 파일에 섞이지 않고 별도 운영 조치로
  남기를 원한다.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | `ready_for_manual_import` 보고서의 `approve_candidate`만 `I_CONFIRM_EACH_IMAGE_AND_LABEL` authorization으로 변환된다. | `tests/visionPendingHitlAuthorizationBridge.test.js` | unit/contract | PASS | `npm run test:vision-hitl-authorization-bridge` |
| 2 | 생성된 authorization은 기존 `validateVisionHitlAuthorization()` 검증을 통과한다. | `tests/visionPendingHitlAuthorizationBridge.test.js` | integration contract | PASS | `npm run test:vision-hitl-authorization-bridge` |
| 3 | decision verification status가 준비 완료가 아니면 authorization을 만들지 않는다. | `tests/visionPendingHitlAuthorizationBridge.test.js` | fail-closed contract | PASS | `npm run test:vision-hitl-authorization-bridge` |
| 4 | 승인 hash가 review manifest에 없으면 `authorization_target_mismatch`로 차단한다. | `tests/visionPendingHitlAuthorizationBridge.test.js` | fail-closed contract | PASS | `npm run test:vision-hitl-authorization-bridge` |
| 5 | 보류, 반려, 재촬영 판정은 authorization targets에 포함하지 않고 `nonApprovalDecisions`에 보존한다. | `tests/visionPendingHitlAuthorizationBridge.test.js` | safety contract | PASS | `npm run test:vision-hitl-authorization-bridge` |
| 6 | readiness/worklist/Settings HITL Workflow는 검증 완료 상태에서 새 authorization bridge 명령을 다음 단계로 안내한다. | `tests/visionOperationalReadinessAudit.test.js`, `tests/visionOperationalBlockerWorklist.test.js`, `tests/visionOperationalHitlWorkflowDisplay.test.js` | workflow contract | PASS | `npm run test:vision-operational-readiness`, `npm run test:vision-operational-worklist`, `npm run test:vision-operational-hitl-display` |

## RED/GREEN Evidence

- RED: `npm run test:vision-hitl-authorization-bridge` 실패. 원인:
  `Cannot find module '../visionPendingHitlAuthorizationBridge'`.
- GREEN: 같은 명령에서 4개 테스트 모두 통과.
- 운영 안내 RED: readiness/worklist 테스트가 기존 `vision:hitl:prepare` 명령을
  반환해 실패했다.
- 운영 안내 GREEN: readiness/worklist/Settings display가
  `vision:hitl:authorization-bridge`를 다음 명령으로 표시하며 통과했다.

## Known Gaps

- 이 브리지는 로컬 artifact와 authorization JSON만 생성하며 Common Agent,
  Graph DB, reference dataset에 직접 쓰지 않는다.
- 실제 live approval 실행은 운영자가 생성된 authorization을 확인한 뒤
  `npm run vision:hitl:approve -- --authorization <authorization-json>`로 별도
  실행해야 한다.
- 현재 PC에는 아직 사람이 채운 HITL decision 파일이 없으므로 실제 승인 import는
  대기 상태다.
