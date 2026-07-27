# Operational HITL Decision Worktable Export TDD Evidence

## Source Plan

User goal continuation: keep reducing the operational HITL/data gate so pending decisions can be reviewed, filled, verified, and later handed off to Common Agent/Graph gates.

## User Journeys

- As a HITL reviewer, I want a CSV and Markdown table of all editable decision rows, so that I can review the 59 pending items without manually navigating large JSON files.
- As an operator, I want the table to include queue, decision id, action, allowed actions, required fields, review focus, editable file path, and verification command, so that human input can be coordinated safely.
- As a safety owner, I want this export to be no-write and no-auto-verify, so that it cannot modify decisions or promote data.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Valid editable workspaces export decision rows as no-write CSV and Markdown worktables. | `tests/operationalHitlDecisionWorktableExport.test.js` | unit | PASS | `npm run test:operational-hitl-worktable-export` |
| 2 | Missing workspace evidence fails closed without CSV/Markdown payloads. | `tests/operationalHitlDecisionWorktableExport.test.js` | unit | PASS | `npm run test:operational-hitl-worktable-export` |
| 3 | Missing editable decision files produce blocked rows instead of throwing. | `tests/operationalHitlDecisionWorktableExport.test.js` | unit | PASS | `npm run test:operational-hitl-worktable-export` |
| 4 | The CLI exports the latest real workspace into CSV, Markdown, and manifest artifacts. | `npm run operational:hitl:worktable-export` | CLI smoke | PASS | output `ready_for_human_edit`, `decisionRowCount=59`, `pendingRowCount=59`, `queueCount=3` |

## RED/GREEN Evidence

- RED: `node --test tests\operationalHitlDecisionWorktableExport.test.js` failed with `MODULE_NOT_FOUND` for `../operationalHitlDecisionWorktableExport`.
- GREEN: `npm run test:operational-hitl-worktable-export` passed 3/3 tests after implementing the worktable builder and CLI.

## Coverage And Gaps

Focused tests cover row extraction, CSV/Markdown output, fail-closed behavior, and missing editable files. This does not close the HITL gate because all 59 current rows remain `pending`; it makes the human review surface clearer.
