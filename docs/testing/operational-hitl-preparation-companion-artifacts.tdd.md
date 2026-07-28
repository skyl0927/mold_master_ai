# Operational HITL Preparation Companion Artifacts TDD

## Source Plan

Derived from the active Mold Master AI operational handoff plan. HITL preparation
commands may emit more than one useful artifact. In particular,
`knowledge:web:hitl:review-guide` now writes JSON plus Markdown and CSV reviewer
worksheets. The top-level preparation run manifest must not lose those companion
paths, because the next reviewer needs to know exactly which files to open.

## User Journeys

- As an operator resuming the project, I want the preparation run manifest to
  list every generated worksheet artifact, not only the primary JSON path.
- As a HITL reviewer, I want Web Knowledge Markdown and CSV worksheet paths to
  be visible from the single preparation-run report.
- As a safety owner, I want this tracking to remain no-write and never execute
  human-gated verification, apply, approval, Graph, or model-training commands.

## Task Report

| # | What is guaranteed | Test file or command | Type | Result | Evidence |
|---|--------------------|----------------------|------|--------|----------|
| 1 | Preparation run parses companion output paths from CLI JSON stdout. | `tests/operationalHitlPreparationRun.test.js` | unit | PASS | `npm run test:operational-hitl-prepare-run` |
| 2 | Companion worksheet paths are added to top-level `generatedArtifacts`. | `tests/operationalHitlPreparationRun.test.js` | manifest contract | PASS | Generated artifact count increases from 2 to 4 in fixture |
| 3 | Each executed command preserves `companionOutputPaths` for traceability. | `tests/operationalHitlPreparationRun.test.js` | trace contract | PASS | Web guide command records `.md` and `.csv` |
| 4 | Actual current prepare-run captures 9 generated artifacts including Web worksheet `.md` and `.csv`. | `npm run operational:hitl:prepare-run -- --execute` | operational smoke | PASS | `status=completed`, `generatedArtifactCount=9`, `serviceWritesPerformed=false` |

## RED/GREEN Evidence

- RED: `npm run test:operational-hitl-prepare-run` failed because
  `generatedArtifacts` contained only JSON `outputPath` values and omitted
  `markdownWorksheetPath` and `csvWorksheetPath`.
- GREEN: `npm run test:operational-hitl-prepare-run` passed after the run parser
  collected companion output paths and included them in the generated artifact
  manifest.

## Known Gaps

- This is artifact tracking only. Reviewers must still fill decision files and
  run the appropriate `verify-decisions` command before any apply/import step.
- Human-gated commands remain skipped by preparation run and are not executed
  by this feature.
