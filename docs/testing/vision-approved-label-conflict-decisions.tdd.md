# Vision Approved Label Conflict Decisions TDD

작성일: 2026-07-27

## 목적

승인 이미지 manifest에 동일 이미지 또는 동일 hash가 서로 다른 결함 라벨로
들어간 경우, 사람이 정답 라벨을 확정하기 전까지 Graph 승격과 Reference 학습을
막는다. 기존에는 `vision-approved-label-conflict-review-packet/v1`로 충돌 목록만
만들 수 있었고, 사람이 작성한 충돌 해소 판정을 검증하는 계약이 없었다.

## RED

먼저 `tests/visionApprovedLabelConflictDecisions.test.js`를 추가했다.

검증한 기대 동작:

- 충돌 패킷에서 no-write decision template을 만든다.
- `keep_label`은 후보 라벨, 이미지 그룹 확인, 최종 라벨 확인을 요구한다.
- 사람이 채운 판정은 conflict id, content hash, case id, reviewer, 시각,
  코멘트와 함께 검증된다.
- 검증 결과는 `importPlan`만 만들고 Graph, Reference, 모델 학습 쓰기를 모두
  금지한다.
- 후보에 없는 라벨, 부분 판정, 미검토 상태는 fail-closed로 남긴다.

RED 결과:

```text
Error: Cannot find module '../visionApprovedLabelConflictDecisionTemplate'
```

## GREEN 구현

추가된 계약:

- `visionApprovedLabelConflictDecisionTemplate.js`
- `visionApprovedLabelConflictDecisionVerification.js`
- `scripts/build-vision-approved-label-conflict-decision-template.js`
- `scripts/verify-vision-approved-label-conflict-decisions.js`
- `npm run vision:label-conflicts:decision-template`
- `npm run vision:label-conflicts:verify-decisions`

`vision:operational:worklist`의 `resolve_label_conflicts` 작업도 다음 순서를
노출한다.

```powershell
npm run vision:label-conflicts:packet
npm run vision:label-conflicts:decision-template
npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>
```

## 안전 정책

이 흐름은 사람이 승인한 라벨 충돌 해소안을 검증만 한다. 모든 산출물은
`serviceWritesPerformed=false`, `autoApplyAllowed=false`,
`allowGraphPromotion=false`, `allowReferenceLearning=false`,
`allowModelTraining=false`를 유지한다.
