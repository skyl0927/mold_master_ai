# Vision HITL Re-evaluation Gate Status TDD

작성일: 2026-07-27

## 목적

HITL 교정·재촬영 결과가 re-evaluation plan에만 남아 있으면 운영자가
Vision reference refresh 또는 legacy fallback retirement 전에 놓칠 수 있다.
통합 migration gate가 recheck 후보, 재촬영 대기, 보류, 차단 metadata를
직접 표시하고 승격을 fail-closed로 막도록 한다.

## RED

`tests/migrationGateStatus.test.js`에 re-evaluation plan이 포함된 상태에서
gate status가 `visionHitlReevaluation` 요약과 blocker를 반환해야 한다는
테스트를 추가했다.

실패 결과:

```text
npm run test:migration-gate-status
TypeError: Cannot read properties of undefined (reading 'readyForShadowRecheck')
```

## GREEN

구현 내용:

- `migrationGateStatus.js`가 `visionHitlReevaluationPlan`을 요약한다.
- recheck 후보가 있으면 `vision_hitl_recheck_required` blocker를 생성한다.
- 재촬영 대기가 있으면 `vision_hitl_recapture_required` blocker를 생성한다.
- pending HITL과 metadata 차단 건도 각각 blocker로 표시한다.
- `scripts/build-migration-gate-status.js`가
  `artifacts/vision-hitl-reevaluation-plan.json`을 sources와 console summary에
  포함한다.
- `types.ts`와 `DatabaseView`에 gate result UI 요약 카드를 추가했다.

## 검증

```powershell
npm run test:migration-gate-status
npx --no-install tsc --noEmit --pretty false
```

결과:

- `test:migration-gate-status`: 13/13 PASS
- `tsc --noEmit`: PASS

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | HITL recheck 후보는 통합 migration gate에서 운영 승격을 차단한다 | `tests/migrationGateStatus.test.js` | PASS |
| 2 | 재촬영 대기는 benchmark/reference refresh 전에 별도 blocker로 표시된다 | `tests/migrationGateStatus.test.js` | PASS |
| 3 | metadata 차단 사유는 `reasonCounts`와 함께 유지된다 | `tests/migrationGateStatus.test.js` | PASS |
| 4 | UI 타입과 DatabaseView summary card가 새 gate 필드를 수용한다 | `npx --no-install tsc --noEmit --pretty false` | PASS |

## 운영 의미

운영자는 benchmark 결과 화면의 `Vision HITL Re-evaluation` 카드에서 교정
recheck 후보, 재촬영 대기, HITL 보류, metadata 차단 건수를 확인할 수 있다.
이 값이 0이 아니면 자동 Graph/Reference 승격 또는 fallback retirement는
차단된다.
