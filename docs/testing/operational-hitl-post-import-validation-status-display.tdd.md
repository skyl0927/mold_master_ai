# Operational HITL Post-Import Validation Status Display TDD

## Source Plan

This work continues the active operational plan for the Mold Master AI and Common Agent integration. The specific user journey was derived during implementation: an operator needs one status surface that shows not only the post-import validation result gate, but also the observation, manual observation, and evidence collection stages that lead to that result.

## User Journey

As a quality operator, I want the Settings status card and pipeline CLI output to show post-import observation, manual observation, evidence, and result readiness, so that I can run the Common Agent validation loop in the correct order without guessing which artifact is missing.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Pipeline status summaries expose post-import observation, manual observation, and evidence metrics with source artifact paths and stage trail entries. | `tests/operationalHitlPipelineStatus.test.js` | Unit | PASS | RED: missing `postImportValidationObservationStatus`; GREEN: `npm run test:operational-hitl-pipeline-status` passed 13/13. |
| 2 | Settings UI display summaries include post-import case count, graph observation coverage, graph failures, manual rows, evidence coverage, missing evidence, and result status. | `tests/visionOperationalHitlWorkflowDisplay.test.js` | Unit | PASS | RED: status label stayed generic `조치 필요`; GREEN: `npm run test:vision-operational-hitl-display` passed 27/27. |
| 3 | The real pipeline status command remains fail-closed at the current human CSV bottleneck while exposing the new post-import fields. | `npm run operational:hitl:pipeline-status` | Smoke | PASS | Output status `action_required`, stage `awaiting_human_csv_decisions`, post-import fields present as `blocked_validation_plan_not_ready` or zero counts. |

## Known Gaps

The real operational loop is still waiting on HITL CSV decisions, so live Common Agent post-import validation cannot complete yet. This change improves visibility and sequencing, but it does not replace the required human review of the 59-row decision worktable.
