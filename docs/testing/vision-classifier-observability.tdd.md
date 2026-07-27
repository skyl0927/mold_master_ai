# Vision Classifier Observability TDD

작성일: 2026-07-27

## 목적

VLM과 승인 이미지 classifier의 합의 게이트가 있어도, 운영 지표에 남지 않으면
어떤 결함군에서 비전 AI가 흔들리는지 알 수 없다. Mold Master AI의 진단 비교
기록과 observability 집계에 classifier 합의 상태를 남겨 HITL 검토, 데이터
수집, Common Agent reference refresh 우선순위를 정할 수 있게 한다.

## RED

추가한 계약 테스트가 다음처럼 실패했다.

```text
diagnosis observability summarizes latency, graph usage, context, sources, and failures
actual: undefined
expected: 33.3
```

추가 gateway 테스트도 Common Agent가 `classifier_report`를 반환해도
`result.comparison.visionClassifierStatus`가 `undefined`로 남아 실패했다.

## GREEN

구현 내용:

- `DiagnosisComparisonRecord`에 classifier 상태, VLM Top-1 합의 여부, Top-1
  classifier 후보, 참조 이미지 수, 최소 참조 기준을 저장한다.
- `CommonAgentGateway.diagnoseImage`가 선택된 분석의
  `visionSummary.classifierSummary`를 comparison record에 복사한다.
- `calculateDiagnosisObservability`가 classifier 합의율, 불일치율,
  참조 부족률, 평균 참조 수를 계산한다.
- metric sample에 `visionClassifier` 측정 수를 추가해 지표 분모를 명확히
  확인할 수 있게 한다.

## 검증

```powershell
npm run test:contracts
```

결과:

- `test:contracts`: 58/58 PASS

추가 최종 검증은 구현 커밋 전 `tsc --noEmit`과 `npm run build`로 함께 수행한다.

## 운영 의미

이 지표는 모델 정확도를 직접 높이지 않는다. 대신 어떤 시점부터 안전하게
Graph 자동 확정을 늘릴 수 있는지, 또는 어느 결함군에 승인 이미지가 부족한지
보이게 만든다. 특히 `visionClassifierDisagreementRate`가 높으면 촬영 품질,
라벨 taxonomy, reference 이미지 다양성부터 재점검해야 한다.
