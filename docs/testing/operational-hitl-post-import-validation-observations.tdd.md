# Operational HITL Post-Import Validation Observations TDD Evidence

## Source Plan

User goal continuation: after Common Agent manual import review, Mold Master AI
needs a live no-write observation capture step that can call Common Agent graph
cases and preserve manual Vision/label cases for explicit review.

## User Journeys

- As a graph quality owner, I want post-import Graph/RAG validation cases to call
  Common Agent `/v1/ask` with `graph_approved_only`, so that approved graph
  grounding can be observed before result validation.
- As an operator, I want Vision and label-conflict cases to remain manual
  observation requirements until a safe live read contract is confirmed, so that
  the system does not invent approval evidence.
- As a release owner, I want Common Agent outages captured as failed
  observations rather than hidden exceptions, so that downstream evidence/result
  gates fail closed with traceable errors.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Graph cases call Common Agent `/v1/ask` with `graph_approved_only`, reasoning paths, source app, and validation case ID. | `tests/operationalHitlPostImportValidationObservations.test.js` | unit | PASS | `npm run test:operational-hitl-post-import-validation-observations` |
| 2 | Observation capture writes no service data and leaves Vision/label cases as manual requirements. | `tests/operationalHitlPostImportValidationObservations.test.js` | unit | PASS | `manualObservationRequiredCaseIds=['vision-sink-001']` |
| 3 | Captured observations can flow into the evidence builder as partial evidence without marking missing cases passed. | `tests/operationalHitlPostImportValidationObservations.test.js` | unit | PASS | evidence status `partial_evidence_collected` |
| 4 | Common Agent failures are recorded as failed graph observations without throwing or fabricating evidence. | `tests/operationalHitlPostImportValidationObservations.test.js` | unit | PASS | status `graph_observations_collected_with_failures` |
| 5 | Blocked validation plans do not call Common Agent. | `tests/operationalHitlPostImportValidationObservations.test.js` | unit | PASS | status `blocked_validation_plan_not_ready` |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlPostImportValidationObservations.test.js`
  failed with `MODULE_NOT_FOUND` for
  `../operationalHitlPostImportValidationObservations`.
- GREEN: `npm run test:operational-hitl-post-import-validation-observations`
  passed 4/4 tests after adding the observation collector and CLI.
- GREEN integration: post-import plan, evidence, and pipeline status focused
  tests passed after adding `operational:hitl:post-import-validation-observations`
  to the recommended command flow.

## Operational Smoke

- `npm run operational:hitl:post-import-validation-observations` wrote a no-write
  observations artifact and reported `blocked_validation_plan_not_ready` because
  the latest validation plan is still blocked by pending HITL/Common Agent import
  readiness.
- `npm run operational:hitl:post-import-validation-evidence` consumed the latest
  observations safely and preserved the same blocked status.
- `npm run operational:hitl:pipeline-status` still reports the real bottleneck as
  `awaiting_human_csv_decisions`.

## Coverage And Gaps

Focused tests cover graph live-call request construction, no-write policy,
manual observation requirements, Common Agent failures, blocked plans, and
evidence-builder integration. The runner intentionally executes only Graph/RAG
`/v1/ask` cases. Vision label roundtrip and label-conflict observations remain
manual until a safe Common Agent read-only dataset contract is confirmed.
