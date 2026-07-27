# Vision Bbox Annotation Status TDD

작성일: 2026-07-27

## 목적

Vision observation bbox를 Common Agent annotation 후보로 보낸 뒤에는,
후보가 실제로 동기화됐는지, 검토 대기인지, 승인 또는 반려됐는지 추적해야
한다. 이 상태 요약이 없으면 overlay는 보이지만 HITL 학습 루프의 진행 상태를
작업자가 확인할 수 없다.

## 사용자 여정

품질 담당자는 AI 진단 모달에서 Vision bbox annotation의 현재 상태를 빠르게
확인하고 싶다. 모든 bbox가 승인되기 전에는 학습-ready 후보로만 남고, Graph
승격은 별도 승인 없이는 허용되지 않아야 한다.

## RED

추가한 테스트는 처음에 다음처럼 실패했다.

```text
Cannot find module '../visionBboxAnnotationStatus'
```

이는 Common Agent annotation 응답을 Vision observation bbox 기준으로 요약하는
계층이 없음을 보여줬다.

## GREEN

구현 내용:

- `visionBboxAnnotationStatus.js`에서 Vision observation bbox별 annotation
  상태를 요약한다.
- `candidate`, `approved`, `rejected`, `needs_review`, `missing`을 분리 집계한다.
- 모든 bbox가 synced되고 candidate/needs_review가 없을 때만 `reviewComplete`
  로 본다.
- 모든 bbox가 approved인 경우에만 `learningReadyCandidate=true`가 된다.
- bbox annotation 상태가 승인되어도 `graphPromotionAllowed=false`로 유지해
  위치 검수와 Graph 승격을 분리한다.
- Common Agent sync 후 기존 annotation과 새 annotation 응답을 합쳐
  `CapturedImage.visionBboxAnnotationSummary`에 저장한다.
- 분석 모달 이미지 영역에 bbox HITL 상태, 동기화 수, 승인/대기/반려 수를
  표시한다.

## 검증

```powershell
npm run test:vision-bbox-annotation-status
npm run test:vision-bbox-annotation
npm run test:vision-bbox-overlay
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
npm run build
```

결과:

- `test:vision-bbox-annotation-status`: 4/4 PASS
- `test:vision-bbox-annotation`: 3/3 PASS
- `test:vision-bbox-overlay`: 3/3 PASS
- `test:contracts`: 62/62 PASS
- `tsc --noEmit`: PASS
- `npm run build`: PASS

## 남은 과제

현재는 sync 시점의 annotation 상태를 로컬 이미지에 보존한다. 다음 단계에서는
모달에서 Common Agent annotation 상태를 수동 새로고침하거나, observation
card와 overlay 번호를 연동해 검수할 bbox를 빠르게 찾게 만들 수 있다.
