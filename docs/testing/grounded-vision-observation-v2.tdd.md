# Grounded Vision Observation V2 TDD Evidence

작성일: 2026-07-24
갱신일: 2026-07-27

## 사용자 여정

현장 사용자는 사진에서 보이는 사실과 원인 추론이 섞이지 않고, 각 결함
후보가 실제 사진 관찰을 근거로 제시하며, 정상 형상이나 문서가 결함으로
오인되지 않기를 원한다.

## 계약과 검증

| 보장 동작 | 테스트 | 결과 |
| --- | --- | --- |
| V2 관찰은 고유 관찰 ID와 범주를 보존한다 | `tests/visionObservation.test.js` | PASS |
| 결함 후보는 유효한 관찰 ID를 반드시 인용한다 | `tests/visionObservation.test.js` | PASS |
| V2 관찰 ID 누락 시 서버가 임의 ID를 생성하지 않는다 | Mold/Common Agent Vision 계약 테스트 | PASS |
| 관찰 근거가 없는 V2 후보는 폐기한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 정상 판정은 고신뢰 결함 후보보다 우선한다 | `tests/visionObservation.test.js` | PASS |
| 품질 `reject/fail` 이미지는 고신뢰 후보를 제거하고 재촬영 보류로 전환한다 | `tests/visionObservation.test.js`, `tests/multimodalBenchmark.test.js` | PASS |
| 결함 가시성 불확실 상태는 유력 후보로 자동 승격하지 않는다 | Common Agent `tests/test_vision_candidate_contract.py` | PASS |
| 알 수 없는 Vision 계약 버전은 fail-closed 처리한다 | Common Agent `tests/test_vision_candidate_contract.py` | PASS |
| 문서·도면은 물리 결함 진단에서 격리한다 | `tests/visionObservation.test.js` | PASS |
| Vision 단계의 원인·대책은 앱 결과에 주입되지 않는다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 현장 설명은 Vision 모델 프롬프트에 전달되지 않는다 | Common Agent `tests/test_vision_candidate_contract.py` | PASS |
| Graph 질의는 관찰 ID를 보존하고 Vision 원인 추측을 제외한다 | Common Agent `tests/test_vision_candidate_graph_query.py` | PASS |
| Electron UI에 계약, 관찰 ID, Top-3 근거가 표시된다 | `scripts/electron-multimodal-diagnosis-smoke.js` | PASS |
| Electron 렌더러 콘솔 오류가 발생하지 않는다 | `scripts/electron-multimodal-diagnosis-smoke.js` | PASS |

## RED

- Mold Master: `npm run test:vision-observation`
- 실패 수: 6건
- 실패 원인: V2 관찰 ID, 정상/문서 hard-negative, legacy 자동 확정 제한 미구현
- RED 체크포인트: `04137ab test: define grounded visual observation v2`

- Common Agent: `python -m pytest -q tests/test_vision_candidate_contract.py`
- 실패 수: 4건
- 실패 원인: Vision 프롬프트가 현장 질문과 원인·대책을 포함하고 관찰 ID를 검증하지 않음
- RED 체크포인트: `2262556 test: define grounded Vision observation v2`

## GREEN

- `npm run test:vision-observation`: 17/17 PASS
- 2026-07-27 추가 GREEN: `npm run test:vision-observation`: 19/19 PASS
- 2026-07-27 추가 GREEN: `npm run test:benchmark`: 30/30 PASS
- `npm run test:contracts`: 30/30 PASS
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- Common Agent V2·Graph·데이터셋 테스트: 15/15 PASS
- Common Agent 변경 파일 `py_compile`: PASS
- Electron 다중 시점 V2 진단: PASS
- Electron 구조화 관찰 화면 육안 확인: PASS
- Electron console errors: 0

## 남은 운영 검증

자동화는 계약과 흐름을 검증하지만 실제 결함 인식 정확도를 증명하지 않는다.
승인된 정상·불량 사진을 사용해 다음 항목을 추가 측정해야 한다.

1. 라이브 모델 JSON Schema 준수율 100%
2. 정상·문서 hard-negative 오판 0건
3. 관찰 근거 없는 결함 후보 0건
4. 결함별 Top-1, Top-3, 선택 판정 정확도
5. 실제 다중 시점 융합 전후의 위험 자동 오판율
