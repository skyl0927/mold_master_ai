# Multiview Vision Fusion TDD Evidence

작성일: 2026-07-24

## 사용자 여정

현장 사용자는 같은 제품의 전체, 결함 근접, 사선광 및 기능 위치 사진을
하나의 촬영 세션으로 진단하고, 여러 시점이 실제로 LLM에 전달되어 서로
동의하거나 충돌하는지를 확인하기를 원한다.

## 계약과 검증

| 보장 동작 | 테스트 | 결과 |
| --- | --- | --- |
| 같은 세션의 물리 제품 이미지를 대표 이미지 우선으로 수집한다 | `tests/captureSessionProtocol.test.js` | PASS |
| 배치 진단은 세션당 한 번만 실행한다 | `tests/captureSessionProtocol.test.js` | PASS |
| 추가 시점 파일과 순서가 고정된 manifest를 전송한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| manifest 개수와 파일 개수가 다르면 요청을 거부한다 | Common Agent `tests/test_vision_multiview_request.py` | PASS |
| 중복 시점·로컬 이미지 ID는 요청 단계에서 거부한다 | Common Agent `tests/test_vision_multiview_request.py` | PASS |
| 각 시점은 독립 Vision V2 관찰을 실행한다 | Common Agent `tests/test_vision_multiview_endpoint.py` | PASS |
| 두 시점이 같은 후보를 지지하면 유력 후보로 융합한다 | Common Agent `tests/test_vision_multiview_fusion.py` | PASS |
| 시점별 Top-1이 충돌하면 사람 검토로 전환한다 | Common Agent `tests/test_vision_multiview_fusion.py` | PASS |
| 필수 시점 누락은 유력 판정을 차단한다 | Common Agent `tests/test_vision_multiview_fusion.py` | PASS |
| 문서 시점은 물리 시점 수에 포함하지 않는다 | Common Agent `tests/test_vision_multiview_fusion.py` | PASS |
| 모든 시점의 정상 판정은 모델 결함 후보보다 우선한다 | Common Agent `tests/test_vision_multiview_fusion.py` | PASS |
| taxonomy 별칭은 하나의 표준 후보로 병합한다 | Common Agent `tests/test_vision_multiview_fusion.py` | PASS |
| Graph 질의는 융합 합의 수와 불일치 점수를 포함한다 | Common Agent `tests/test_vision_candidate_graph_query.py` | PASS |
| 시점별 원본 관찰과 서버 이미지 ID를 각각 저장한다 | Common Agent `tests/test_vision_multiview_endpoint.py` | PASS |
| Electron에서 두 카드가 한 세션 결과로 완료된다 | `scripts/electron-multimodal-diagnosis-smoke.js` | PASS |
| Electron에서 2/2 유효, 불일치, 시점별 후보가 표시된다 | `scripts/electron-multimodal-diagnosis-smoke.js` | PASS |

## RED

- Mold Master: 세션 수집 함수, 추가 파일 multipart, gateway 세션 전달 부재
- RED 체크포인트: `f82ca53 test: require true multiview diagnosis`
- Common Agent: 다중 시점 융합 모듈과 계약 부재
- RED 체크포인트: `ce9bdbf test: define deterministic multiview fusion`

## GREEN

- `npm run test:capture-session`: 13/13 PASS
- `npm run test:contracts`: 31/31 PASS
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- Common Agent 다중 시점·Vision·Graph 집중 테스트: 27/27 PASS
- Common Agent 변경 파일 `py_compile`: PASS
- Electron 다중 시점 multipart 및 융합 UI: PASS
- Electron console errors: 0

## 남은 운영 검증

결정론적 융합 계약은 검증됐지만 실제 결함 정확도는 승인 현장 세션이
필요하다.

1. 핵심 결함 8종, 클래스별 승인 세션 30건 이상
2. 전체·근접·사선광 조합별 성능 비교
3. 클래스별 temperature와 isotonic calibration 비교
4. Top-3 정확도 85% 이상
5. 자동 확정 정확도 95% 이상
6. 위험 자동 오판율 2% 이하
7. Expected Calibration Error 0.08 이하
