# Operational HITL Human Decision Brief TDD

## 목적

HITL 세션 패킷과 진행률 리포트가 준비되어도 판정자는 어떤 세션 파일을 먼저
열고, 원본 worktable CSV의 어떤 필드를 채워야 하는지 한 번 더 조합해야 했다.
`operational-hitl-human-decision-brief/v1`은 pipeline status, session plan,
session packet, session progress를 하나의 작업 브리프로 묶는다.

이 브리프는 원본 CSV, editable JSON, Common Agent, SQL, Graph, Reference store,
모델 학습에 쓰지 않는 artifact-only 안내 산출물이다.

## RED

```powershell
node --test tests\operationalHitlHumanDecisionBrief.test.js
```

초기 실패는 `../operationalHitlHumanDecisionBrief` 모듈 누락으로 발생했다.
테스트는 다음 계약을 먼저 고정했다.

- 현재 병목이 사람 CSV 입력이면 `ready_for_human_entry`로 표시한다.
- 다음 세션, 다음 decision id, 원본 worktable CSV 경로를 summary에 표시한다.
- 세션별 packet Markdown/CSV 경로, copyable field, manual confirmation field를
  함께 보여준다.
- invalid row가 있으면 pending보다 먼저 `fix_invalid_human_entries`로 라우팅한다.
- 긴 원인/대책 copyable 값은 Markdown에서 축약하고, 전체 값은 JSON/세션 패킷에서
  확인하게 한다.
- 필수 evidence가 없으면 `missing_evidence`로 fail-closed 처리한다.
- 자동 `newAction` 입력, 자동 적용, Graph/Reference/Model 승격은 금지한다.

## GREEN

```powershell
npm run test:operational-hitl-human-brief
```

결과: 3개 테스트 통과.

## 운영 검증

```powershell
npm run operational:hitl:human-brief
```

2026-07-28 실제 artifact 기준 CLI 결과:

- 상태: `ready_for_human_entry`
- 현재 단계: `awaiting_human_csv_decisions`
- 전체 row: 59
- 완료 row: 0
- 대기 row: 59
- 오류 row: 0
- 고위험 row: 9
- 다음 세션: `label_conflict_session`
- 다음 decision id: `conflict-001`

생성되는 Markdown은 우선 처리 세션과 작업 순서를 먼저 보여주며, Web 카드의 긴
원인/대책 필드는 브리프 안에서 축약한다. 전체 내용은 세션 패킷 또는 JSON에서
확인한다.
