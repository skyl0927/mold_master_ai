# Vision Pending HITL Non-Approval Worklist TDD

## Source Plan

Derived from the current Vision diagnosis advancement roadmap: HITL decisions
must separate approved learning candidates from needs-review, rejected, and
recapture outcomes before any Common Agent, Graph, reference learning, or model
training action can occur.

## User Journeys

- As a quality reviewer, I want non-approval HITL decisions to become a separate
  worklist, so that rejected or uncertain images are not mixed into approval
  imports.
- As a capture operator, I want recapture requests to preserve requested views,
  so that the next image closes the original Vision uncertainty.
- As a system owner, I want not-ready decision reports to fail closed, so that
  partial HITL decisions cannot trigger downstream learning.

## Test Specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Ready decision reports produce artifact-only worklists for needs-review, rejected, and recapture decisions | `tests/visionPendingHitlNonApprovalWorklist.test.js` | unit | PASS | `npm run test:vision-hitl-non-approval-worklist` |
| 2 | Approval candidates are excluded from the non-approval worklist | `tests/visionPendingHitlNonApprovalWorklist.test.js` | unit | PASS | `npm run test:vision-hitl-non-approval-worklist` |
| 3 | Recapture requests preserve requested capture views | `tests/visionPendingHitlNonApprovalWorklist.test.js` | unit | PASS | `npm run test:vision-hitl-non-approval-worklist` |
| 4 | Non-ready or missing verification reports produce no work items and keep all learning/Graph flags false | `tests/visionPendingHitlNonApprovalWorklist.test.js` | unit | PASS | `npm run test:vision-hitl-non-approval-worklist` |
| 5 | The current real artifact produces no downstream work while HITL decisions are still pending | `npm run vision:hitl:non-approval-worklist` | operational dry-run | PASS | `status=not_ready_for_non_approval_worklist`, `totalItems=0`, `serviceWritesPerformed=false` |
| 6 | The new worklist remains covered by the contract suite | `scripts/run-contract-tests.js` | contract | PASS | `npm run test:contracts` passed 131/131 |
| 7 | Readiness/worklist artifacts surface non-approval worklist readiness without service writes | `tests/visionOperationalReadinessAudit.test.js` | integration | PASS | `node --test tests\visionOperationalReadinessAudit.test.js` passed 6/6 |

## RED/GREEN Evidence

- RED: `node --test tests\visionPendingHitlNonApprovalWorklist.test.js` failed
  with `Cannot find module '../visionPendingHitlNonApprovalWorklist'` before
  production code existed.
- GREEN: `npm run test:vision-hitl-non-approval-worklist` passed 4/4 after
  adding the worklist module and CLI.
- Operational dry-run: `npm run vision:hitl:non-approval-worklist` produced
  `status=not_ready_for_non_approval_worklist` with zero items and no service
  writes because the live decision verification report is still awaiting human
  review.
- Readiness integration: `node --test tests\visionOperationalReadinessAudit.test.js`
  passed 6/6 after adding `nonApprovalWorklist` and `nextCommands` to the HITL
  workflow gate.
- Regression/build: `npm run test:contracts` passed 131/131 and `npm run build`
  completed successfully. Build emitted only stale Browserslist/baseline data
  maintenance warnings.

## Coverage And Known Gaps

- This is an artifact-only gate. It intentionally does not write to Common Agent,
  SQL, Graph, reference store, or training outputs.
- Full dedicated UI management for individual non-approval work items is a
  follow-up. The current stage surfaces readiness/display summary counts and
  provides deterministic CLI and contract coverage for Common Agent/Antigravity
  handoff.
