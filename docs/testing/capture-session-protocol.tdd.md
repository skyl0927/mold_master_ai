# Capture Session Protocol TDD Evidence

작성일: 2026-07-24

## 사용자 여정

현장 사용자는 같은 제품의 전체 사진과 결함 근접 사진을 하나의 촬영
세션으로 수집하고, 필수 시점이 부족한 상태에서는 잘못된 Vision 진단이
실행되지 않기를 원한다.

## 계약과 검증

| 보장 동작 | 테스트 | 결과 |
| --- | --- | --- |
| 단일 시점은 누락된 근접 사진을 요구한다 | `tests/captureSessionProtocol.test.js` | PASS |
| 전체·근접 시점이 모두 있어야 진단 가능하다 | `tests/captureSessionProtocol.test.js` | PASS |
| 같은 시점 두 장은 프로토콜을 충족하지 않는다 | `tests/captureSessionProtocol.test.js` | PASS |
| 문서·도면은 물리 결함 진단에서 격리한다 | `tests/captureSessionProtocol.test.js` | PASS |
| 세션 없는 이미지는 fail-closed 처리한다 | `tests/captureSessionProtocol.test.js` | PASS |
| Common Agent 요청에 세션 계보를 보존한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| Electron UI는 한 시점에서 진단을 차단한다 | `scripts/electron-capture-session-smoke.js` | PASS |
| 두 필수 시점 지정 후 진단을 활성화한다 | `scripts/electron-capture-session-smoke.js` | PASS |
| 카메라 UI는 다중 촬영 상태를 유지한다 | `scripts/electron-capture-session-smoke.js` | PASS |

## RED

- `node --test tests/captureSessionProtocol.test.js`
- 실패 원인: `captureSessionProtocol` 모듈이 존재하지 않음
- `npm run test:contracts`
- 실패 원인: 촬영 정보가 진단 질문과 Common Agent `session_id`에 전달되지 않음

RED 체크포인트:

- `168788f test: define capture session safety contract`
- `17f7843 test: require capture lineage in vision requests`

## GREEN

- `npm run test:capture-session`: 11/11 PASS
- 신규 모듈 커버리지: line 100%, branch 93.02%, function 100%
- `npm run test:contracts`: 29/29 PASS
- `npm run test:benchmark`: 25/25 PASS
- `npm run test:vision-observation`: 12/12 PASS
- `npm run test:capture`: 6/6 PASS
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- `npm run test:electron:capture-session`: PASS, console errors 0
- `npm run test:electron`: PASS, console errors 0
- `npm run test:electron:capture-fresh-frame`: PASS, second frame changed

## 남은 운영 검증

자동화 환경에는 물리 카메라 장치가 없으므로 실제 외부 카메라의 센서 영상
촬영 버튼까지는 검증하지 못했다. 카메라 화면, 시점 선택, 세션 변경, 연속
촬영 상태 유지 계약은 Electron에서 검증했다.

실제 현장 사진으로 다음 항목을 추가 확인해야 한다.

1. 외부 카메라 두 시점 연속 촬영
2. 전체·근접 사진의 육안 품질
3. 승인 데이터셋 촬영 프로토콜 준비도 80% 이상
4. Common Agent에서 동일 `capture_session_id` 조회 재현
