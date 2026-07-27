# Vision HITL Recheck Post-check TDD

작성일: 2026-07-27

## 목적

HITL 교정 건을 shadow Vision benchmark로 다시 평가한 뒤, 통과/실패/재촬영
대상을 사람이 수동으로 해석하지 않도록 후속 검증 게이트를 만든다. 통과한
건도 사람 승인 전에는 자동 학습 또는 Graph 승격하지 않는다.

## RED

`tests/visionHitlReevaluationPostCheck.test.js`를 추가해 benchmark 결과를
분류하는 모듈을 먼저 요구했다.

실패 결과:

```text
node --test tests\visionHitlReevaluationPostCheck.test.js
Error: Cannot find module '../visionHitlReevaluationPostCheck'
```

또한 `tests/migrationGateStatus.test.js`에 post-check 결과가 통합 gate
blocker로 표시되어야 한다는 테스트를 추가했다.

실패 결과:

```text
npm run test:migration-gate-status
TypeError: Cannot read properties of undefined (reading 'readyForHumanApproval')
```

## GREEN

구현 내용:

- `visionHitlReevaluationPostCheck.js`를 추가했다.
- Top-1/Top-3 일치, accepted prediction, unsafe error 없음, 품질 통과,
  Vision contract 통과, 촬영 protocol 통과를 모두 만족한 건만
  `passed_shadow_recheck`로 분류한다.
- 통과 건은 `humanApprovalCandidate`만 만들고 `serviceWriteAllowed=false`,
  `promote_to_graph=false`, `fine_tuning_auto_start_allowed=false`를 유지한다.
- unsafe accepted error, Top-1 불일치, 품질 reject, 촬영 protocol 미준비,
  benchmark 결과 누락은 각각 HITL/재촬영/누락 blocker로 분리한다.
- `vision:hitl:reeval-verify` CLI를 추가해 plan과 benchmark report를 읽고
  `artifacts/vision-hitl-reevaluation-post-check-*.json`을 생성한다.
- migration gate와 DatabaseView가 post-check 결과를 읽고, 사람 승인 후보와
  실패/재촬영/위험 오판/결과 누락 건수를 표시한다.

## 검증

```powershell
npm run test:vision-hitl-reevaluation-post-check
npm run test:vision-hitl-reevaluation
npm run test:migration-gate-status
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
npm run build
```

결과:

- `test:vision-hitl-reevaluation-post-check`: 3/3 PASS
- `test:vision-hitl-reevaluation`: 4/4 PASS
- `test:migration-gate-status`: 14/14 PASS
- `test:contracts`: 60/60 PASS
- `tsc --noEmit`: PASS
- `build`: PASS

## 운영 명령

```powershell
$env:COMMON_AGENT_URL='http://218.151.133.137:5011'
npm run vision:hitl:reeval-plan
npm run eval:vision -- --manifest eval\vision-hitl-recheck\manifest.json --output artifacts\vision-hitl-recheck-benchmark-report.json
npm run vision:hitl:reeval-verify
npm run migration:gate-status
```

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | 깨끗하게 통과한 recheck만 사람 승인 후보가 된다 | `tests/visionHitlReevaluationPostCheck.test.js` | PASS |
| 2 | 위험 오판, 품질 reject, 결과 누락은 학습 후보가 되지 않는다 | `tests/visionHitlReevaluationPostCheck.test.js` | PASS |
| 3 | 모든 후보가 깨끗하게 통과해도 사람 승인 전에는 reference refresh ready가 아니다 | `tests/visionHitlReevaluationPostCheck.test.js` | PASS |
| 4 | post-check 결과는 migration gate blocker와 UI summary로 표시된다 | `tests/migrationGateStatus.test.js`, `tsc --noEmit` | PASS |

## 운영 의미

Vision AI가 사람이 교정한 정답을 다시 맞히는지 확인한 뒤에만 reference
learning 검토 후보로 보낼 수 있다. 그래도 최종 승인은 사람에게 남겨 두므로,
재평가 통과가 곧 자동 학습이나 Graph 승격으로 이어지지 않는다.
