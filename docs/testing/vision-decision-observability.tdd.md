# Vision Decision Observability TDD

작성일: 2026-07-27

## 목적

비전 AI는 사진 문제점을 처음 관찰하는 "눈" 역할을 하므로, 자동 확정 여부뿐
아니라 왜 보류되었는지를 운영 지표로 추적해야 한다. Mold Master AI가 Vision
판정 상태와 보류 사유를 comparison record, 설정 화면, 전환 리포트 JSON에
보존하도록 한다.

## RED

계약 테스트에 다음 기대값을 추가했다.

- `visionProbableRate`, `visionNeedsReviewRate`, `visionUnclassifiableRate`
- `visionDecisionReasonTargets`
- `metricSamples.visionDecision`
- image gateway comparison record의 `visionDecisionReason`

첫 실행 결과:

```text
npm run test:contracts
tests 58
pass 56
fail 2
visionProbableRate: undefined
visionDecisionReason: undefined
```

서비스 구현 후에는 `needs_review` 상태의 사유가
`vision_classifier_agreement`로 저장되는 문제가 드러났다. classifier가 합의한
상태에서도 classifier decision reason이 보류 사유를 덮고 있었기 때문이다.

Electron 전환 리포트 smoke에는 화면 기대값을 추가했다.

```text
hasVisionDecisionMetric=false
hasVisionDecisionReason=false
reportVisionNeedsReviewRate=50
```

JSON에는 지표가 들어갔지만 UI에는 아직 표시되지 않는 의도한 RED였다.

## GREEN

구현 내용:

- `DiagnosisComparisonRecord`에 `visionDecisionReason`을 추가했다.
- `DiagnosisObservability`에 Vision 확정률, 보류율, 판정불가율과
  `visionDecisionReasonTargets`를 추가했다.
- 보류/판정불가 사유는 상태 우선순위에 따라 그룹핑하고 샘플 이미지 ID를
  보존한다.
- Common Agent 응답 결합부에서 Graph, classifier, fusion, 기본 Vision
  사유의 우선순위를 명시했다.
- classifier가 실제 검토를 요구하지 않는 경우에는 classifier agreement
  reason이 보류 사유를 오염시키지 않도록 guard를 수정했다.
- generic `vision_safety_gate_requires_review`는 상세 safety reason으로
  풀리도록 유지했다.
- 설정 모달의 진단 운영 관측성 패널에 `Vision 확정`, `Vision 보류`,
  `Vision 판정불가`, `Vision 판정 사유`를 추가했다.

## 검증

```powershell
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
npm run test:electron:transition
```

결과:

- `test:contracts`: 58/58 PASS
- `tsc --noEmit`: PASS
- `test:electron:transition`: `hasVisionDecisionMetric=true`,
  `hasVisionDecisionReason=true`, `consoleErrors=[]`

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | Vision 판정 상태별 확정/보류/판정불가 비율을 계산한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 2 | 보류 사유를 상태별로 그룹핑하고 샘플 이미지 ID를 보존한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 3 | image gateway가 최종 Vision decision reason을 comparison record에 저장한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 4 | classifier agreement reason이 보류 사유를 덮지 않는다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 5 | 설정 화면과 전환 리포트 JSON에서 Vision 보류율과 사유를 확인할 수 있다 | `scripts/electron-transition-report-smoke.js` | PASS |

## 운영 의미

운영자는 이제 "비전이 왜 확정하지 않았는지"를 숫자와 사유로 볼 수 있다.
예를 들어 `dual_model_disagreement`가 많으면 VLM/classifier 라벨 충돌을 먼저
점검하고, `image_quality_rejected`가 많으면 촬영 품질 게이트와 재촬영 안내를
보강한다. 이 지표는 비전 AI를 무조건 신뢰하지 않고 오판 가능성을 드러내는
안전 계층이다.
