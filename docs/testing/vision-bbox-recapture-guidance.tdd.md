# Vision Bbox Recapture Guidance TDD

작성일: 2026-07-27

## 목적

Vision bbox safety gate가 `needs_review`로 보류하더라도, 사용자가 다음에 어떤
사진을 다시 확보해야 하는지 알 수 없으면 현장 루프가 끊긴다. 이번 단계는 bbox
위치 근거가 약할 때 `requiredAdditionalViews`를 자동 보강해 HITL/재촬영 행동으로
바로 이어지게 한다.

## 사용자 여정

품질 담당자는 근접 결함 사진에서 Vision bbox가 너무 넓거나 신뢰도가 낮으면
“검토 필요”라는 추상 메시지 대신, 초점/조명 보정 재촬영 또는 결함 부위 중심
근접 재촬영 같은 구체 지시를 받고 싶다.

## RED

`tests/visionObservation.test.js`의 close-up bbox calibration 테스트에 다음 보장을
추가했다.

- `low_region_bbox_confidence`가 있으면
  `bbox 신뢰도 보강: 초점/조명 보정 후 동일 위치 재촬영`을 추가해야 한다.
- `overbroad_region_bbox`가 있으면
  `bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영`을 추가해야 한다.
- provider가 명시하지 않은 경우에도 derived `requiredAdditionalViews`가 비어 있으면
  안 된다.

초기 실행 결과:

```text
npm run test:vision-observation

AssertionError: actual [] expected [
  'bbox 신뢰도 보강: 초점/조명 보정 후 동일 위치 재촬영',
  'bbox 범위 축소: 결함 부위가 프레임 중앙에 오도록 근접 재촬영'
]
tests 29, pass 28, fail 1
```

## GREEN

구현 내용:

- `visionObservation.js`에 `buildDerivedRequiredAdditionalViews()`를 추가했다.
- provider가 반환한 추가 촬영 지시를 먼저 보존하고, bbox safety reason에서 필요한
  재촬영 지시를 중복 없이 병합한다.
- 기존 AnalysisModal은 `requiredAdditionalViews`를 이미 표시하므로 별도 UI 계약
  변경 없이 자동 생성된 재촬영 지시가 “추가 확인 촬영”에 표시된다.

## 검증

```powershell
npm run test:vision-observation
npm run test:vision-diagnosis-guard
npm run test:vision-consensus-gate
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
npm run build
```

현재 결과:

- `test:vision-observation`: 29/29 PASS
- `test:vision-diagnosis-guard`: 7/7 PASS
- `test:vision-consensus-gate`: 5/5 PASS
- `test:contracts`: 62/62 PASS
- `tsc --noEmit`: PASS
- `npm run build`: PASS

## 남은 과제

추후 HITL 반려 사유가 쌓이면 defect type, capture view, bbox 품질 reason별로
더 세밀한 재촬영 문구를 Common Agent에서 중앙 관리하도록 확장할 수 있다.
