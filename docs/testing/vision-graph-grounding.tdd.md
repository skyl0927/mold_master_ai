# Vision-Graph 교차검증 TDD 증거

작성일: 2026-07-24

## Source Plan

- `docs/vision-diagnosis-advancement-plan.md`
- Phase 4 GraphRAG 교차검증

## User Journeys

1. 품질 담당자는 Vision Top-3 각각이 어떤 승인 Graph 경로로 검증되었는지 확인할 수 있다.
2. 시방서 작성자는 승인 Graph 원인·대책만 확정 필드에 전달받는다.
3. 검토자는 Vision과 Graph가 충돌하거나 Graph 근거가 부족하면 자동으로 HITL 상태를 확인한다.
4. 데이터 관리자는 Graph 미검증 LLM 내용이 승인 학습 데이터로 유입되지 않았음을 지표로 확인한다.

## Test Specification

| 보장 동작 | 테스트 | 결과 |
| --- | --- | --- |
| Vision 후보별로 승인 Graph 경로를 별도 검색한다 | Common Agent `tests/test_vision_graph_grounding.py` | PASS |
| 승인되지 않은 노드·관계가 포함된 경로를 폐기한다 | Common Agent `tests/test_vision_graph_grounding.py` | PASS |
| 직접 매칭과 1~3 hop, 제품·공정·위치 문맥을 분리 점수화한다 | Common Agent `tests/test_vision_graph_grounding.py` | PASS |
| 제품군·부품·모델·위치 문맥이 불일치하면 승인 경로도 자동 확정하지 않는다 | Common Agent `tests/test_vision_graph_grounding.py` | PASS |
| 승인 경로의 Cause와 Action 노드만 원인·대책으로 추출한다 | Common Agent `tests/test_vision_graph_grounding.py` | PASS |
| Top-1은 미검증이고 다른 후보만 지지되면 Vision-Graph 충돌로 보류한다 | Common Agent `tests/test_vision_graph_grounding.py` | PASS |
| Graph 부재 시 LLM을 미검증·비학습 보조 영역으로 격리한다 | Common Agent `tests/test_vision_graph_grounding.py` | PASS |
| 실제 진단 엔드포인트가 후보별 Graph 검색과 시점별 계보 저장을 수행한다 | Common Agent `tests/test_vision_multiview_endpoint.py` | PASS |
| 앱은 승인 Graph 원인·대책만 시방서 필드에 매핑한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 앱은 Graph 미검증 LLM 내용을 원인·대책 필드에 넣지 않는다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| UI가 후보 점수, hop, 승인 경로, 원인·대책과 게이트 상태를 표시한다 | `scripts/electron-multimodal-diagnosis-smoke.js` | PASS |
| Graph 인용률·충돌률·자동 확정률·LLM 학습 누출을 집계한다 | `tests/commonAgentDocumentService.test.ts` | PASS |

## RED/GREEN Evidence

- Common Agent RED: `4510f59`, 교차검증 모듈 부재로 테스트 수집 실패
- Common Agent GREEN: `9d08691`, 순수 결정론적 교차검증 최초 6/6 PASS
- Common Agent endpoint RED: `f08f811`, 응답의 `graph_grounding`이 `None`
- Common Agent endpoint GREEN: `936da61`, 후보별 Graph 조회·게이트·저장 통합 PASS
- Graph 문맥 게이트 RED: `e337a9c`, 다른 제품·위치 경로가 `supported`로 통과
- Graph 문맥 게이트 GREEN: `f7afa99`, 특정 문맥 불일치 경로를 `weak`로 강등
- Mold Master RED: `0d9121c`, 승인 원인·대책 매핑 및 Graph 보류 사유 미반영
- Mold Master UI RED: `7251e95`, Graph 교차검증 패널 미표시
- Mold Master GREEN: `436b254`, 계약 33/33, TypeScript, build, Electron PASS
- 운영 지표 RED: `73ca7d1`, Graph 운영 지표 필드 부재
- 운영 지표 GREEN: `f734f8f`, Graph 안전·품질 지표 집계 PASS

## Known Operational Gap

실제 승인 현장 진단 세트가 아직 충분하지 않아 다음 수치는 소프트웨어 불변식이
아니라 운영 데이터로 추가 검증해야 한다.

- 최종 원인·대책 Graph 인용률 90% 이상
- 결함군별 Top-3 정확도 및 자동 확정 정확도
- 제품군·금형·공정 조건이 달라질 때의 Graph 문맥 점수 교정

운영 검증 전에는 현재 임계값을 완화하거나 미검증 LLM 결과를 자동 승인하지 않는다.
