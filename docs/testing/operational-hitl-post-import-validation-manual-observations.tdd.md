# Operational HITL Post-Import Manual Observations TDD Evidence

## Source Plan

User goal continuation: after graph post-import observations are captured from
Common Agent, Vision label roundtrip and label-conflict validation still need a
safe manual observation path until a read-only Common Agent dataset contract is
confirmed.

## User Journeys

- As an operator, I want a CSV template for missing Vision and label-conflict
  post-import validation cases, so that I can record human-confirmed read-only
  observations without editing raw JSON.
- As a release owner, I want filled manual observations merged with graph
  observations into one `operational-hitl-post-import-validation-observations/v1`
  artifact, so that the evidence/result gates can validate the full case set.
- As a safety owner, I want incomplete manual rows to fail closed without
  inventing approval evidence or writing to Graph, Reference, model, or Common
  Agent services.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | The manual template includes only missing Vision and label-conflict cases, excluding already observed graph cases. | `tests/operationalHitlPostImportValidationManualObservations.test.js` | unit | PASS | `manualCaseIds=['vision-sink-001','label-conflict-001']` |
| 2 | The template is artifact-only and writes no service data. | `tests/operationalHitlPostImportValidationManualObservations.test.js` | unit | PASS | `serviceWritesPerformed=false`, `automaticServiceWritesAllowed=false` |
| 3 | Filled manual observation CSV rows merge with existing graph observations into a complete observations artifact. | `tests/operationalHitlPostImportValidationManualObservations.test.js` | unit | PASS | status `ready_for_evidence_build`, results length `3` |
| 4 | The merged observations artifact can feed the evidence builder and clear missing cases. | `tests/operationalHitlPostImportValidationManualObservations.test.js` | unit | PASS | evidence status `ready_for_post_import_validation_result` |
| 5 | Empty or incomplete manual rows fail closed and preserve only existing observations. | `tests/operationalHitlPostImportValidationManualObservations.test.js` | unit | PASS | status `invalid_manual_observations`, invalid rows `2` |
| 6 | Blocked validation plans emit no manual rows. | `tests/operationalHitlPostImportValidationManualObservations.test.js` | unit | PASS | status `blocked_validation_plan_not_ready` |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlPostImportValidationManualObservations.test.js`
  failed with `MODULE_NOT_FOUND` for
  `../operationalHitlPostImportValidationManualObservations`.
- GREEN: `npm run test:operational-hitl-post-import-validation-manual-observations`
  passed 4/4 tests after adding the manual template/import module and CLIs.
- Focused regression: post-import observations, evidence, and pipeline status
  focused tests passed after wiring the new commands into the flow.

## Operational Smoke

- `npm run operational:hitl:post-import-validation-manual-template` reported
  `blocked_validation_plan_not_ready`, `manualRows=0` with no service writes
  because the latest validation plan is still blocked.
- `npm run operational:hitl:post-import-validation-manual-import` preserved the
  same blocked status and produced no imported rows.
- `npm run operational:hitl:post-import-validation-evidence` also preserved
  `blocked_validation_plan_not_ready`.

## Coverage And Gaps

Focused tests cover CSV template generation, manual CSV import, merge with graph
observations, evidence-builder integration, incomplete row blocking, and blocked
plan safety. The remaining operational gap is still upstream: HITL CSV decisions
must be completed before Common Agent import package readiness can unlock real
post-import validation cases.
