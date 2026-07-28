# Operational HITL Review Session Progress TDD

## 목적

세션 패킷은 사람이 검토할 파일을 나눠주지만, 원본 worktable CSV를 일부 작성한
뒤에는 어느 세션이 완료, 대기, 오류 상태인지 다시 확인해야 한다.
`operational-hitl-review-session-progress/v1`은 review session plan과
worktable-import dry-run 결과를 대조해 세션별 진행률을 계산한다.

## RED

```powershell
node --test tests\operationalHitlReviewSessionProgress.test.js
```

초기 실패는 `../operationalHitlReviewSessionProgress` 모듈 누락으로 발생했다.
테스트는 다음 계약을 먼저 고정했다.

- 세션별 completed/pending/invalid row 수를 계산한다.
- invalid row는 누락 필드와 action을 세션별 preview로 보여준다.
- 모든 row가 유효하면 `ready_for_worktable_apply`로 안내한다.
- `worktable-import -- --apply` 후에는 `ready_for_preflight`로 안내한다.
- review session plan 또는 worktable import 증거가 없으면 `missing_evidence`로
  fail-closed 처리한다.
- 진행률 계산은 외부 서비스, SQL, Graph, Reference store, 모델 학습에 쓰지 않는다.
- simulation-only CSV 차단 스모크 artifact는 실제 사람 진행률로 취급하지 않고
  `ignoredSimulationOnlyRows`로만 집계한다.

## GREEN

```powershell
npm run test:operational-hitl-review-session-progress
```

결과: 5개 테스트 통과.

추가 RED/GREEN:

- RED: `npm run test:operational-hitl-review-session-progress`가 실패했다. 최신
  simulation-only import 안전 스모크 artifact가 세션별 invalid row로 계산되어
  모든 세션이 `invalid_worktable`로 보였기 때문이다.
- GREEN: 같은 테스트가 통과했다. 이제 simulation-only import는 세션 진행률에서
  무시되고, 실제 사람이 아직 채우지 않은 row는 `pending`으로 남는다.

## 운영 검증

```powershell
npm run operational:hitl:session-progress
```

이 명령은 최신 `operational-hitl-review-session-plan-*.json`,
`operational-hitl-review-session-packet-*.json`,
`operational-hitl-decision-worktable-import-*.json`을 읽어 JSON/Markdown 진행률
리포트를 생성한다. 사람이 CSV 판정을 채운 뒤 먼저 `operational:hitl:worktable-import`
dry-run을 실행하고, 이어서 이 명령으로 세션별 완료율과 오류 row를 확인한다.

2026-07-28 실제 artifact 기준 실행 결과:

- 상태: `awaiting_human_csv_decisions`
- 전체 row: 59
- 완료 row: 0
- 대기 row: 59
- 오류 row: 0
- 무시된 simulation-only import row: 59
- 차단 세션: 0

`operational:hitl:pipeline-status`도 최신 session progress artifact를 읽어 세션
완료 row, 대기 row, 오류 row를 summary와 Markdown에 표시한다.
