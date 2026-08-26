# Compact Inspection Card Panels TDD Evidence

작성일: 2026-08-26

## 사용자 여정

검사 이미지를 대량으로 확인하는 사용자는 각 카드의 상세 입력과 분석 버튼 때문에
긴 스크롤을 사용하지 않고, 작은 미리보기와 필요한 기능만 펼치는 탭을 원한다.

## 계약과 검증

| 보장 동작 | 테스트 | 결과 |
| --- | --- | --- |
| 카드 상세 패널은 기본적으로 닫혀 있다 | `tests/inspectionCardPanel.test.js` | PASS |
| 촬영 정보, 현상 설명, 분석 탭 중 하나만 카드별로 연다 | `tests/inspectionCardPanel.test.js` | PASS |
| 선택된 탭을 다시 누르면 카드가 접힌다 | `tests/inspectionCardPanel.test.js` | PASS |
| 여러 이미지의 열린 탭 상태는 서로 간섭하지 않는다 | `tests/inspectionCardPanel.test.js` | PASS |
| 4개 카드가 한 화면에 표시되고 미리보기 높이는 144px이다 | `scripts/electron-inspection-card-compact-smoke.js` | PASS |
| 접힌 카드 높이는 260px 이하이다 | `scripts/electron-inspection-card-compact-smoke.js` | PASS |
| 편집과 삭제 버튼은 상세 패널과 무관하게 항상 표시된다 | `scripts/electron-inspection-card-compact-smoke.js` | PASS |
| 촬영, 현상, 분석 탭의 실제 입력과 버튼이 전환된다 | `scripts/electron-inspection-card-compact-smoke.js` | PASS |

## RED

- 카드별 패널 상태 계약과 기본 접힘 동작이 없었다.
- RED 체크포인트: `22b9da9 test: require compact inspection card panels`

## GREEN

- 상태 계약 체크포인트: `2085bc7 feat: add inspection card panel state contract`
- UI 및 Electron 체크포인트: `b12d43f feat: compact inspection cards with slide tabs`
- `npm run test:inspection-card`: 3/3 PASS
- `npx tsc --noEmit --allowJs false`: PASS
- `npm run build`: PASS
- Electron compact card flow: PASS
- Electron console errors: 0

## 시각 증거

- `artifacts/electron-inspection-card-compact.png`
