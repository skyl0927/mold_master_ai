# Vision Bbox Overlay Index TDD

작성일: 2026-07-27

## 목적

Vision AI가 사진 위에 표시한 bbox와 오른쪽 관찰 카드가 서로 다른 순서로
보이면 작업자가 어떤 박스가 어떤 관찰 근거인지 추적하기 어렵다. bbox overlay
번호를 observation id 기준 lookup으로 연결해 HITL 검수자가 AI의 시각 근거를
빠르게 교차 확인할 수 있게 한다.

## 사용자 여정

품질 담당자는 AI 진단 결과를 검토할 때 이미지 위 `#1` 박스와 관찰 목록의
`#1` 카드가 같은 observation을 가리키는지 즉시 확인하고 싶다. primary 후보를
지지하는 관찰은 우선 노출되고, 동일한 색상 톤으로 이미지와 텍스트에서 함께
강조되어야 한다.

## RED

먼저 `tests/visionBboxOverlay.test.js`에 다음 보장을 추가했다.

- primary supporting observation이 원본 배열에서 뒤에 있어도 overlay 번호 `1`을
  받는다.
- overlay 번호와 tone이 `byObservationId` lookup으로 다시 조회된다.
- 보조 관찰은 `secondary` tone과 다음 display index를 받는다.

초기 실행 결과:

```text
npm run test:vision-bbox-overlay

TypeError: buildVisionBboxOverlayIndex is not a function
tests 4, pass 3, fail 1
```

이는 overlay 번호를 관찰 카드와 연결하는 API가 아직 없음을 확인한 RED다.

## GREEN

구현 내용:

- `visionBboxOverlay.js`의 overlay item에 `displayIndex`와 `tone`을 추가했다.
- `buildVisionBboxOverlayIndex()`를 추가해 `{ items, byObservationId }` 형태로
  이미지 overlay와 관찰 카드가 같은 번호를 공유하도록 했다.
- `components/AnalysisModal.tsx`에서 overlay badge는 `displayIndex`를 사용한다.
- 관찰 카드에는 같은 `#번호` badge와 primary/secondary 색상 톤을 표시한다.

## 검증

```powershell
npm run test:vision-bbox-overlay
npm run test:vision-bbox-annotation-status
npx --no-install tsc --noEmit --pretty false
```

현재 결과:

- `test:vision-bbox-overlay`: 4/4 PASS
- `test:vision-bbox-annotation-status`: 4/4 PASS
- `tsc --noEmit`: PASS

## 남은 과제

현재는 표시 연결만 제공한다. 이후에는 overlay 클릭 시 해당 관찰 카드로 스크롤,
관찰 카드 hover 시 이미지 bbox 강조, bbox 직접 수정 후 Common Agent annotation
재동기화까지 확장할 수 있다.
