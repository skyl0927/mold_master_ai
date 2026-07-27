# Vision Bbox Grounding Quality Gate TDD

작성일: 2026-07-27

## 목적

AI 진단에서 Vision은 사람의 눈 역할을 한다. 결함 후보 confidence가 높더라도
결함 위치를 뒷받침하는 bbox가 전체 화면 수준으로 넓거나 bbox confidence가 낮으면
실제 문제 특징을 정확히 본 것으로 취급하면 안 된다. 이번 단계는 그런 약한 픽셀
근거를 `needs_review`로 강등하여 Graph 자동 후보 사용을 막는 safety gate를
추가한다.

## 사용자 여정

품질 담당자는 Vision이 백화, 플래시, 웰드라인 같은 후보를 높게 제시하더라도
bbox 위치 근거가 부정확하면 곧바로 원인/대책 리포트가 확정되지 않고, HITL 또는
재촬영 대상으로 분리되기를 원한다.

## RED

`tests/visionObservation.test.js`에 다음 보장을 추가했다.

- 후보 confidence, 후보 간 margin, 관찰 개수, 관찰 category가 모두 충분해도
  supporting observation bbox가 전체 화면 수준이고 bbox confidence가 낮으면
  `probable`이 아니라 `needs_review`가 되어야 한다.
- safety gate는 `low_region_bbox_confidence`,
  `overbroad_region_bbox` reason을 남겨야 한다.
- Graph 자동 후보 사용은 `autoGraphCandidateUseAllowed=false`로 차단되어야 한다.

초기 실행 결과:

```text
npm run test:vision-observation

AssertionError: actual 'probable' expected 'needs_review'
tests 28, pass 27, fail 1
```

## GREEN

구현 내용:

- `visionObservation.js`의 safety gate가 Top 후보를 지지하는 observation의
  `regionBbox`를 평가한다.
- bbox confidence가 `0.65` 미만이면 `low_region_bbox_confidence`를 추가한다.
- bbox 면적이 normalized image의 `0.72`를 초과하면 `overbroad_region_bbox`를
  추가한다.
- bbox 품질 문제가 있는 후보는 `graph_cross_check_only` 정책으로 강등되어
  Graph 자동 후보 사용이 차단된다.
- `types.ts`에 bbox 품질 count 필드를 추가했다.
- `AnalysisModal`의 한글 reason label에 새 gate 사유를 추가했다.

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

- `test:vision-observation`: 28/28 PASS
- `test:vision-diagnosis-guard`: 7/7 PASS
- `test:vision-consensus-gate`: 5/5 PASS
- `test:contracts`: 62/62 PASS
- `tsc --noEmit`: PASS
- `npm run build`: PASS

## 남은 과제

이 gate는 규칙 기반 1차 안전장치다. 다음 단계에서는 실제 HITL 승인/반려 로그를
이용해 결함군별 bbox area/confidence 임계값을 보정하고, 제품군/촬영 view별로
다른 기준을 적용하는 calibration 테이블로 확장할 수 있다.
