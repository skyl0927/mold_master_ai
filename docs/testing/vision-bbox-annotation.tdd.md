# Vision Bbox Annotation TDD

작성일: 2026-07-27

## 목적

Vision bbox overlay는 작업자가 AI가 본 위치를 확인하게 해주지만, 중앙
Common Agent 데이터셋에는 annotation 후보로 저장되어야 이후 HITL 검수,
참조 이미지 재학습, segmentation 모델 비교에 사용할 수 있다. 따라서 Vision
V2 관찰 bbox를 Common Agent annotation API payload로 변환하는 계약을 추가했다.

## 사용자 여정

품질 담당자는 이미지 진단 후 Common Agent와 동기화할 때, 수동 ROI 도형뿐
아니라 AI가 관찰한 bbox도 `candidate` annotation으로 함께 저장되길 원한다.
이미 같은 Vision observation이 annotation으로 저장되어 있으면 중복 생성하면
안 된다.

## RED

추가한 테스트는 처음에 다음처럼 실패했다.

```text
Cannot find module '../visionBboxAnnotation'
```

이는 Vision bbox를 annotation payload로 바꾸는 변환 계층이 없음을 보여줬다.

## GREEN

구현 내용:

- `visionBboxAnnotation.js`에서 Vision observation bbox를 Common Agent
  `bbox` annotation request로 변환한다.
- primary 후보를 지지하는 observation은 진단 defect label을 사용하고,
  나머지는 `vision_<category>_roi` 후보 label로 저장한다.
- 모든 Vision bbox annotation은 `review_status: candidate`로만 생성해,
  사람 승인 전 학습/Graph 승격과 분리한다.
- `metadata.local_vision_observation_id`로 이미 저장된 observation bbox는
  중복 전송하지 않는다.
- App의 기존 Common Agent annotation sync에 수동 ROI shape payload와 Vision
  bbox payload를 함께 포함했다.

## 검증

```powershell
npm run test:vision-bbox-annotation
npm run test:vision-bbox-overlay
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
npm run build
```

결과:

- `test:vision-bbox-annotation`: 3/3 PASS
- `test:vision-bbox-overlay`: 3/3 PASS
- `test:contracts`: 62/62 PASS
- `tsc --noEmit`: PASS
- `npm run build`: PASS

## 남은 과제

현재는 Vision bbox를 candidate annotation으로 전송한다. 다음 단계에서는
annotation 후보를 분석 모달에서 승인/반려하거나, Common Agent annotation
상태를 읽어 overlay 색상에 반영하는 HITL 루프를 붙일 수 있다.
