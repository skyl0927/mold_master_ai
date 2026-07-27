# Vision Bbox Correction Draft TDD

작성일: 2026-07-27

## 목적

Vision AI가 사진에서 잘못된 위치를 bbox로 잡으면 이후 Graph 추론과 학습 데이터도
잘못될 수 있다. 작업자가 분석 모달에서 x/y/width/height를 직접 보정하고, 그
보정값을 `vision-bbox-hitl-review/v1` 패킷의 `corrected_bbox`로 전달할 수 있게
한다.

## 사용자 여정

품질 담당자는 AI가 표시한 bbox가 실제 결함 위치와 어긋났을 때, 별도 도구를
열지 않고 관찰 카드에서 normalized 좌표를 조정한 뒤 HITL 검수 패킷을 복사하고
싶다. 잘못된 좌표는 패킷 복사 전에 차단되어야 한다.

## RED

`tests/visionBboxAnnotation.test.js`에 다음 보장을 추가했다.

- 문자열 입력 x/y/width/height가 유효하면 correction draft가 생성된다.
- 원본 bbox와 달라진 경우 `hasChanges=true`가 된다.
- 보정 bbox는 `coordinateSystem=normalized_xywh`, `confidence=1`을 가진다.
- x+width 또는 y+height가 1을 넘는 등 이미지 경계를 벗어나면 `isValid=false`
  및 오류 코드가 반환된다.

초기 실행 결과:

```text
npm run test:vision-bbox-annotation

TypeError: buildVisionBboxCorrectionDraft is not a function
tests 8, pass 6, fail 2
```

## GREEN

구현 내용:

- `visionBboxAnnotation.js`에 `buildVisionBboxCorrectionDraft()`를 추가했다.
- draft는 숫자와 문자열 입력을 모두 받아 normalized 좌표 범위를 검증한다.
- 검증 실패 시 자동 보정하지 않고 오류 코드와 함께 `correctedBbox=null`을
  반환한다.
- 분석 모달의 각 Vision observation 카드에 bbox 보정 입력 x/y/width/height를
  추가했다.
- 보정값이 유효하고 원본과 다르면 패킷 복사 시 `corrected_bbox`가 포함된다.

## 검증

```powershell
npm run test:vision-bbox-annotation
npm run test:vision-bbox-overlay
npm run test:vision-bbox-annotation-status
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
npm run build
```

현재 결과:

- `test:vision-bbox-annotation`: 8/8 PASS
- `test:vision-bbox-overlay`: 5/5 PASS
- `test:vision-bbox-annotation-status`: 4/4 PASS
- `test:contracts`: 62/62 PASS
- `tsc --noEmit`: PASS
- `npm run build`: PASS

## 남은 과제

현재는 보정 draft를 HITL 패킷에 넣어 복사하는 단계다. 다음 단계에서는 Common
Agent annotation update/create endpoint와 직접 연결해 패킷 복사 없이 제출하고,
제출 결과를 `visionBboxAnnotationSummary`에 즉시 반영할 수 있다.
