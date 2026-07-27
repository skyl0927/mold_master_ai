# Operational HITL Review Session Plan TDD

## 목적

HITL worktable suggestion은 59개 row를 모두 보여주지만, 사람이 실제로 판정할
때는 라벨 충돌, 재촬영, Vision 승인 후보, Web 카드 승인 후보를 다른 기준으로
검토해야 한다. `operational-hitl-review-session-plan/v1`는 추천 row를 검토
세션으로 나눠 사람이 우선순위와 필수 확인 항목을 잃지 않게 한다.

## RED

```powershell
node --test tests\operationalHitlReviewSessionPlan.test.js
```

초기 실패는 `../operationalHitlReviewSessionPlan` 모듈 누락으로 발생했다.
테스트는 다음 안전 계약을 먼저 고정했다.

- suggestion artifact가 없으면 `missing_evidence`로 fail-closed 처리한다.
- 세션 플랜은 `operational-hitl-review-session-plan/v1`로 생성된다.
- 라벨 충돌 세션, 재촬영 세션, Web 카드 승인 세션이 우선순위 순서로 정렬된다.
- copyableFields는 해당 row의 requiredFields에 필요한 값만 보여준다.
- `newAction` 자동 입력, 자동 검증, 자동 적용, Graph/Reference/Model 승격은 금지된다.

## GREEN

```powershell
npm run test:operational-hitl-review-session-plan
```

결과: 3개 테스트 통과.

## 운영 검증

```powershell
npm run operational:hitl:review-session-plan
```

현재 artifact 기준 CLI 결과:

- 상태: `ready_for_human_review`
- 전체 row: 59
- 검토 세션: 4
- 고위험 row: 9
- 재촬영 row: 5
- Vision 승인 후보: 7
- Web 카드 승인 후보: 43
- needs_review row: 4

`operational:hitl:pipeline-status`도 최신 review session plan을 읽어 `검토 세션`
및 `고위험 row`를 summary와 Markdown에 표시한다.

## Settings UI 연동

Settings의 `비전 릴리스 게이트` 영역에 `Session Plan 등록` 버튼을 추가했다.
최신 `artifacts/operational-hitl-review-session-plan-*.json`을 등록하면
`Vision 운영 작업 목록` 아래에 `HITL Review Session Plan` 카드가 표시된다.

카드는 전체 row, 세션 수, 고위험 row, 재촬영/Vision/Web 후보 수를 요약하고,
최대 4개 세션과 세션별 상위 2개 row의 copyableFields/manualConfirmationFields를
보여준다. 이 UI도 원본 CSV를 수정하지 않고 localStorage에 표시용 artifact만
저장한다.
