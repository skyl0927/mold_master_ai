# Web Knowledge Common Agent Learning Package TDD

## Source Plan

Derived from the active Mold Master AI plan: collect approximately 40 injection
molding defect Web Cases, create cause/evidence/countermeasure data cards,
complete HITL verification, hand approved data to Common Agent, then validate
Mold Master AI with graph-approved evidence.

## User Journeys

- As an operator, I want only human-approved Web Case rows packaged for Common
  Agent manual review, so that pending, rejected, or needs-change content cannot
  enter Graph/RAG learning.
- As a release reviewer, I want the package to stay no-write and block unsafe
  verification reports, so that Common Agent, Graph, reference learning, and
  model training are never triggered by an artifact build.
- As a validation owner, I want graph roundtrip cases prepared only after
  central approval, so that Mold Master AI can be checked with
  `graph_approved_only` evidence.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Approved Web Case HITL rows are converted into Common Agent candidate items and a tacit-knowledge template, while non-approved rows are counted but not packaged. | `tests/webKnowledgeCommonAgentLearningPackage.test.js` | unit/contract | PASS | `npm run test:web-knowledge-common-agent-package` |
| 2 | Central Common Agent approval changes the package from manual import mode to graph roundtrip validation mode. | `tests/webKnowledgeCommonAgentLearningPackage.test.js` | unit/contract | PASS | `ready_for_graph_roundtrip_validation` assertion |
| 3 | Incomplete local HITL approval blocks all payloads. | `tests/webKnowledgeCommonAgentLearningPackage.test.js` | fail-closed contract | PASS | `blocked_local_hitl_incomplete` assertion |
| 4 | Unsafe or non-ready verification reports are blocked and produce no graph roundtrip cases. | `tests/webKnowledgeCommonAgentLearningPackage.test.js` | fail-closed contract | PASS | `unsafe_verification_report` assertion |

## RED/GREEN Evidence

- RED: `node --test tests/webKnowledgeCommonAgentLearningPackage.test.js`
  failed with `MODULE_NOT_FOUND` for `../webKnowledgeCommonAgentLearningPackage`.
- GREEN: `npm run test:web-knowledge-common-agent-package` passed 4/4 tests.

## Known Gaps

- The package is artifact-only. It intentionally does not call Common Agent,
  SQL, Graph DB, reference learning, or model training.
- Actual 40-card production approval still requires human decisions and central
  Common Agent review before Mold Master graph roundtrip validation can pass.
