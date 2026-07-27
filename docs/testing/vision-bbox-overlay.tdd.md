# Vision Bbox Overlay TDD

작성일: 2026-07-27

## 목적

Vision V2 관찰에 `region_bbox`를 저장하더라도 이미지 위에 보이지 않으면
작업자가 AI가 실제로 어느 영역을 보고 판단했는지 검수하기 어렵다. 분석
모달에서 정규화 bbox를 이미지 위에 overlay로 표시해 HITL 검토와 향후
SAM/Grounding DINO mask 비교의 기반을 만든다.

## 사용자 여정

품질 담당자는 AI 진단 결과를 열었을 때, 관찰 목록의 bbox 좌표뿐 아니라
이미지 위 박스로 “AI가 본 위치”를 즉시 확인하고 싶다. bbox가 잘못된 legacy
좌표이더라도 이미지 밖으로 튀어나가 UI를 깨뜨리면 안 된다.

## RED

추가한 테스트는 처음에 다음처럼 실패했다.

```text
Cannot find module '../visionBboxOverlay'
```

이는 bbox를 화면에 올리기 위한 좌표 변환 계약이 아직 없음을 보여줬다.

## GREEN

구현 내용:

- `visionBboxOverlay.js`에서 `normalized_xywh`를 `left/top/width/height`
  퍼센트 geometry로 변환한다.
- primary Vision 후보를 지지하는 observation은 overlay에서 우선 정렬하고
  별도 강조색을 받을 수 있게 `isPrimarySupport`를 표시한다.
- legacy/수동 데이터의 bbox가 이미지 범위를 벗어나도 0~100% 안으로 clip해
  overlay가 이미지 밖으로 넘치지 않게 한다.
- unsupported 좌표계, bbox 없음, 0 크기 bbox는 overlay에서 제외한다.
- 분석 모달 이미지 영역에 pointer-events 없는 bbox overlay를 추가했다.

## 검증

```powershell
npm run test:vision-bbox-overlay
npm run test:vision-observation
npm run test:vision-structured-output
npx --no-install tsc --noEmit --pretty false
```

결과:

- `test:vision-bbox-overlay`: 3/3 PASS
- `test:vision-observation`: 27/27 PASS
- `test:vision-structured-output`: 4/4 PASS
- `tsc --noEmit`: PASS

## 남은 과제

현재 overlay는 검수용 표시다. 다음 단계에서는 overlay 박스를 클릭해 해당
관찰 항목을 하이라이트하거나, 사람이 bbox를 수정해 Common Agent annotation
API로 저장하는 HITL 보정 흐름을 붙일 수 있다.
