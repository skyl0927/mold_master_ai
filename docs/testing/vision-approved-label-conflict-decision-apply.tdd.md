# Vision Approved Label Conflict Decision Apply TDD

작성일: 2026-07-27

## 목적

`vision-approved-label-conflict-decision-verification-report/v1`은 사람이 확정한
라벨 충돌 해소안을 검증하지만, 기존에는 이를 로컬 approved fixture와 manifest에
반영하는 안전한 적용 단계가 없었다. 이 기능은 검증된 수동 판정만 대상으로
`dry-run -> --apply -> post-HITL 검증` 순서를 제공한다.

## RED

`tests/visionApprovedLabelConflictDecisionApply.test.js`를 먼저 추가했다.

기대 동작:

- 기본 실행은 dry-run이며 fixture 파일을 쓰지 않는다.
- `--apply`가 있을 때만 로컬 `eval/vision-approved` manifest와 fixture JSON을
  갱신한다.
- `keep_label`은 선택된 라벨 case만 `active`로 유지하고, 같은 충돌 그룹의
  superseded case는 `needs_review`로 격리한다.
- 단일 record 충돌은 사람이 선택한 라벨로 `expected.defectType`과
  `expected.defectClass`를 갱신하고 원래 라벨을 보존한다.
- 검증 보고서가 ready가 아니거나 fixture hash/case가 맞지 않으면 fail-closed로
  아무 파일도 쓰지 않는다.

RED 결과:

```text
Error: Cannot find module '../visionApprovedLabelConflictDecisionApply'
```

## GREEN 구현

추가된 계약:

- `visionApprovedLabelConflictDecisionApply.js`
- `scripts/apply-vision-approved-label-conflict-decisions.js`
- `npm run vision:label-conflicts:apply`

운영 순서:

```powershell
npm run vision:label-conflicts:packet
npm run vision:label-conflicts:decision-template
npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>
npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json>
npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json> --apply
npm run migration:verify-post-hitl
```

## 안전 정책

이 단계의 외부 서비스 쓰기는 항상 `serviceWritesPerformed=false`이다. 실제
파일 변경 여부는 `localFixtureWritesPerformed`로 별도 표시한다. Graph promotion,
Reference learning, model training은 계속 금지된다.
