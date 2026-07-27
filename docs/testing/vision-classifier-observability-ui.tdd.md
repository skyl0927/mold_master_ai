# Vision Classifier Observability UI TDD

작성일: 2026-07-27

## 목적

classifier 합의율과 불일치율이 service 지표에만 있으면 현장 사용자가 다음
행동을 정하기 어렵다. 설정 모달의 전환/관측성 패널과 JSON 전환 리포트에서
classifier 합의 상태를 바로 확인할 수 있게 한다.

## RED

Electron 전환 리포트 smoke에 classifier 지표가 포함된 비교 기록을 넣고
`Classifier 합의` 문구를 확인하도록 변경했다. 구현 전에는 다음 상태로
실패했다.

```text
"hasClassifierMetric": false
"reportClassifierAgreementRate": 50
"reportClassifierDisagreementRate": 50
"reportClassifierAverageReferenceCount": 4
```

즉 JSON 리포트에는 classifier 지표가 이미 계산되지만, 설정 화면에는 표시되지
않았다.

## GREEN

구현 내용:

- 설정 모달의 `진단 운영 관측성` 패널에 `Classifier 합의`, `Classifier 불일치`,
  `참조 부족`, `평균 참조` 지표를 추가했다.
- classifier 측정 샘플이 없는 경우 기존 UI처럼 `-`로 표시한다.
- 불일치율 또는 참조 부족률이 0보다 크면 amber 색상으로 위험 신호를 표시한다.
- Electron smoke가 화면 텍스트와 JSON 전환 리포트의 classifier 값을 함께
  검증한다.

## 검증

```powershell
npm run test:electron:transition
```

결과:

- `hasClassifierMetric`: true
- `reportClassifierAgreementRate`: 50
- `reportClassifierDisagreementRate`: 50
- `reportClassifierAverageReferenceCount`: 4
- `consoleErrors`: []

## 운영 의미

이제 사용자는 Common Agent 전환 준비도와 함께 VLM/classifier 합의 품질을
같은 화면에서 볼 수 있다. 불일치율이 높으면 자동 확정을 늘리기보다 HITL
검토와 촬영 프로토콜 점검을 우선하고, 참조 부족률이 높으면 해당 결함군의
승인 이미지 수집을 먼저 진행해야 한다.
