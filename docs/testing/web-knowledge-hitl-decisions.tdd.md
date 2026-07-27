# Web Knowledge HITL Decisions TDD

작성일: 2026-07-27

## Source Plan

웹 크롤링으로 확보한 사출 성형 결함 case 40건 이상을 데이터 카드로 만들고,
HITL 검증 후 Common Agent와 Graph 학습 절차로 넘기는 계획에서 파생했다.
이 변경은 사람이 UI로 한 건씩 승인하는 흐름 외에 Common Agent/보조 에이전트가
채울 수 있는 batch 판정 파일 경로를 추가한다.

## User Journeys

- 운영자는 미승인 또는 stale Web Case를 Common Agent가 채울 수 있는 JSON
  판정 템플릿으로 내보내고 싶다.
- 운영자는 채워진 판정 파일이 현재 카드 hash와 묶였는지 검증하고 싶다.
- 운영자는 검증 보고서가 로컬 원장, Common Agent, Graph에 직접 쓰지 않기를
  원한다.

## Test Specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | 미승인/stale Web Case만 no-write HITL decision template에 포함된다. | `tests/webKnowledgeHitlDecisions.test.js` | contract | PASS | `npm run test:web-knowledge` |
| 2 | 완성된 `approve_card`, `mark_needs_changes`, `reject_card` 판정은 local ledger import plan으로 정규화된다. | `tests/webKnowledgeHitlDecisions.test.js` | contract | PASS | `npm run test:web-knowledge` |
| 3 | duplicate, hash mismatch, 승인 필드 누락은 `invalid_decisions`로 fail-closed 처리된다. | `tests/webKnowledgeHitlDecisions.test.js` | safety contract | PASS | `npm run test:web-knowledge` |
| 4 | 미작성 `pending` 템플릿은 오류가 아니라 `awaiting_human_review`로 보고된다. | `tests/webKnowledgeHitlDecisions.test.js` | workflow contract | PASS | `npm run test:web-knowledge` |

## RED/GREEN Evidence

- RED: `npm run test:web-knowledge` 실패. 원인:
  `Cannot find module '../webKnowledgeHitlDecisionTemplate'`.
- GREEN: `npm run test:web-knowledge`에서 47개 테스트 모두 통과.
- 추가 RED: stale 승인 카드가 batch 재검토 대상으로 들어왔을 때 검증기가
  `invalid_decisions`로 막았다.
- 추가 GREEN: stale 카드는 현재 source hash가 맞으면 새 판정으로 허용하고,
  hash mismatch와 필수 승인 필드 누락은 계속 차단한다.

## Current Artifact Evidence

```powershell
npm run knowledge:web:hitl:decision-template
npm run knowledge:web:hitl:verify-decisions
```

현재 PC artifact 기준:

- 템플릿 생성: 43건
- 현재 승인: 0건
- 검증 상태: `awaiting_human_review`
- accepted decisions: 0건
- invalid decisions: 0건
- 자동 쓰기: `serviceWritesPerformed=false`

## Known Gaps

- 검증 보고서는 `localLedgerUpdates` import plan만 생성한다. 실제 로컬 HITL
  원장 반영은 아직 별도 수동 import 절차가 필요하다.
- Common Agent 후보 적재, 중앙 승인, Graph 왕복 검증은 HITL 판정 적용 후
  별도 단계로 남아 있다.
