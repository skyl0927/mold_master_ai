# Vision Classifier Agreement Gate TDD

작성일: 2026-07-27

## 목적

비전 AI가 사진의 문제 특징을 잘못 인식하면 Graph/RAG가 아무리 정확해도
잘못된 결함 후보의 원인과 대책을 확정할 수 있다. 이를 막기 위해 Common
Agent가 제공하는 참조 이미지 분류기 결과를 Mold Master AI에서 다시
정규화하고, VLM Top-1 후보와 classifier Top-1 후보가 합의하지 않으면
Graph 자동 확정을 차단한다.

## 사용자 여정

품질 담당자는 사진 기반 진단 결과를 시방서나 제품 검토서에 넣기 전에,
VLM의 결함 후보와 승인 이미지 기반 classifier 후보가 서로 맞는지 확인하고
싶다. 둘이 불일치하면 Graph 경로가 있더라도 원인/대책을 확정 출력하지
않고 HITL 검토로 보내야 한다.

## RED

추가한 계약 테스트가 다음처럼 실패했다.

```text
Vision classifier disagreement blocks Graph finalization even when Graph grounding exists
actual: '백화'
expected: '판정 보류 (백화 후보 검토 필요)'
```

이 실패는 Mold Master AI가 `classifier_report`를 해석하지 않아, classifier
Top-1이 `웰드라인`인데도 VLM/Graph 후보 `백화`를 확정하는 상태였음을
보여준다.

## GREEN

구현 내용:

- Common Agent 진단 응답의 `classifier_report`를 Mold Master에서 정규화한다.
- classifier Top-1, confidence, reference count, support image ids, embedding
  model lineage를 `visionSummary.classifierSummary`에 보존한다.
- VLM Top-1과 classifier Top-1이 불일치하면
  `vision_classifier_disagreement`로 사람 검토를 요구한다.
- classifier 참조 수가 최소 기준보다 부족하면
  `vision_classifier_insufficient_reference`로 사람 검토를 요구한다.
- classifier가 review를 요구하면 Graph grounding이 있더라도
  `autoFinalizeAllowed=false`로 바꾸고 원인/대책 본문 출력을 비운다.
- 공통 `visionDiagnosisGuard`도 classifier summary를 이해하게 하여 변환 경로
  밖에서도 같은 fail-closed 동작을 유지한다.

## 검증

```powershell
npm run test:vision-diagnosis-guard
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
```

결과:

- `test:vision-diagnosis-guard`: 5/5 PASS
- `test:contracts`: 58/58 PASS
- `tsc --noEmit`: PASS

## 남은 과제

현재 변경은 classifier 결과를 받아 안전하게 사용하는 Mold Master 쪽 계약이다.
실제 정확도 향상은 Common Agent가 충분한 승인 다중 시점 이미지로
DINOv2/SigLIP2 reference store를 refresh하고, 운영 benchmark gate를 통과한
뒤 실측해야 한다.
