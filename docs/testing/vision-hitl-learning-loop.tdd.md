# Vision HITL 학습 루프 TDD 증거

작성일: 2026-07-24

## Source Plan

- `docs/vision-diagnosis-advancement-plan.md`
- Phase 5 HITL 학습 루프

## User Journeys

1. 검토자는 Vision 관찰·Top-3·반대 근거·Graph 경로를 보고 승인·교정·반려·재촬영 중 하나를 선택한다.
2. 데이터 관리자는 모델 최초 출력과 모든 사람 교정본의 버전 계보를 재현할 수 있다.
3. 품질 담당자는 재촬영·반복 교정·희소 클래스·Vision-Graph 충돌 사례를 우선 검토한다.
4. 학습 관리자는 승인 전 데이터와 재촬영 데이터를 학습 후보에서 자동 제외한다.

## Test Specification

| 보장 동작 | 테스트 | 결과 |
| --- | --- | --- |
| 모델 최초 출력은 교정 후에도 불변 보존된다 | Common Agent `tests/test_image_review_revision.py` | PASS |
| 사람 교정과 후속 승인은 부모 버전 ID가 연결된 새 리비전으로 저장된다 | Common Agent `tests/test_image_review_revision.py` | PASS |
| 재촬영 결정은 `needs_review`, 학습 차단, 재평가 상태로 저장된다 | Common Agent `tests/test_image_review_revision.py` | PASS |
| 승인 외 결정의 Graph 승격 요청은 거부된다 | Common Agent `tests/test_image_review_revision.py` | PASS |
| 피드백·변경 이벤트·리비전이 같은 쓰기 경계에 기록된다 | Common Agent `tests/test_image_review_write_service.py` | PASS |
| 재촬영 요청은 검토 큐 우선순위 100을 받는다 | Common Agent `tests/test_image_dataset_service.py` | PASS |
| 반복 교정·희소 클래스·Vision-Graph 충돌이 코호트 우선순위에 반영된다 | Common Agent `tests/test_image_dataset_service.py` | PASS |
| 승인만 Graph 승격과 로컬 진단 학습을 허용한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 교정·반려·재촬영은 로컬 `review_event`로 저장된다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| Electron 검토 모달에 교정·재촬영·반려·검토 요청 출구가 표시된다 | `scripts/electron-multimodal-diagnosis-smoke.js` | PASS |

## RED/GREEN Evidence

- Common Agent revision RED: `4733700`, 버전형 HITL 모듈 부재
- Common Agent queue RED: `463ead0`, 코호트 우선순위 함수 부재
- Common Agent GREEN: `3a43ab0`, 리비전·재촬영·우선순위 11/11 PASS
- Mold Master RED: `7f3bb87`, fail-closed 결정 프로토콜 부재
- Mold Master GREEN: `d6e0154`, 계약 34/34, TypeScript, build, Electron PASS

## Verification

- Mold Master 집중 테스트: 112 PASS
- Common Agent 관련 집중 테스트: 41 PASS
- Electron 회귀 시나리오: 4 PASS, 콘솔 오류 0
- TypeScript `--noEmit`: PASS
- Production build: PASS

## Operational Gaps

다음 항목은 실제 승인 교정 데이터가 누적된 뒤 측정한다.

- 교정 사례 재평가 재현율 100%
- 월별 반복 오류 클래스 감소
- 결함군별 최소 표본 수 충족 후 few-shot, retrieval 개선, fine-tuning 순서 비교

운영 지표가 확보되기 전에는 `fine_tuning_auto_start_allowed=false`를 유지한다.
