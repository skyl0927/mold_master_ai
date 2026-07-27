# Vision HITL Re-evaluation Metadata TDD

작성일: 2026-07-27

## 목적

Vision AI가 사람의 눈 역할을 할 때 오판 가능성은 항상 남는다. HITL에서
교정 또는 재촬영으로 판정된 이미지는 Graph 승격이나 학습 후보가 아니라
재평가 큐로 이동해야 한다. 이 계약을 Mold Master AI와 Common Agent 사이의
review metadata로 명확히 전달한다.

## RED

계약 테스트에 `buildVisionHitlReviewMetadata` 기대값을 추가했다.

실패 결과:

```text
npm run test:contracts
No matching export in "services/visionHitlDecisionProtocol.ts" for import "buildVisionHitlReviewMetadata"
```

## GREEN

구현 내용:

- `visionHitlDecisionProtocol`에 `buildVisionHitlReviewMetadata`를 추가했다.
- `corrected` 판정은 `queue_re_evaluation` 및
  `vision_candidate_recheck`로 라우팅한다.
- `recapture` 판정은 `request_recapture` 및
  `vision_recapture_required`로 라우팅한다.
- blocked Vision 분석은 `vision_graph_promotion_allowed=false`와
  차단 사유를 metadata에 포함한다.
- `App.handleTrainAI`의 Common Agent review payload에
  `vision-hitl-review/v1` metadata를 포함한다.
- Electron HITL 스모크는 승인 경로의 실제 request body에
  review protocol, next action, queue, Graph 승격 허용, 학습 적격 값이
  포함되는지 검증한다.

## 검증

```powershell
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
npm run test:electron:hitl
```

결과:

- `test:contracts`: 60/60 PASS
- `tsc --noEmit`: PASS
- `test:electron:hitl`: `reviewProtocolAttached=true`,
  `reviewNextAction=promote_to_graph`, `reviewQueue=none`,
  `graphPromotionAllowed=true`, `learningCandidateEligible=true`,
  `consoleErrors=[]`

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | 교정된 Vision 결과는 Graph 승격이 아니라 재평가 큐로 라우팅된다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 2 | 재촬영 판정은 추가 촬영 요구와 품질 우려를 metadata에 보존한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 3 | blocked Vision 결과는 HITL 상태와 무관하게 Graph 승격 허용 값이 false다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 4 | 실제 Electron 승인 흐름의 Common Agent review payload에 `vision-hitl-review/v1` metadata가 포함된다 | `scripts/electron-hitl-review-smoke.js` | PASS |

## 운영 의미

Common Agent는 Mold Master AI의 HITL 결과를 단순 텍스트 코멘트가 아니라
구조화된 재평가 지시로 해석할 수 있다. 따라서 교정·재촬영·보류 결과가
승인 학습 데이터나 Graph 원인/대책 지식으로 섞이는 위험을 줄인다.
