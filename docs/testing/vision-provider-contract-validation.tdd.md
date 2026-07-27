# Vision Provider Contract Validation TDD

작성일: 2026-07-27

## 목적

Vision AI는 사진에서 문제 특징을 읽는 첫 번째 품질 게이트다. 이 단계의
출력이 스키마를 벗어나거나 설명문 형태로 무너졌는데도 앱이 관대하게
복구하면, 잘못된 결함 후보가 Graph/RAG 추론과 보고서 작성까지 전파될 수
있다.

따라서 provider에서 받은 원문 응답은 기존 일반 파서가 아니라 런타임 계약
검증 파서를 통과해야 한다. 계약 위반 시에는 후보를 자동 복구하지 않고
`unclassifiable`로 차단해 사람 검토 또는 재촬영으로 전환한다.

## RED

초기 테스트 추가 시점의 실패:

```text
TypeError: parseProviderVisionObservationText is not a function
```

필요한 실패 케이스:

- 스키마를 만족하는 `vision-observation/v2` JSON은 정상 후보를 유지한다.
- 필수 필드 누락 또는 enum 위반은 `provider_contract_invalid`로 차단한다.
- JSON이 아닌 provider 응답은 `provider_contract_json_parse_failed`로 차단한다.
- 차단된 응답의 후보는 Graph 검색과 자동 진단에 사용하지 않는다.

## GREEN

구현 방향:

- `VISION_OBSERVATION_JSON_SCHEMA`를 런타임 검증에도 재사용한다.
- provider 전용 파서 `parseProviderVisionObservationText`를 추가한다.
- 계약 위반 시 `providerContractValid=false`,
  `providerContractErrors[]`, `provider_contract_invalid`를 기록한다.
- 차단 상태에서는 `candidates=[]`, `decisionStatus=unclassifiable`,
  `candidateUsePolicy=do_not_use_vision_candidate`를 반환한다.
- AI 분석 진입점은 일반 복구 파서 대신 provider 전용 파서를 사용한다.

## 검증

```powershell
npm run test:vision-observation
npm run test:vision-diagnosis-guard
npm run test:vision-structured-output
```

## 운영 의미

이 변경은 Vision 모델의 정확도를 직접 높이는 기능은 아니다. 대신 모델 출력
형식이 깨졌거나 필수 관찰 근거가 빠졌을 때, 틀린 후보를 그럴듯하게 복원하지
않고 Graph/RAG 단계로 넘기지 않는 안전장치다. 실제 정확도 개선은 승인 이미지
데이터셋, 다중 촬영 프로토콜, 폐쇄형 이미지 분류기, HITL 회귀 평가와 함께
진행해야 한다.
