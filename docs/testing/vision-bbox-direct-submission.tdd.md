# Vision Bbox Direct Submission TDD

작성일: 2026-07-27

## 목적

이전 단계에서는 Vision bbox 보정값을 HITL 패킷으로 복사할 수 있었다. 이번
단계에서는 복사에 그치지 않고, 이미 Common Agent에 동기화된 이미지라면 보정
검수 annotation을 `needs_review` 상태로 직접 제출할 수 있게 한다. 직접 제출도
사람 승인 전 Graph 승격과 학습 승격은 계속 차단해야 한다.

## 사용자 여정

품질 담당자는 AI가 본 bbox가 틀렸을 때 x/y/width/height를 보정한 뒤,
`Common Agent 제출` 버튼으로 해당 보정 후보를 HITL 검수 큐에 바로 남기고 싶다.
서버 이미지 ID가 없는 경우에는 먼저 Agent 동기화를 해야 하며, 잘못된 좌표는
제출되지 않아야 한다.

## RED

`tests/visionBboxAnnotation.test.js`에 다음 보장을 추가했다.

- Common Agent image id가 있고 보정 draft가 유효하면 제출 가능한 annotation
  request를 만든다.
- 제출 annotation은 `needs_review` 상태이며 `review_action=corrected_bbox`를
  포함한다.
- 제출 계약 역시 `graphPromotionAllowed=false`, `learningSyncAllowed=false`를
  유지한다.
- Common Agent image id가 없으면 `missing_common_agent_image_id`로 제출을
  차단한다.

초기 실행 결과:

```text
npm run test:vision-bbox-annotation

TypeError: buildVisionBboxReviewSubmission is not a function
tests 10, pass 8, fail 2
```

## GREEN

구현 내용:

- `visionBboxAnnotation.js`에 `buildVisionBboxReviewSubmission()`을 추가했다.
- submission은 bbox correction draft 검증, review packet 생성, annotation
  request 추출, 제출 가능 여부와 차단 사유를 하나의 구조로 반환한다.
- `AnalysisModal`에 `Common Agent 제출` 버튼을 추가했다.
- 모달은 현재 편집 중인 분석과 bbox draft를 기준으로 submission을 만들고, App
  콜백에 전달한다.
- App은 `CommonAgentApiService.createAnnotation()`으로 `needs_review` bbox
  annotation을 생성하고, annotation 목록을 다시 읽어
  `visionBboxAnnotationSummary`를 갱신한다.

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

- `test:vision-bbox-annotation`: 10/10 PASS
- `test:vision-bbox-overlay`: 5/5 PASS
- `test:vision-bbox-annotation-status`: 4/4 PASS
- `test:contracts`: 62/62 PASS
- `tsc --noEmit`: PASS
- `npm run build`: PASS

## 남은 과제

현재 직접 제출은 Common Agent에 새 `needs_review` annotation을 추가하는 흐름이다.
다음 단계에서는 서버가 annotation update/revision endpoint를 제공할 때 동일
observation의 기존 candidate annotation을 revision으로 갱신하고, 제출 성공 후
해당 observation 카드에 서버 annotation id를 표시할 수 있다.
