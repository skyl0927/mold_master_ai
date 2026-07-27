# Vision Bbox Review Focus TDD

작성일: 2026-07-27

## 목적

Vision bbox overlay와 관찰 카드가 같은 번호를 공유하더라도, 이미지 위 근거가
많아지면 작업자가 어느 카드와 연결되는지 다시 찾는 데 시간이 걸린다. bbox를
클릭하면 해당 관찰 카드가 active 상태로 강조되고 중앙으로 스크롤되게 해
HITL 검수자가 AI의 시각 근거를 더 빠르게 확인할 수 있게 한다.

## 사용자 여정

품질 담당자는 AI 진단 모달에서 이미지 위 bbox `#2`를 클릭했을 때 오른쪽
`AI가 본 근거 영역`의 동일 observation 카드가 바로 강조되기를 원한다. 선택된
근거가 있을 때 다른 bbox와 카드는 흐리게 표시되어 현재 검수 대상이 명확해야
한다.

## RED

`tests/visionBboxOverlay.test.js`에 다음 보장을 추가했다.

- 선택된 observation id만 `isActive=true`가 된다.
- 선택되지 않은 다른 bbox evidence는 `isDimmed=true`가 된다.
- 존재하지 않는 observation id가 전달되면 focus는 fail-open이 아니라 안전하게
  해제되고 dim 상태도 제거된다.

초기 실행 결과:

```text
npm run test:vision-bbox-overlay

TypeError: buildVisionBboxOverlayReviewModel is not a function
tests 5, pass 4, fail 1
```

## GREEN

구현 내용:

- `visionBboxOverlay.js`에 `buildVisionBboxOverlayReviewModel()`을 추가했다.
- review model은 overlay item에 `isActive`, `isDimmed`를 붙이고
  `byObservationId` lookup을 유지한다.
- 분석 모달의 bbox overlay를 클릭 가능한 버튼으로 변경했다.
- bbox 클릭 시 동일 observation 카드가 smooth scroll되고 active ring으로
  강조된다.
- 관찰 카드도 클릭 가능하게 하여 같은 focus 상태를 재사용한다.

## 검증

```powershell
npm run test:vision-bbox-overlay
npx --no-install tsc --noEmit --pretty false
```

현재 결과:

- `test:vision-bbox-overlay`: 5/5 PASS
- `tsc --noEmit`: PASS

## 남은 과제

다음 단계에서는 hover 동기화, 키보드 단축키, bbox 위치 직접 수정, 수정된 bbox의
Common Agent annotation 재동기화를 이어 붙일 수 있다.
