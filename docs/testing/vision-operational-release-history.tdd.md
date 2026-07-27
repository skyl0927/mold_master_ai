# Vision Operational Release History TDD Evidence

Date: 2026-07-27

## Scope

This phase keeps Vision operational release decisions as a small local ledger
instead of only retaining the latest imported report. The ledger records the
validated report, decision action, candidate and target versions, evidence
completeness, and whether a human operator confirmed the action.

The ledger is review evidence only. It does not activate, promote, roll back,
or fine-tune a model automatically.

## RED Evidence

- Commit `94fa662` added contract tests for
  `upsertVisionOperationalReleaseHistory()` and
  `summarizeVisionOperationalReleaseHistory()`.
- `npm run test:contracts` failed at compile time because those service exports
  did not exist yet. This was the intended RED signal.

## GREEN Evidence

- `vision-operational-release-history/v1` stores up to 50 canonical release
  entries and deduplicates by the release report identity.
- Importing a report and later attaching an operator decision updates the same
  history entry instead of creating a duplicate.
- Summary status distinguishes `no_history`, missing evidence, awaiting
  operator decision, and confirmed operator action.
- `saveVisionOperationalReleaseReport()` records the validated report into the
  history ledger after saving the current report.
- Settings displays release history counts and latest status.
- The transition JSON export includes both `operationalReleaseHistory` and
  `operationalReleaseHistorySummary`.

## Verification

- `npm run test:contracts`: 75 passed after the service implementation.
- `npx --no-install tsc --noEmit --pretty false`: passed after the Settings UI
  connection.
- `git diff --check`: passed with Windows CRLF conversion warnings only.
- `npm run build`: passed with stale Browserslist/Baseline data warnings.
- `npm run test:electron:transition`: passed. The smoke confirmed Settings shows
  the release history panel and the exported JSON contains one confirmed history
  entry with `latestStatus = confirmed`,
  `latestAction = restore_baseline_snapshot`, complete evidence, and zero
  console errors.

## Known Gaps

The current ledger is local renderer storage for operator continuity and export
evidence. Production multi-user authority still belongs in Common Agent or the
central database once real benchmark artifacts and Graph snapshots are produced.
