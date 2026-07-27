# Vision Bbox HITL Review Packet TDD

작성일: 2026-07-27

## 목적

Vision AI가 생성한 bbox는 사람 검수 전에 Graph 또는 자가학습 데이터로 승격되면
안 된다. 작업자가 bbox 오류를 발견했을 때 원본 bbox, 보정 후보, observation id,
검토 사유를 하나의 패킷으로 남겨 Common Agent/HITL 검토 흐름에 전달할 수 있게
한다.

## 사용자 여정

품질 담당자는 분석 모달에서 AI가 본 bbox 근거를 확인한 뒤, 해당 근거의 검수
패킷을 복사해 Common Agent 또는 동료 agent에게 전달하고 싶다. 이 패킷은 원본
Vision observation과 연결되어야 하며, 사람 승인 전에는 Graph 승격과 학습 승격을
허용하지 않아야 한다.

## RED

`tests/visionBboxAnnotation.test.js`에 다음 보장을 추가했다.

- corrected bbox가 포함된 review packet은 `vision-bbox-hitl-review/v1` 계약을
  사용한다.
- annotation request는 `needs_review` 상태로 생성된다.
- 원본 bbox와 보정 bbox가 모두 보존된다.
- `graph_promotion_allowed=false`, `learning_sync_allowed=false`가 metadata와
  packet 최상위에 남는다.
- 유효한 observation bbox와 연결되지 않으면 packet은 `null`이다.
- `approved_bbox` 같은 승인 유사 action이 들어와도 복사 패킷은 `needs_review`
  상태를 유지한다.

초기 실행 결과:

```text
npm run test:vision-bbox-annotation

TypeError: buildVisionBboxReviewPacket is not a function
tests 5, pass 3, fail 2
```

## GREEN

구현 내용:

- `visionBboxAnnotation.js`에 `buildVisionBboxReviewPacket()`을 추가했다.
- review packet은 기존 Vision bbox annotation metadata를 재사용하되,
  `source=vision-bbox-hitl-review/v1`, `parent_source=vision-observation/v2`를
  기록한다.
- corrected bbox가 있으면 annotation request bbox로 사용하고, 원본 bbox는
  metadata에 보존한다.
- 복사 패킷은 Common Agent의 명시 승인 전 단계이므로 approval-like action도
  `needs_review`로 유지한다.
- 분석 모달 관찰 카드에 `bbox 검수 패킷 복사` 버튼을 추가했다.
- 복사되는 JSON packet은 Common Agent 승인 전 Graph/학습 승격을 차단한다.

## 검증

```powershell
npm run test:vision-bbox-annotation
npm run test:vision-bbox-overlay
npx --no-install tsc --noEmit --pretty false
npm run build
```

현재 결과:

- `test:vision-bbox-annotation`: 6/6 PASS
- `test:vision-bbox-overlay`: 5/5 PASS
- `tsc --noEmit`: PASS
- `npm run build`: PASS

## 남은 과제

현재는 안전한 패킷 복사까지 제공한다. 다음 단계에서는 사용자가 bbox를 직접
수정하는 편집 UI와 Common Agent annotation update/create-confirm endpoint를
연결해 복사 없이 검수 결과를 제출할 수 있게 확장할 수 있다.
