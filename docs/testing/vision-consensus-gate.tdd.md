# Vision Consensus Gate TDD

작성일: 2026-07-27

## 목적

비전 AI는 사진에서 문제 특징을 보는 첫 번째 눈이지만, 이 판단이 틀리면
Graph/RAG와 보고서까지 모두 잘못 이어질 수 있다. 따라서 V2 Vision 후보가
아무리 신뢰도 높게 보이더라도 Graph 근거 또는 classifier/Graph 교차 검증이
없으면 원인·대책을 LLM 단독으로 확정하지 않도록 `vision-consensus-gate/v1`
계약을 추가했다.

## 사용자 여정

품질 담당자는 사진 기반 AI 진단 결과를 제품 검토서나 수개조 시방서에 넣기
전에, Vision 후보가 Graph 근거와 충돌하지 않는지 확인하고 싶다. Graph
근거가 없거나 classifier가 불일치하면 원인·대책 문장은 비워지고 HITL
검토로 넘어가야 한다.

## RED

추가한 테스트는 처음에 다음 의도된 실패로 시작했다.

```text
Cannot find module '../visionConsensusGate'
```

이후 로컬 Graph 보존 회귀 테스트는 다음처럼 실패했다.

```text
actual: '판정 보류 (백화 후보 검토 필요)'
expected: '백화'
```

이는 새 합의 게이트가 Common Agent Graph validation이 없는 로컬 Graph 근거를
모두 보류로 처리할 위험을 보여줬다.

## GREEN

구현 내용:

- `visionConsensusGate.js`에서 Vision, Graph, classifier 결과를 하나의
  `accepted / needs_review / blocked` 게이트로 요약한다.
- V2 Vision 단독 결과는 `missing_graph_grounding`으로 원인·대책 확정을
  막는다.
- Graph가 `visionGraphConflict=true`이면 `autoFinalizeAllowed=true`가
  실수로 들어와도 최종 확정을 차단한다.
- classifier 불일치, 참조 부족, unavailable 상태는 Graph 근거가 있어도
  HITL 검토로 보낸다.
- 로컬 Graph 검색 결과가 Vision 후보와 일치하고 원인·대책 경로가 있으면
  간이 Graph validation으로 기존 로컬 Graph-first 경로를 유지한다.
- 분석 모달에 `Vision Consensus Gate` 블록을 추가해 Graph 검색, 최종 확정,
  LLM 보조 허용 여부와 1차 사유를 표시한다.

## 검증

```powershell
npm run test:vision-consensus-gate
npm run test:vision-diagnosis-guard
npm run test:contracts
```

결과:

- `test:vision-consensus-gate`: 5/5 PASS
- `test:vision-diagnosis-guard`: 7/7 PASS
- `test:contracts`: 62/62 PASS

## 남은 과제

이번 변경은 안전 게이트와 UI 가시성이다. 실제 정확도 향상은 승인 이미지
reference store, 클래스별 촬영 세션 수, hard-negative 세트, Common Agent의
vision classifier benchmark 품질을 올려야 달성된다.
