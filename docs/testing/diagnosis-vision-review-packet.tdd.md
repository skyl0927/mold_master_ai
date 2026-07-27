# Diagnosis Vision Review Packet TDD

작성일: 2026-07-27

## 목적

진단 운영 관측성의 `Vision 우선 검토` 큐를 사람이 보기만 하는 수준에서
Common Agent/HITL가 후속 처리할 수 있는 경량 패킷으로 변환한다. 이 패킷은
이미지 파일을 복사하거나 Graph에 쓰지 않고, imageId와 comparisonId를 통해
후속 조회/검토를 연결하는 안전한 handoff 구조다.

## RED

계약 테스트에 `buildDiagnosisVisionReviewPacket` 기대값을 추가했다.

```text
npm run test:contracts
ERROR: No matching export in "services/commonAgentGateway.ts"
for import "buildDiagnosisVisionReviewPacket"
```

Electron 전환 리포트 smoke에는 JSON 내보내기 안의
`diagnosisVisionReviewPacket` 기대값을 추가했다.

## GREEN

구현 내용:

- `DiagnosisVisionReviewPacket`과 `DiagnosisVisionReviewPacketItem` 타입을
  추가했다.
- `buildDiagnosisVisionReviewPacket(records, observability, generatedAt)`를
  추가했다.
- `visionDecisionReviewQueue`의 priority/action/reason/sample image ID를
  comparison record와 결합해 `imageId`, `comparisonId`, `selectedSource`,
  `strategy`, defect/classifier candidate, 촬영 컨텍스트를 보존한다.
- 패킷 policy는 `persistence: none`,
  `graphPromotion: disabled_until_hitl_approval`,
  `commonAgentReviewRequired: true`로 고정했다.
- 설정 화면의 `JSON 내보내기`가 전환 리포트에
  `diagnosisVisionReviewPacket`을 포함한다.

## 검증

```powershell
npm run test:contracts
npm run test:electron:transition
```

결과:

- `test:contracts`: 58/58 PASS
- `test:electron:transition`: `reportVisionReviewPacketSchema`가
  `diagnosis-vision-review-packet/v1`, `consoleErrors=[]`

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | Vision 검토 큐가 Common Agent/HITL용 경량 패킷으로 변환된다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 2 | 패킷은 쓰기/Graph 승격을 금지하고 사람 검토를 요구한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 3 | 품질 거절/모델 불일치 샘플의 imageId와 comparisonId가 보존된다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 4 | 전환 리포트 JSON에 review packet이 포함된다 | `scripts/electron-transition-report-smoke.js` | PASS |

## 운영 의미

전환 리포트만 전달해도 Common Agent 또는 HITL 담당자는 어떤 진단 결과를
먼저 검토해야 하는지, 어떤 조치를 취해야 하는지, 어떤 imageId/comparisonId를
조회해야 하는지 알 수 있다. 아직 자동 저장이나 Graph 승격은 하지 않으므로
학습 오염 위험 없이 cowork handoff를 준비한다.
