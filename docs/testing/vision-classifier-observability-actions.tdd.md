# Vision Classifier Observability Actions TDD

작성일: 2026-07-27

## 목적

classifier 합의율, 불일치율, 참조 부족률은 숫자만으로는 운영자가 다음
행동을 바로 결정하기 어렵다. Mold Master AI가 observability 지표를 기반으로
HITL 검토, 촬영 프로토콜 점검, 승인 이미지 수집 같은 권장 조치를 생성하고
설정 화면에 표시하도록 한다.

## RED

계약 테스트에 `visionClassifierRecommendedActions` 기대값을 추가하자 다음처럼
실패했다.

```text
TypeError: Cannot read properties of undefined (reading 'map')
```

Electron 전환 리포트 smoke도 다음 상태로 실패했다.

```text
"hasClassifierAction": false
"reportClassifierActions": ["review_classifier_disagreement"]
```

즉 JSON에는 action 계산이 들어갈 수 있는 구조가 생겼지만, 화면에는 아직
권장 조치가 표시되지 않았다.

## GREEN

구현 내용:

- `DiagnosisObservabilityAction`을 추가했다.
- classifier 불일치율이 0보다 크면 `review_classifier_disagreement` 조치를
  생성한다.
- classifier 참조 부족률이 0보다 크면 `collect_classifier_references` 조치를
  생성한다.
- 합의율이 높고 평균 참조 수가 충분하면 shadow gate 유지/승격 검토 안내를
  생성할 수 있게 했다.
- 설정 모달의 진단 운영 관측성 패널에 `Classifier 권장 조치` 박스를 추가했다.
- Electron smoke가 화면 텍스트와 전환 리포트 JSON의 action code를 함께
  검증한다.

## 검증

```powershell
npm run test:contracts
npm run test:electron:transition
```

결과:

- `test:contracts`: 58/58 PASS
- `test:electron:transition`: `hasClassifierAction=true`, `consoleErrors=[]`

## 운영 의미

불일치가 보이면 VLM이나 Graph를 바로 신뢰하지 말고 촬영 프로토콜, ROI,
라벨 taxonomy alias를 먼저 점검한다. 참조 부족이 보이면 해당 결함군의 승인
이미지를 추가 수집하고 Common Agent reference store를 refresh한다. 이 흐름은
비전 정확도를 데이터 기반으로 올리기 위한 작은 운영 루프다.
