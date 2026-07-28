# Operational HITL Post-Import Validation Evidence TDD Evidence

## Source Plan

User goal continuation: after Common Agent manual import review, Mold Master AI
must collect validation evidence from actual post-import observations before
post-import validation can pass.

## User Journeys

- As an operator, I want a no-write evidence artifact, so that Common Agent and
  Mold Master validation observations can be reviewed before release.
- As a graph quality owner, I want captured Common Agent graph answers normalized
  into citations, reasoning paths, evidence policy, and evidence keywords, so
  that Graph grounding can be checked automatically.
- As a release owner, I want missing observations to remain explicit, so that
  unexecuted validation cases are not treated as passed.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Captured Common Agent and manual observations are normalized into `operational-hitl-post-import-validation-evidence/v1` without writes. | `tests/operationalHitlPostImportValidationEvidence.test.js` | unit | PASS | `npm run test:operational-hitl-post-import-validation-evidence` |
| 2 | Graph observations preserve `graph_approved_only`, citations, reasoning paths, answer text, and evidence keywords. | `tests/operationalHitlPostImportValidationEvidence.test.js` | unit | PASS | graph case response includes citation `graph:path:web-case-001` |
| 3 | Missing observations produce `awaiting_validation_execution` without inventing passing evidence. | `tests/operationalHitlPostImportValidationEvidence.test.js` | unit | PASS | `observedCases=0`, `missingCases=3`, `results=[]` |
| 4 | Partial observations stay partial and expose missing case IDs. | `tests/operationalHitlPostImportValidationEvidence.test.js` | unit | PASS | `partial_evidence_collected`, missing Vision and label conflict cases |
| 5 | Blocked validation plans and unsafe observation artifacts fail closed. | `tests/operationalHitlPostImportValidationEvidence.test.js` | unit | PASS | `blocked_validation_plan_not_ready`, `unsafe_observations` |
| 6 | Result validation waits instead of failing when an evidence artifact exists but execution has not run. | `tests/operationalHitlPostImportValidationResult.test.js` | unit | PASS | `awaiting_validation_evidence` |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlPostImportValidationEvidence.test.js`
  failed with `MODULE_NOT_FOUND` for
  `../operationalHitlPostImportValidationEvidence`.
- RED: `node --test tests\operationalHitlPostImportValidationResult.test.js`
  failed because `awaiting_validation_execution` evidence was treated as
  `validation_failed`.
- GREEN: `npm run test:operational-hitl-post-import-validation-evidence` passed
  4/4 tests after adding the evidence builder and CLI.
- GREEN: `npm run test:operational-hitl-post-import-validation-result` passed
  5/5 tests after teaching the result gate to wait for unexecuted evidence.

## Operational Smoke

- `npm run operational:hitl:post-import-validation-evidence` wrote a no-write
  artifact and reported `blocked_validation_plan_not_ready` because the latest
  validation plan is still blocked by pending HITL/Common Agent import package
  readiness.
- `npm run operational:hitl:post-import-validation-result` also reported
  `blocked_validation_plan_not_ready`, preserving the same fail-closed state.

## Coverage And Gaps

Focused tests cover evidence normalization, graph grounding fields, missing
case accounting, unsafe observation blocking, and result-gate waiting behavior.
This does not yet perform live `/v1/ask` execution inside the evidence script;
the current contract expects captured observations to be provided through the
`--observations` file after Common Agent/Mold Master validation cases are run.
