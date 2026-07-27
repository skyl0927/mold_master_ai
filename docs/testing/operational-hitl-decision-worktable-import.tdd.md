# Operational HITL Decision Worktable Import TDD Evidence

## Source Plan

User goal continuation: reduce the remaining HITL data entry bottleneck by
closing the spreadsheet roundtrip from exported CSV worktables back into local
editable decision JSON files, while keeping Common Agent, Graph, Reference, and
model writes blocked.

## User Journeys

- As a HITL reviewer, I want to fill `newAction` and review fields in a CSV
  worktable, so that I do not have to hand-edit large JSON files for every row.
- As an operator, I want dry-run import by default, so that I can inspect planned
  JSON updates before any local editable file is changed.
- As a safety owner, I want unsupported actions, unknown decision ids, missing
  workspace evidence, and unedited exported rows to fail closed, so that
  accidental CSV contents cannot become approved learning data.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Edited CSV rows produce dry-run update plans without writing editable decision files. | `tests/operationalHitlDecisionWorktableImport.test.js` | unit | PASS | `npm run test:operational-hitl-worktable-import` |
| 2 | `--apply` writes only local editable decision JSON files and never service/Graph/model outputs. | `tests/operationalHitlDecisionWorktableImport.test.js` | unit | PASS | `status=applied`, `serviceWritesPerformed=false` |
| 3 | Unsupported actions and unknown decision ids block all writes. | `tests/operationalHitlDecisionWorktableImport.test.js` | unit | PASS | `invalid_worktable`, `localEditableWritesPerformed=false` |
| 4 | Exported read-only rows are ignored until `newAction` or explicit `action` is entered. | `tests/operationalHitlDecisionWorktableImport.test.js` | unit | PASS | `no_actionable_rows`, `plannedUpdates=0` |
| 5 | Current real unedited worktable remains no-op. | `npm run operational:hitl:worktable-import` | CLI smoke | PASS | output `no_actionable_rows`, `totalRows=59`, `plannedUpdates=0` |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlDecisionWorktableImport.test.js` failed
  with `MODULE_NOT_FOUND` for `../operationalHitlDecisionWorktableImport`.
- GREEN: `npm run test:operational-hitl-worktable-import` passed 5/5 tests after
  adding the import builder, CLI, and explicit `newAction` gating.

## Coverage And Gaps

Focused tests cover CSV parsing through the public builder, dry-run, explicit
apply, invalid worktable rows, missing evidence, and prevention of accidental
updates from unedited export rows. This does not execute queue-specific
`verify-decisions`; after import apply, the next required command is
`npm run operational:hitl:editable-preflight`.
