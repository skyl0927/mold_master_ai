# Web Knowledge Operational Readiness TDD

작성일: 2026-07-27

## Source Plan

사출 성형 결함 case 약 40건을 웹 수집하고, 원인/근거/대책 데이터 카드로 만든
뒤 HITL 검증, Common Agent 확인 및 학습 절차, Mold Master Graph 재검증으로
이어가는 운영 계획에서 파생했다.

## User Journeys

- 운영자는 수집 카드 수, 품질 감사, Common Agent 비저장 검증, HITL 승인,
  중앙 승인 상태를 한 artifact에서 보고 싶다.
- 운영자는 40건 수집은 끝났지만 사람 승인이 안 된 상태를 “데이터 부족”이
  아니라 “HITL 미완료”로 구분하고 싶다.
- 운영자는 사람 승인 전 자동 적재, 자동 Graph 승격, 모델 학습이 계속
  차단되기를 원한다.

## Test Specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | 43개 카드와 Common Agent 비저장 검증 43/43이 통과해도 HITL 승인 0건이면 `awaiting_hitl_review`로 남는다. | `tests/webKnowledgeOperationalReadiness.test.js` | unit/contract | PASS | `npm run test:web-knowledge` |
| 2 | 품질 감사 실패 또는 Common Agent 검증 누락은 fail-closed blocker로 표시한다. | `tests/webKnowledgeOperationalReadiness.test.js` | safety contract | PASS | `npm run test:web-knowledge` |
| 3 | 로컬 HITL 40건 이상 승인 후에도 중앙 승인 수가 부족하면 `awaiting_common_agent_approval`로 남는다. | `tests/webKnowledgeOperationalReadiness.test.js` | workflow contract | PASS | `npm run test:web-knowledge` |
| 4 | 수집, 품질, 비저장 검증, 로컬 HITL, 중앙 승인이 모두 40건 이상이면 Graph 왕복 검증 준비 상태가 된다. | `tests/webKnowledgeOperationalReadiness.test.js` | readiness contract | PASS | `npm run test:web-knowledge` |

## RED/GREEN Evidence

- RED: `npm run test:web-knowledge` 실패. 원인:
  `Cannot find module '../webKnowledgeOperationalReadiness'`.
- GREEN: `npm run test:web-knowledge`에서 43개 테스트 모두 통과.

## Current Artifact Evidence

```powershell
npm run knowledge:web:audit
npm run knowledge:web:readiness
```

현재 PC artifact 기준:

- 수집 카드: 43/40
- 결함 class: 22
- Common Agent 비저장 검증: 43/43
- 로컬 Web Case HITL 승인: 0/40
- Common Agent 중앙 승인: 0/40
- 현재 status: `awaiting_hitl_review`
- 자동 쓰기: `serviceWritesPerformed=false`

## Known Gaps

- 이 readiness는 artifact/ledger를 읽는 no-write 점검이다. Common Agent 후보
  적재나 Graph 승격을 직접 수행하지 않는다.
- 실제 학습/Graph 검증으로 넘어가려면 앱의 `DATABASE TREE > Web Case HITL`에서
  40건 이상을 승인하고, 후보 적재와 중앙 승인까지 완료해야 한다.
