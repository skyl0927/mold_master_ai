# Vision Decision Action Guidance TDD

작성일: 2026-07-27

## 목적

Vision 판정 사유를 단순히 표시하는 것만으로는 운영자가 다음 조치를 바로
결정하기 어렵다. Mold Master AI가 `image_quality_rejected`,
`dual_model_disagreement`, `insufficient_multiview_consensus` 같은 사유를
재촬영 품질 개선, VLM/Classifier 불일치 검토, 다중 시점 촬영 보강 조치로
변환하도록 한다.

## RED

계약 테스트에 `visionDecisionRecommendedActions` 기대값을 추가했다.

```text
npm run test:contracts
tests 58
pass 57
fail 1
TypeError: Cannot read properties of undefined (reading 'map')
```

Electron 전환 리포트 smoke에도 다음 기대값을 추가했다.

- 화면에 `Vision 권장 조치` 표시
- 화면에 `VLM/Classifier` 조치 설명 표시
- JSON 리포트에 `review_vision_decision_disagreement` action code 포함

## GREEN

구현 내용:

- `DiagnosisObservabilityAction`에 Vision decision action code를 추가했다.
- `visionDecisionRecommendedActions`를 `DiagnosisObservability`에 추가했다.
- `image_quality_rejected` 계열 사유는 재촬영 품질, 조명, 초점, ROI 해상도
  보정 조치로 변환한다.
- `dual_model_disagreement`와 classifier disagreement 계열 사유는
  VLM/Classifier 후보, ROI 위치, 라벨 alias 공동 검토 조치로 변환한다.
- `missing_view`, `insufficient_multiview`, `single_candidate` 계열 사유는
  전체/근접/사선광 필수 시점 보강 조치로 변환한다.
- 설정 모달의 진단 운영 관측성 패널에 `Vision 권장 조치` 박스를 추가했다.

## 검증

```powershell
npm run test:contracts
npm run test:electron:transition
```

결과:

- `test:contracts`: 58/58 PASS
- `test:electron:transition`: `hasVisionDecisionAction=true`,
  `hasVisionDecisionActionDetail=true`, `consoleErrors=[]`
- 전환 리포트 JSON:
  `visionDecisionRecommendedActions = ["review_vision_decision_disagreement"]`

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | 이미지 품질 거절 사유가 재촬영 품질 개선 조치로 변환된다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 2 | VLM/Classifier 불일치 사유가 공동 검토 조치로 변환된다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 3 | 설정 화면에 Vision 권장 조치가 표시된다 | `scripts/electron-transition-report-smoke.js` | PASS |
| 4 | 전환 리포트 JSON에 Vision action code가 포함된다 | `scripts/electron-transition-report-smoke.js` | PASS |

## 운영 의미

Vision AI가 확정하지 못한 이유가 운영 조치로 연결된다. 품질 문제는 재촬영
프로토콜 개선으로, 모델 불일치는 HITL 라벨/ROI 검토로, 다중 시점 부족은
촬영 세션 보강으로 이어진다. 이는 비전 AI를 맹신하지 않고 반복적으로
정확도를 올리는 폐루프 운영에 필요한 작은 피드백 엔진이다.
