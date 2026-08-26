# Annotated Editor Clipboard TDD Evidence

작성일: 2026-08-26

## 사용자 여정

도면 검토 사용자는 캡처 이미지 편집 화면에서 주석, 도형, 치수선을 포함한 현재 결과를
운영체제 클립보드에 바로 저장하고 PowerPoint 등 다른 프로그램에 `Ctrl+V`로 붙여 넣기를 원한다.

## 계약과 검증

| 보장 동작 | 테스트 | 결과 |
| --- | --- | --- |
| 비어 있지 않은 PNG data URL만 네이티브 클립보드 입력으로 허용한다 | `tests/clipboardImagePayload.test.js` | PASS |
| 누락, JPEG, 빈 값, 잘못된 Base64 입력은 거부한다 | `tests/clipboardImagePayload.test.js` | PASS |
| 저장 전 편집 중인 주석과 치수값도 최종 합성 이미지에 포함한다 | `scripts/electron-annotated-clipboard-smoke.js` | PASS |
| 선택 핸들과 편집 가이드는 클립보드 이미지에서 제외한다 | `components/AnnotationCanvas.tsx` 저장 렌더 경로 | PASS |
| Electron 메인 프로세스가 PNG를 OS 이미지 클립보드에 기록한다 | `scripts/electron-annotated-clipboard-smoke.js` | PASS |
| 클립보드 이미지 크기는 원본 편집 캔버스 크기와 같다 | `scripts/electron-annotated-clipboard-smoke.js` | PASS |
| 편집 화면에 완료 또는 실패 상태를 표시한다 | `scripts/electron-annotated-clipboard-smoke.js` | PASS |

## RED

- PNG 클립보드 입력 계약과 Electron 브리지, 편집기 버튼이 없었다.
- RED 체크포인트: `39a0363 test: require annotated clipboard image payload`

## GREEN

- PNG 입력 검증 체크포인트: `f056336 feat: validate clipboard PNG payloads`
- 편집기 UI 및 Electron OS 클립보드 체크포인트: `f9fbe4c feat: copy annotated editor image to clipboard`
- 자동화 호환 체크포인트: `e82fa9c test: keep editor save automation selectors exact`
- `npm run test:clipboard-image`: 2/2 PASS
- 클립보드 입력 모듈 커버리지: line 100%, branch 90.91%, functions 100%
- `npm run test:contracts`: 330/330 PASS
- `npm run test:dimension`: 48/48 PASS
- `npm run test:inspection-card`: 3/3 PASS
- `npm run test:package-runtime`: 1/1 PASS
- `npx tsc --noEmit --allowJs false`: PASS
- Electron 클립보드 이미지: 1482 x 1467px, PNG 2,010,220 bytes
- Electron 치수, 각도, 원근 보정, 카드 패널 회귀: PASS
- Electron console errors: 0
- Windows 테스트 설치본 패키징 및 `win-unpacked` 실행: PASS
- 패키징 실행 파일 클립보드 이미지: 1482 x 1467px, PNG 2,011,548 bytes
- 설치본 SHA-256: `59D9C7859849423F839D4F4491BA0F75D0458B10F6AA07C1594944A38794F587`

## 시각 증거

- `artifacts/electron-annotated-clipboard.png`
- `artifacts/electron-calibrated-dimension.png`
- `artifacts/electron-angle-measurement.png`
- `artifacts/electron-perspective-dimension.png`
- `artifacts/electron-inspection-card-compact.png`
