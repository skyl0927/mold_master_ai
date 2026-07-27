# Web Knowledge HITL Decision Apply Gate TDD

## Source Plan

Derived from the current Mold Master AI roadmap: verified Web Case HITL batch
decisions must not write directly to Common Agent, SQL, Graph, or model training.
They must first pass a local dry-run/apply gate tied to the current card content
hash.

## User Journeys

- As a reviewer, I want a dry-run report before importing verified Web Case HITL
  decisions, so that I can confirm the batch will not mutate the local approval
  ledger by accident.
- As an operator, I want explicit `--apply` to write only the local HITL ledger,
  so that central Graph promotion still requires a later manual step.
- As a system owner, I want stale or hash-mismatched decisions to fail closed, so
  that changed source cards cannot inherit old approvals.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | A verified `ready_for_local_hitl_import` report produces a no-write dry-run plan by default | `tests/webKnowledgeHitlDecisionApply.test.js` | unit | PASS | `npm run test:web-knowledge-hitl-apply` |
| 2 | Explicit apply writes approved, needs-changes, and rejected decisions to the local ledger only | `tests/webKnowledgeHitlDecisionApply.test.js` | unit | PASS | `npm run test:web-knowledge-hitl-apply` |
| 3 | Non-ready verification reports do not mutate the ledger | `tests/webKnowledgeHitlDecisionApply.test.js` | unit | PASS | `npm run test:web-knowledge-hitl-apply` |
| 4 | Current card hash mismatch stops the entire apply operation without partial writes | `tests/webKnowledgeHitlDecisionApply.test.js` | unit | PASS | `npm run test:web-knowledge-hitl-apply` |
| 5 | The new apply gate stays wired into the Web Knowledge suite | `package.json:test:web-knowledge` | integration | PASS | `npm run test:web-knowledge` passed 51/51 |
| 6 | The new apply gate stays wired into the contract suite | `scripts/run-contract-tests.js` | contract | PASS | `npm run test:contracts` passed 126/126 |
| 7 | Current real artifact remains no-write because HITL decisions are not ready | `npm run knowledge:web:hitl:apply` | operational dry-run | PASS | `status=not_ready_for_apply`, `serviceWritesPerformed=false`, `localLedgerWritesPerformed=false` |

## RED/GREEN Evidence

- RED: `node --test tests\webKnowledgeHitlDecisionApply.test.js` failed with
  `Cannot find module '../webKnowledgeHitlDecisionApply'` before production code
  existed.
- GREEN: `npm run test:web-knowledge-hitl-apply` passed 4/4 tests after adding
  the apply report module, ledger batch import, and CLI wiring.
- Regression: `npm run test:web-knowledge` passed 51/51 and
  `npm run test:contracts` passed 126/126 after wiring the new test target.
- Build: `npm run build` completed successfully. It emitted only stale
  Browserslist/baseline data maintenance warnings.

## Coverage And Known Gaps

- Focused unit and contract coverage prove local fail-closed behavior. Electron
  UI wiring is not required for this stage because the new path is a CLI/manual
  artifact gate.
- The command intentionally does not call Common Agent, SQL, Neo4j, or any model
  training endpoint. Central promotion remains covered by the existing separate
  readiness and manual ingestion gates.
