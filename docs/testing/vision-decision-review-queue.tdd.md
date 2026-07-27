# Vision Decision Review Queue TDD

작성일: 2026-07-27

## 목적

Vision 판정 권장 조치가 있어도 HITL 검토자가 어떤 샘플을 먼저 봐야 하는지
모르면 운영 루프가 느려진다. Mold Master AI가 Vision 보류/판정불가 사유를
우선순위가 있는 검토 큐로 변환하고, 샘플 이미지 ID를 설정 화면과 전환
리포트 JSON에 노출하도록 한다.

## RED

계약 테스트에 `visionDecisionReviewQueue` 기대값을 추가했다.

```text
npm run test:contracts
tests 58
pass 57
fail 1
visionDecisionReviewQueue: undefined
```

Electron 전환 리포트 smoke에도 다음 기대값을 추가했다.

- 화면에 `Vision 우선 검토` 표시
- 화면에 샘플 ID `image-2` 표시
- JSON 리포트에 `visionDecisionReviewQueue[0].sampleImageIds[0] = image-2`

## GREEN

구현 내용:

- `DiagnosisVisionDecisionReviewQueueItem`을 추가했다.
- `visionDecisionReviewQueue`를 `DiagnosisObservability`에 추가했다.
- `image_quality_rejected` 계열 사유는 priority 100/95로 품질 재촬영 큐에
  배치한다.
- `dual_model_disagreement`와 classifier disagreement 계열 사유는 priority
  90으로 VLM/Classifier 공동 검토 큐에 배치한다.
- `missing_view`, `insufficient_multiview`, `single_candidate` 계열 사유는
  priority 80으로 다중 시점 촬영 보강 큐에 배치한다.
- 확정 후보(`probable`)는 HITL 검토 큐에서 제외한다.
- 설정 모달에 `Vision 우선 검토` 박스를 추가하고 priority, 상태, 사유, 샘플
  이미지 ID를 표시한다.

## 검증

```powershell
npm run test:contracts
npm run test:electron:transition
```

결과:

- `test:contracts`: 58/58 PASS
- `test:electron:transition`: `hasVisionReviewQueue=true`,
  `hasVisionReviewQueueSample=true`, `consoleErrors=[]`
- 전환 리포트 JSON:
  `visionDecisionReviewQueue[0] = { priority: 90, actionCode: "review_vision_decision_disagreement", sampleImageIds: ["image-2"] }`

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | 품질 거절 샘플이 가장 높은 우선순위로 큐에 배치된다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 2 | 모델 불일치 샘플이 VLM/Classifier 검토 큐에 배치된다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 3 | 확정 후보는 HITL 검토 큐에서 제외된다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 4 | 설정 화면에 큐와 샘플 이미지 ID가 표시된다 | `scripts/electron-transition-report-smoke.js` | PASS |
| 5 | 전환 리포트 JSON에 큐와 샘플 이미지 ID가 포함된다 | `scripts/electron-transition-report-smoke.js` | PASS |

## 운영 의미

운영자는 이제 "Vision 보류"를 본 뒤 별도로 로그를 찾지 않아도 된다. 설정
화면과 전환 리포트에서 우선순위와 샘플 ID를 확인해 해당 이미지를 HITL 검토,
재촬영, 라벨/ROI 검토로 바로 연결할 수 있다.
