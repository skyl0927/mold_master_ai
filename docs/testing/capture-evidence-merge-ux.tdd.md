# Capture Evidence Merge UX TDD Evidence

작성일: 2026-07-28

## 사용자 여정

사용자가 전체 제품 사진과 결함 근접 사진을 각각 저장했지만 서로 다른 촬영 세션으로 들어간 경우, 두 카드를 선택해 하나의 사진 증거 세트로 통합하고 AI 진단/Graph 추론을 재실행할 수 있어야 한다.

## RED

- 명령: `npm run test:capture-session`
- 결과: 20/22 PASS, 2 FAIL
- 실패 원인: `buildCaptureEvidenceMergePlan is not a function`
- RED 커밋: `3b09156 test: require capture evidence merge plan`

## GREEN

- 명령: `npm run test:capture-session`
- 결과: 22/22 PASS
- 보장: 서로 다른 `captureSessionId`를 가진 전체 사진과 근접 사진을 선택하면 첫 번째 선택 이미지의 세션으로 통합 가능한 계획이 생성된다.
- 보장: 선택된 실제 성형품 사진들이 `full_part_context`와 `defect_closeup`을 모두 포함하면 `readyAfterMerge: true`가 된다.

## 구현 범위

- `captureSessionProtocol.js`: 선택 사진의 세션 통합 계획, 누락 촬영 시점, 통합 후 준비 상태 계산.
- `App.tsx`: 선택 2장 이상일 때 `사진 증거 통합` 버튼 노출, 선택 이미지의 세션 통합, 기존 분석/Agent 동기화 캐시 초기화.
- `captureSessionProtocol.d.ts`: TypeScript 호출부를 위한 helper 타입 선언.

## 남은 검증

- UI 빌드 검증: `npm run build`
- 계약 테스트 재검증: `npm run test:contracts`
