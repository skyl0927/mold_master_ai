# Operational Status Bundle Preparation Run TDD Evidence

## Source Plan

Derived during the operational handoff closure work on 2026-07-28. The user need is to continue the current work after logout/new login and to expose generated HITL/Web worksheet artifacts from the one-step Operational Status Bundle.

## User Journeys

- As an operator, I want the Operational Status Bundle to show whether the preparation run completed, so that I know the HITL package generation state without searching the artifacts folder.
- As an operator, I want Web HITL Markdown/CSV worksheet paths visible in the bundle and Settings display, so that I can open the exact files that require human review.
- As an operator, I want all generated HITL decision-template paths and human-gated commands visible in the bundle and Settings display, so that I know exactly what to fill and what must not run until human decisions are complete.
- As a developer, I want the CLI bundle builder to automatically include the latest preparation-run artifact, so that new handoff bundles preserve the same context.

## RED Evidence

| Command | Result | Intended Failure |
|---|---|---|
| `npm run test:operational-status-bundle` | FAIL, 5/6 pass | `bundle.summary.preparationRunStatus` was `undefined` instead of `completed`. |
| `npm run test:vision-operational-hitl-display` | FAIL, 27/28 pass | `display.preparationRunText` was `undefined` instead of the preparation summary text. |
| `npm run test:operational-status-bundle` | FAIL, 5/6 pass | `bundle.summary.preparationDecisionTemplates` was `undefined` instead of `3`. |
| `npm run test:vision-operational-hitl-display` | FAIL, 27/28 pass | `display.preparationDecisionTemplatePaths` was `undefined` instead of the three generated decision-template paths. |

The RED checkpoint commits are `708f9fa test: add preparation run status bundle coverage` and `b0a789b test: cover preparation handoff templates`.

## GREEN Evidence

| Command | Result | Guarantee |
|---|---|---|
| `npm run test:operational-status-bundle` | PASS, 6/6 | The bundle accepts `operational-hitl-preparation-run/v1`, summarizes generated/worksheet/human-gated counts, adds `open_preparation_run_outputs`, and lists Web HITL worksheet paths in Markdown. |
| `npm run test:vision-operational-hitl-display` | PASS, 28/28 | Settings display summaries expose preparation run text, preparation JSON path, and worksheet paths for UI rendering. |
| `npm run test:operational-status-bundle` | PASS, 6/6 | The bundle lists all generated decision-template JSON paths and human-gated verify/apply commands without executing them. |
| `npm run test:vision-operational-hitl-display` | PASS, 28/28 | Settings display summaries expose decision-template paths and human-gated command text for operator handoff. |

## Known Gaps

- This change does not automatically approve, import, or promote Web HITL data into Graph/Reference/Model learning.
- The Settings UI displays preparation-run evidence but does not persist it as a separately restorable artifact state; the Operational Status Bundle itself remains the handoff source.
- Full build/type/security verification is recorded in the implementation handoff response for this task.
