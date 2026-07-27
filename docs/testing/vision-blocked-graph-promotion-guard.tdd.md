# Vision Blocked Graph Promotion Guard TDD

작성일: 2026-07-27

## 목적

품질 반려 또는 판정 보류 Vision 결과는 결함 후보가 신뢰되지 않은 상태다.
이 상태에서 관리자 버튼이나 우회 호출로 `approved`가 전달되면 잘못된 후보가
Graph DB에 승격되어 이후 원인/대책 생성 전체를 오염시킬 수 있다.

## RED

계약 테스트에 `canPromoteVisionAnalysisToGraph` 기대값을 추가했다.

실패 결과:

```text
npm run test:contracts
No matching export in "services/visionHitlDecisionProtocol.ts" for import "canPromoteVisionAnalysisToGraph"
```

Electron negative-flow 스모크에는 관리자 모드에서 다음 기대값을 추가했다.

- `Graph 승격 차단`
- `승인·Graph 승격` 버튼 미노출

## GREEN

구현 내용:

- `visionHitlDecisionProtocol`에 `isVisionGraphPromotionBlocked`와
  `canPromoteVisionAnalysisToGraph`를 추가했다.
- `safetyGate.status=blocked`, `candidateUsePolicy=do_not_use_vision_candidate`,
  `decisionStatus=unclassifiable`이면 Graph 승격을 금지한다.
- `AnalysisModal`은 blocked Vision 결과에서 관리자 버튼을 비활성화하고
  `Graph 승격 차단`으로 표시한다.
- `App.handleTrainAI`도 동일 guard를 사용해 UI 우회 호출이 들어와도
  `promoteToGraph=true` 제출 전에 예외로 중단한다.

## 검증

```powershell
npm run test:contracts
npm run test:electron:vision-recapture-policy
```

결과:

- `test:contracts`: 59/59 PASS
- `test:electron:vision-recapture-policy`:
  `graphPromotionBlockedActionRendered=true`, `consoleErrors=[]`

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | `approved` 결정 자체는 기존 정책상 Graph 승격 의도를 가진다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 2 | blocked Vision 분석은 그 의도를 최종 Graph 승격으로 사용할 수 없다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 3 | 관리자 모달에서 blocked Vision 결과는 `Graph 승격 차단`으로 표시된다 | `scripts/electron-vision-recapture-policy-smoke.js` | PASS |
| 4 | blocked Vision 결과에서 `승인·Graph 승격` 버튼은 보이지 않는다 | `scripts/electron-vision-recapture-policy-smoke.js` | PASS |

## 운영 의미

비전 AI가 잘못 본 사진을 사람이 실수로 승인하거나 UI 외부 경로에서 승인
상태가 들어와도 Graph DB가 오염되지 않는다. 재촬영 또는 HITL 교정 확정 후에만
안전하게 지식화할 수 있다.
