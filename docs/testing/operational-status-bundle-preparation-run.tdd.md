# Operational Status Bundle Preparation Run TDD Evidence

## Source Plan

Derived during the operational handoff closure work on 2026-07-28. The user need is to continue the current work after logout/new login and to expose generated HITL/Web worksheet artifacts from the one-step Operational Status Bundle.

## User Journeys

- As an operator, I want the Operational Status Bundle to show whether the preparation run completed, so that I know the HITL package generation state without searching the artifacts folder.
- As an operator, I want Web HITL Markdown/CSV worksheet paths visible in the bundle and Settings display, so that I can open the exact files that require human review.
- As an operator, I want all generated HITL decision-template paths and human-gated commands visible in the bundle and Settings display, so that I know exactly what to fill and what must not run until human decisions are complete.
- As an operator, I want the generated decision-review packet visible in the bundle and Settings display, so that I can see total/pending/missing HITL input counts and the first queue to close.
- As an operator, I want the consolidated reviewer worksheet Markdown and JSON paths visible in the bundle and Settings display, so that the next human reviewer can continue from one readable handoff file.
- As an operator, I want the next-review cursor visible in the bundle and Settings display, so that I can start with the correct queue, decision id, source template, and verification command.
- As an operator, I want the next-review slip visible in the bundle and Settings display, so that I can see the first decision title, first instruction, and safety notice without opening every artifact.
- As a developer, I want the CLI bundle builder to automatically include the latest preparation-run artifact, so that new handoff bundles preserve the same context.

## RED Evidence

| Command | Result | Intended Failure |
|---|---|---|
| `npm run test:operational-status-bundle` | FAIL, 5/6 pass | `bundle.summary.preparationRunStatus` was `undefined` instead of `completed`. |
| `npm run test:vision-operational-hitl-display` | FAIL, 27/28 pass | `display.preparationRunText` was `undefined` instead of the preparation summary text. |
| `npm run test:operational-status-bundle` | FAIL, 5/6 pass | `bundle.summary.preparationDecisionTemplates` was `undefined` instead of `3`. |
| `npm run test:vision-operational-hitl-display` | FAIL, 27/28 pass | `display.preparationDecisionTemplatePaths` was `undefined` instead of the three generated decision-template paths. |
| `npm run test:operational-status-bundle` | FAIL, 5/6 pass | `bundle.summary.decisionReviewPacketStatus` was `undefined` instead of `awaiting_human_input`. |
| `npm run test:vision-operational-hitl-display` | FAIL, 27/28 pass | `display.decisionReviewText` was `undefined` instead of the consolidated pending/missing count text. |
| `npm run test:operational-status-bundle` | FAIL, 5/6 pass | `bundle.summary.reviewerWorksheetStatus` was `undefined` instead of `ready_for_human_review`. |
| `npm run test:vision-operational-hitl-display` | FAIL, 27/28 pass | `display.reviewerWorksheetText` was `undefined` instead of the reviewer worksheet handoff text. |
| `npm run test:operational-status-bundle` | FAIL, 5/6 pass | `bundle.summary.reviewerWorksheetNextReviewQueueCode` was `undefined` instead of `vision_label_conflicts`. |
| `npm run test:vision-operational-hitl-display` | FAIL, 27/28 pass | `display.reviewerWorksheetCursorText` was `undefined` instead of `Next review vision_label_conflicts · conflict-001`. |
| `npm run test:operational-status-bundle` | FAIL, 5/6 pass | `bundle.summary.reviewerWorksheetNextReviewSlipTitleKo` was `undefined` instead of the first HITL slip title. |
| `npm run test:vision-operational-hitl-display` | FAIL, 27/28 pass | `display.reviewerWorksheetSlipTitle` was `undefined` instead of the first HITL slip title. |

The RED checkpoint commits are `708f9fa test: add preparation run status bundle coverage`, `b0a789b test: cover preparation handoff templates`, `9e94a4b test: cover decision review packet handoff`, `703479f test: cover reviewer worksheet handoff`, `fe87c16 test: require next HITL review cursor`, and `799555f test: require next HITL review slip`.

## GREEN Evidence

| Command | Result | Guarantee |
|---|---|---|
| `npm run test:operational-status-bundle` | PASS, 6/6 | The bundle accepts `operational-hitl-preparation-run/v1`, summarizes generated/worksheet/human-gated counts, adds `open_preparation_run_outputs`, and lists Web HITL worksheet paths in Markdown. |
| `npm run test:vision-operational-hitl-display` | PASS, 28/28 | Settings display summaries expose preparation run text, preparation JSON path, and worksheet paths for UI rendering. |
| `npm run test:operational-status-bundle` | PASS, 6/6 | The bundle lists all generated decision-template JSON paths and human-gated verify/apply commands without executing them. |
| `npm run test:vision-operational-hitl-display` | PASS, 28/28 | Settings display summaries expose decision-template paths and human-gated command text for operator handoff. |
| `npm run operational:hitl:decision-review-packet` | PASS | The current real decision-review packet reports `totalTemplateItems=59`, `totalPendingActions=59`, and `targetDecisionInputsMissing=56` with no service writes. |
| `npm run test:operational-status-bundle` | PASS, 6/6 | The bundle summarizes the decision-review packet and previews each HITL queue's prepared/pending/target counts and verify command. |
| `npm run test:vision-operational-hitl-display` | PASS, 28/28 | Settings display summaries expose decision-review text, packet path, and queue previews. |
| `npm run operational:hitl:reviewer-worksheet` | PASS | The current real reviewer worksheet reports `ready_for_human_review`, `targetDecisionInputsMissing=56`, and writes Markdown with no service writes. |
| `npm run test:operational-status-bundle` | PASS, 6/6 | The bundle summarizes the reviewer worksheet, includes JSON/Markdown paths, and adds `open_reviewer_worksheet` to operator actions. |
| `npm run test:vision-operational-hitl-display` | PASS, 28/28 | Settings display summaries expose reviewer worksheet text plus JSON/Markdown paths for UI rendering. |
| `npm run test:operational-status-bundle` | PASS, 6/6 | The bundle carries reviewer worksheet next-review cursor fields for queue, decision id, source template, and verification command. |
| `npm run test:vision-operational-hitl-display` | PASS, 28/28 | Settings display summaries expose the next-review cursor text, path, and command. |
| `npm run test:operational-status-bundle` | PASS, 6/6 | The bundle carries reviewer worksheet next-review slip title, first operator instruction, and no-write safety notice. |
| `npm run test:vision-operational-hitl-display` | PASS, 28/28 | Settings display summaries expose the next-review slip title, first instruction, and safety notice. |

## Known Gaps

- This change does not automatically approve, import, or promote Web HITL data into Graph/Reference/Model learning.
- The Settings UI displays preparation-run evidence but does not persist it as a separately restorable artifact state; the Operational Status Bundle itself remains the handoff source.
- The current reviewer worksheet is still a human-gated decision input aid; the remaining data-quality bottleneck is filling and validating the 56 missing target decisions before Common Agent learning handoff.
- Full build/type/security verification is recorded in the implementation handoff response for this task.
