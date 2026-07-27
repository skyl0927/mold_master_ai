# Operational HITL Worktable Suggestion TDD

## 목적

HITL 병목은 사람이 `newAction`과 필수 검토 필드를 직접 채워야 한다는 점이다.
자동 승인은 금지해야 하지만, 행별 추천 action과 검토 포인트를 별도 초안으로
제공하면 입력 시간을 줄일 수 있다.

## RED

```powershell
node --test tests\operationalHitlDecisionWorktableSuggestion.test.js
```

초기 실패는 `../operationalHitlDecisionWorktableSuggestion` 모듈 누락으로
발생했다. 테스트는 다음 안전 계약을 먼저 고정했다.

- 추천표는 `operational-hitl-decision-worktable-suggestion/v1`로 생성된다.
- 원본 import 대상인 `newAction` 셀은 자동으로 채우지 않는다.
- 도식/비제조 이미지 위험이 있는 Vision 후보는 승인 대신 `request_recapture`를 추천한다.
- 실제 제품 근거가 있는 Vision 후보도 `approve_candidate`는 사람 확인 후보로만 표시한다.
- Web Knowledge 카드가 완성되면 `approve_card` 후보로, 필수 필드가 비면 `mark_needs_changes`로 분리한다.

## GREEN

```powershell
node --test tests\operationalHitlDecisionWorktableSuggestion.test.js
```

결과: 4개 테스트 통과.

## 운영 검증

```powershell
npm run operational:hitl:worktable-suggest
```

이 명령은 최신 worktable export를 읽어 추천 JSON/CSV/Markdown만 생성한다.
`suggested*` 컬럼은 사람이 원본 worktable CSV에 옮겨 적기 위한 보조 정보이며,
자동 적용, 자동 검증, Graph/Reference/Model 승격은 수행하지 않는다.

현재 artifact 기준 CLI 결과:

- 상태: `ready_for_human_review`
- 전체 row: 59
- 추천 row: 59
- 재촬영 추천: 5
- Vision 승인 후보: 7
- Web 카드 승인 후보: 43
- 라벨 충돌 needs_review 추천: 4
