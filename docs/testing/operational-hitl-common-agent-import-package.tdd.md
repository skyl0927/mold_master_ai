# Operational HITL Common Agent Import Package TDD Evidence

## Source Plan

User goal continuation: after HITL worktable export, create a safe Common Agent
handoff stage that only packages verified human decisions and never promotes
unverified data into Graph, Reference, or model learning.

## User Journeys

- As an operator, I want verified label conflict, Vision HITL, and Web Knowledge
  HITL reports combined into one package, so that Common Agent can review the
  import candidate set without chasing three separate artifacts.
- As a safety owner, I want pending or missing verification reports to produce
  an empty payload, so that unreviewed data cannot enter Graph or model learning.
- As a Common Agent reviewer, I want approved Web Knowledge cards transformed
  into graph knowledge candidates with provenance, so that human-approved
  cause/countermeasure data can be reviewed before any Graph promotion.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Fully ready HITL verification reports produce one artifact-only Common Agent review package. | `tests/operationalHitlCommonAgentImportPackage.test.js` | unit | PASS | `npm run test:operational-hitl-common-agent-import-package` |
| 2 | Pending verification reports fail closed and emit no import payload arrays. | `tests/operationalHitlCommonAgentImportPackage.test.js` | unit | PASS | `blocked_pending_hitl_verification`, `manualImportAllowed=false` |
| 3 | Missing verification evidence fails closed with missing queue codes. | `tests/operationalHitlCommonAgentImportPackage.test.js` | unit | PASS | `blocked_missing_verification_reports`, `missingReportCodes=['vision_hitl']` |
| 4 | Current real artifacts are blocked because all three HITL queues are still awaiting human review. | `npm run operational:hitl:common-agent-import-package` | CLI smoke | PASS | output `sourceReportsReady=0`, `blockingReports=3`, payload counts all 0 |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlCommonAgentImportPackage.test.js` failed
  with `MODULE_NOT_FOUND` for `../operationalHitlCommonAgentImportPackage`.
- GREEN: `npm run test:operational-hitl-common-agent-import-package` passed 3/3
  tests after adding the package builder and CLI.

## Coverage And Gaps

Focused tests cover ready packaging, pending fail-closed behavior, missing
evidence handling, payload mapping, and policy flags. The gate is still not
operationally closed because the current real HITL decision files remain
unreviewed; the generated package correctly blocks import until human decisions
are verified.
