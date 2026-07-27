# Vision HITL Re-evaluation Plan TDD

작성일: 2026-07-27

## 목적

HITL에서 사람이 교정한 Vision 결과는 바로 Graph 또는 reference learning으로
승격하지 않고, 동일 이미지를 blind Vision으로 다시 평가하는 shadow benchmark
후보가 되어야 한다. 재촬영 판정은 새 이미지가 들어오기 전까지 benchmark에서
제외하고 촬영 대기 상태로 남겨야 한다.

## RED

`tests/visionHitlReevaluationPlan.test.js`를 추가해 다음 계약을 먼저 요구했다.

실패 결과:

```text
node --test tests\visionHitlReevaluationPlan.test.js
Error: Cannot find module '../visionHitlReevaluationPlan'
```

## GREEN

구현 내용:

- `visionHitlReevaluationPlan.js`를 추가했다.
- `vision_review_re_evaluation_queue=vision_candidate_recheck` 항목은
  `ready_for_shadow_recheck` 상태와 benchmark case candidate로 변환한다.
- `vision_review_re_evaluation_queue=vision_recapture_required` 항목은
  `waiting_for_recapture` 상태로 분리하고 benchmark manifest에서 제외한다.
- 학습 후보 또는 Graph 승격 허용 값이 true인 교정 항목은 recheck manifest에서
  차단한다.
- `scripts/build-vision-hitl-reevaluation-plan.js`와
  `npm run vision:hitl:reeval-plan`을 추가해 Common Agent dataset rows에서
  plan과 `eval/vision-hitl-recheck/manifest.json`을 생성할 수 있게 했다.

## 검증

```powershell
npm run test:vision-hitl-reevaluation
npm run test:vision-reference-backfill-plan
npm run test:vision-reference-backfill-apply
```

결과:

- `test:vision-hitl-reevaluation`: 4/4 PASS
- `test:vision-reference-backfill-plan`: 3/3 PASS
- `test:vision-reference-backfill-apply`: 4/4 PASS

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | 교정 HITL metadata는 shadow Vision recheck benchmark 후보로 변환된다 | `tests/visionHitlReevaluationPlan.test.js` | PASS |
| 2 | 재촬영 HITL metadata는 새 이미지 전까지 benchmark에서 제외된다 | `tests/visionHitlReevaluationPlan.test.js` | PASS |
| 3 | recheck manifest에는 active 교정 후보만 들어간다 | `tests/visionHitlReevaluationPlan.test.js` | PASS |
| 4 | 이미지 ID, 해시, classifiable label, 안전 학습 flag가 불완전한 항목은 차단된다 | `tests/visionHitlReevaluationPlan.test.js` | PASS |

## 운영 명령

```powershell
$env:COMMON_AGENT_URL='http://218.151.133.137:5011'
npm run vision:hitl:reeval-plan
npm run eval:vision -- --manifest eval\vision-hitl-recheck\manifest.json --output artifacts\vision-hitl-recheck-benchmark-report.json
```

첫 번째 명령은 Common Agent에 쓰기 작업을 하지 않는다. 두 번째 benchmark도
별도 shadow 검증이며, 실패 사례를 다시 HITL/재촬영 큐로 돌린 뒤 승인된
데이터만 reference store refresh 대상으로 승격해야 한다.
