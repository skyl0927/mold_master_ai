# Rotatable Labels and Adaptive Dimension Arrows TDD Evidence

작성일: 2026-08-26

## 사용자 여정

도면 검토 사용자는 치수값과 주석을 필요한 각도로 회전하고, 협소한 측정 구간에서는
화살촉 간섭 없이 치수 끝점 바깥에 화살표가 자동 배치되기를 원한다.

## 계약과 검증

| 보장 동작 | 테스트 | 결과 |
| --- | --- | --- |
| 회전각을 -180도 이상 180도 미만으로 정규화해 라디안으로 저장한다 | `tests/textRotation.test.js` | PASS |
| 회전된 글자 중심과 클릭 좌표에 같은 회전 변환을 사용한다 | `tests/textRotation.test.js` | PASS |
| 치수 폭이 화살촉 2개와 여유 폭보다 작으면 외측 화살표를 선택한다 | `tests/dimensionMeasurement.test.js` | PASS |
| 내부와 외측 화살표를 사용자가 강제로 선택할 수 있다 | `tests/dimensionMeasurement.test.js` | PASS |
| 홈, 주석, 측정, 번역 탭이 공통 글자 회전 명령을 공유한다 | `tests/annotationRibbon.test.js` | PASS |
| Electron에서 90도 치수값과 -90도 주석을 편집한다 | `scripts/electron-calibrated-dimension-smoke.js` | PASS |
| Electron에서 긴 치수는 내부, 6px 치수는 자동 외측으로 전환한다 | `scripts/electron-calibrated-dimension-smoke.js` | PASS |
| 자동, 내부 강제, 자동 복귀가 같은 선택 치수에 즉시 반영된다 | `scripts/electron-calibrated-dimension-smoke.js` | PASS |

## RED

- 회전 유틸리티, 회전 저장 필드, 화살표 자동 배치 계약, 공통 리본 명령이 없었다.
- RED 체크포인트: `36c1b1f test: require rotatable labels and adaptive dimension arrows`

## GREEN

- 순수 로직 체크포인트: `3b186b6 feat: add text rotation and adaptive dimension contracts`
- UI 및 Electron 체크포인트: `6ca7126 feat: add rotatable labels and adaptive dimension arrows`
- `npm run test:dimension`: 48/48 PASS
- `npm run test:contracts`: 330/330 PASS
- 회전 모듈 커버리지: line 100%, branch 95.45%, functions 100%
- `npx tsc --noEmit --allowJs false`: PASS
- `npm run build`: PASS
- Electron 치수·회전 자동화: PASS
- Electron console errors: 0

## 시각 증거

- `artifacts/electron-calibrated-dimension.png`
