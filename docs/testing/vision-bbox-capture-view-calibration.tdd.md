# Vision Bbox Capture View Calibration TDD

작성일: 2026-07-27

## 목적

Vision bbox safety gate의 기본 임계값만으로는 촬영 목적 차이를 반영하기 어렵다.
특히 `defect_closeup`은 결함을 근접 촬영한 view이므로 bbox가 넓거나 confidence가
낮으면 결함 위치를 정확히 본 것으로 취급하면 안 된다. 이번 단계는 촬영 view별
bbox calibration profile을 적용해 근접 결함 사진의 자동 Graph 후보 사용을 더
엄격하게 제한한다.

## 사용자 여정

품질 담당자는 근접 결함 사진에서 Vision이 높은 confidence를 제시하더라도 bbox가
넓고 위치 confidence가 부족하면 자동 확정이 아니라 HITL 검토로 보내기를 원한다.
반대로 전체 제품 context 사진은 별도 profile로 관리되어 추후 제품군/촬영 목적별
calibration으로 확장될 수 있어야 한다.

## RED

`tests/visionObservation.test.js`에 다음 보장을 추가했다.

- `capture_view_tag=defect_closeup`이면 close-up 전용 bbox profile을 적용해야 한다.
- close-up profile은 `minConfidence=0.72`, `maxArea=0.55` 기준을 사용해야 한다.
- 기본 profile에서는 통과하던 bbox confidence `0.68`, 면적 `0.60` 근거는
  close-up에서는 `needs_review`로 강등되어야 한다.
- safety gate는 적용한 profile id와 threshold를 결과에 남겨야 한다.

초기 실행 결과:

```text
npm run test:vision-observation

AssertionError: actual 'probable' expected 'needs_review'
tests 29, pass 28, fail 1
```

## GREEN

구현 내용:

- `visionObservation.js`에 view별 bbox grounding profile resolver를 추가했다.
- 기본 profile은 `default_visual_evidence`, close-up profile은
  `defect_closeup_precision`으로 구분한다.
- `defect_closeup`, `oblique_light`, `parting_line_context`, `ejection_location`,
  `full_part_context` profile을 정의했다.
- safety gate는 `bboxGroundingProfileId`와 `bboxGroundingThresholds`를 반환한다.
- `types.ts`에 calibration 결과 필드를 추가했다.
- `AnalysisModal`은 safety gate 카드에서 적용된 bbox 기준을 한글로 표시한다.

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

현재 profile 값은 보수적 운영 기본값이다. 실제 HITL 승인/반려 로그가 쌓이면
결함군, 제품군, 촬영 view별 bbox IoU/area/confidence 분포를 계산해 profile 값을
자동 추천하거나 Common Agent의 중앙 calibration 설정에서 받아오도록 확장한다.
